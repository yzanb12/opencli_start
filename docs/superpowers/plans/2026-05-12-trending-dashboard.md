# Trending Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js Express server that aggregates trending content from B站、知乎、Twitter/X、微博 via opencli, caches data in memory, refreshes hourly, and serves a 4-column clickable dashboard with per-item descriptions.

**Architecture:** Single Express process with in-memory cache. Four platform modules each call opencli commands (hot list + per-item detail fetches with concurrency capped at 5). `setInterval` triggers full re-fetch every 60 minutes. Frontend fetches `/api/data` and renders skeletons then real cards.

**Tech Stack:** Node.js 18+, Express 4.x, p-limit 3.x, Jest 29.x

---

## File Structure

```
package.json
.gitignore
server.js                      # Express app entry + scheduler
src/
  cache.js                     # In-memory cache (get/set/error per platform)
  fetcher.js                   # Runs all 4 platforms concurrently
  exec.js                      # Promise wrapper around child_process.exec
  platforms/
    bilibili.js                # bilibili hot + search detail + normalization
    zhihu.js                   # zhihu hot + question detail + normalization
    twitter.js                 # twitter trending + search detail + normalization
    weibo.js                   # weibo hot + search detail + normalization
public/
  index.html                   # Single-page dashboard (vanilla HTML/CSS/JS)
tests/
  fixtures/                    # JSON snapshots from opencli probe (Task 1)
  cache.test.js
  fetcher.test.js
  platforms/
    bilibili.test.js
    zhihu.test.js
    twitter.test.js
    weibo.test.js
```

---

### Task 1: Project setup + probe opencli JSON formats

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `tests/fixtures/` (4 snapshot files)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "trending-dashboard",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.2",
    "p-limit": "^3.1.0"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors

- [ ] **Step 3: Create .gitignore**

```
node_modules/
```

- [ ] **Step 4: Create directory structure**

Run: `mkdir -p src/platforms public tests/fixtures tests/platforms`

- [ ] **Step 5: Probe opencli JSON formats**

Run each command and save output as test fixtures:

```bash
opencli bilibili hot --format json --limit 3 > tests/fixtures/bilibili-hot.json
opencli zhihu hot --format json --limit 3 > tests/fixtures/zhihu-hot.json
opencli twitter trending --format json --limit 3 > tests/fixtures/twitter-trending.json
opencli weibo hot --format json --limit 3 > tests/fixtures/weibo-hot.json
```

Inspect each file:

```bash
cat tests/fixtures/bilibili-hot.json
cat tests/fixtures/zhihu-hot.json
cat tests/fixtures/twitter-trending.json
cat tests/fixtures/weibo-hot.json
```

**Note the exact field names.** Documented columns: bilibili (rank, title, author, play, danmaku), zhihu (rank, title, heat, answers), twitter (rank, topic, tweets, category), weibo (rank + likely title/heat). The JSON may include bonus fields like `url`, `bvid`, or `id` — note these for Tasks 4–7, which use them for link construction and detail fetching. If field names differ from what the test code assumes, update the constants in the test files accordingly before running.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore tests/fixtures/
git commit -m "feat: project setup and opencli JSON fixtures"
```

---

### Task 2: Exec wrapper

**Files:**
- Create: `src/exec.js`

- [ ] **Step 1: Create exec.js**

```js
// src/exec.js
const { exec } = require('child_process');

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Command failed: ${cmd}\n${stderr || err.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

module.exports = { runCommand };
```

- [ ] **Step 2: Commit**

```bash
git add src/exec.js
git commit -m "feat: add exec wrapper"
```

---

### Task 3: Cache module

**Files:**
- Create: `tests/cache.test.js`
- Create: `src/cache.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/cache.test.js
const { Cache } = require('../src/cache');

describe('Cache', () => {
  let cache;
  beforeEach(() => { cache = new Cache(); });

  test('get returns null for unknown key', () => {
    expect(cache.get('bilibili')).toBeNull();
  });

  test('set and get round-trip', () => {
    const data = [{ rank: 1, title: 'test' }];
    cache.set('bilibili', data);
    expect(cache.get('bilibili')).toEqual(data);
  });

  test('set stores updatedAt timestamp', () => {
    const before = Date.now();
    cache.set('zhihu', []);
    const after = Date.now();
    const entry = cache.getEntry('zhihu');
    expect(entry.updatedAt).toBeGreaterThanOrEqual(before);
    expect(entry.updatedAt).toBeLessThanOrEqual(after);
  });

  test('getAll returns all 4 platforms with correct shape', () => {
    cache.set('bilibili', [{ rank: 1 }]);
    cache.setError('zhihu', 'timeout');
    const all = cache.getAll();
    expect(all.bilibili).toEqual({ status: 'ok', items: [{ rank: 1 }], updatedAt: expect.any(Number) });
    expect(all.zhihu).toEqual({ status: 'error', error: 'timeout', items: [], updatedAt: expect.any(Number) });
    expect(all.twitter).toEqual({ status: 'empty', items: [] });
    expect(all.weibo).toEqual({ status: 'empty', items: [] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/cache.test.js`
Expected: FAIL — "Cannot find module '../src/cache'"

- [ ] **Step 3: Implement cache.js**

```js
// src/cache.js
class Cache {
  constructor() {
    this._store = {};
  }

  set(platform, items) {
    this._store[platform] = { items, updatedAt: Date.now(), error: null };
  }

  setError(platform, error) {
    this._store[platform] = { items: null, updatedAt: Date.now(), error: String(error) };
  }

  get(platform) {
    const entry = this._store[platform];
    return entry ? entry.items : null;
  }

  getEntry(platform) {
    return this._store[platform] || null;
  }

  getAll() {
    const platforms = ['bilibili', 'zhihu', 'twitter', 'weibo'];
    const result = {};
    for (const p of platforms) {
      const entry = this._store[p];
      if (!entry) {
        result[p] = { status: 'empty', items: [] };
      } else if (entry.error) {
        result[p] = { status: 'error', error: entry.error, items: [], updatedAt: entry.updatedAt };
      } else {
        result[p] = { status: 'ok', items: entry.items, updatedAt: entry.updatedAt };
      }
    }
    return result;
  }
}

module.exports = { Cache };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/cache.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/cache.js tests/cache.test.js
git commit -m "feat: add in-memory cache module"
```

---

### Task 4: Bilibili platform module

**Files:**
- Create: `tests/platforms/bilibili.test.js`
- Create: `src/platforms/bilibili.js`

Documented columns: `rank, title, author, play, danmaku`. The JSON may also include `bvid` or `url` — check `tests/fixtures/bilibili-hot.json` from Task 1 and update `FIXTURE_HOT` below if needed.

- [ ] **Step 1: Write failing tests**

```js
// tests/platforms/bilibili.test.js
const { parseBilibiliHot, buildBilibiliItem } = require('../../src/platforms/bilibili');

const FIXTURE_HOT = [
  { rank: 1, title: '测试视频标题', author: 'UP主', play: '123万', danmaku: '5678', bvid: 'BV1GJ411x7h7' },
  { rank: 2, title: '第二个视频', author: '另一个UP', play: '88万', danmaku: '3210', bvid: 'BV1xx411c7mD' },
];

const FIXTURE_SEARCH_RESULT = {
  title: '测试视频标题',
  description: '这是一个关于测试的视频，内容很精彩',
  url: 'https://www.bilibili.com/video/BV1GJ411x7h7',
};

describe('parseBilibiliHot', () => {
  test('returns empty array for empty input', () => {
    expect(parseBilibiliHot([])).toEqual([]);
  });

  test('normalizes hot item fields', () => {
    const [item] = parseBilibiliHot([FIXTURE_HOT[0]]);
    expect(item.rank).toBe(1);
    expect(item.title).toBe('测试视频标题');
    expect(item.url).toBe('https://www.bilibili.com/video/BV1GJ411x7h7');
    expect(item.meta.author).toBe('UP主');
    expect(item.meta.play).toBe('123万');
    expect(item.meta.danmaku).toBe('5678');
    expect(item.description).toBe('');
  });

  test('falls back to search URL when no bvid', () => {
    const [item] = parseBilibiliHot([{ rank: 1, title: '无bvid视频', author: 'x', play: '1', danmaku: '0' }]);
    expect(item.url).toContain('search.bilibili.com');
  });
});

describe('buildBilibiliItem', () => {
  test('merges description from search result', () => {
    const base = parseBilibiliHot([FIXTURE_HOT[0]])[0];
    const result = buildBilibiliItem(base, FIXTURE_SEARCH_RESULT);
    expect(result.description).toBe('这是一个关于测试的视频，内容很精彩');
  });

  test('returns base item unchanged when no search result', () => {
    const base = parseBilibiliHot([FIXTURE_HOT[0]])[0];
    expect(buildBilibiliItem(base, null).description).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/platforms/bilibili.test.js`
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Implement bilibili.js**

```js
// src/platforms/bilibili.js
const pLimit = require('p-limit');
const { runCommand } = require('../exec');

function parseBilibiliHot(items) {
  return items.map(item => ({
    rank: item.rank,
    title: item.title,
    url: item.bvid
      ? `https://www.bilibili.com/video/${item.bvid}`
      : `https://search.bilibili.com/all?keyword=${encodeURIComponent(item.title)}`,
    description: '',
    meta: {
      author: item.author || '',
      play: item.play || '',
      danmaku: item.danmaku || '',
    },
  }));
}

function buildBilibiliItem(base, searchResult) {
  if (!searchResult) return base;
  return { ...base, description: searchResult.description || '' };
}

async function fetchDetail(item, run) {
  try {
    const query = item.title.replace(/"/g, '');
    const raw = await run(`opencli bilibili search "${query}" --format json --limit 1`);
    const results = JSON.parse(raw);
    return buildBilibiliItem(item, results[0] || null);
  } catch {
    return item;
  }
}

async function fetchHot({ run = runCommand, limit = 20 } = {}) {
  const raw = await run(`opencli bilibili hot --format json --limit ${limit}`);
  const items = parseBilibiliHot(JSON.parse(raw));
  const limiter = pLimit(5);
  return Promise.all(items.map(item => limiter(() => fetchDetail(item, run))));
}

module.exports = { parseBilibiliHot, buildBilibiliItem, fetchHot };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/platforms/bilibili.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/platforms/bilibili.js tests/platforms/bilibili.test.js
git commit -m "feat: add bilibili platform module"
```

---

### Task 5: Zhihu platform module

**Files:**
- Create: `tests/platforms/zhihu.test.js`
- Create: `src/platforms/zhihu.js`

Documented columns: `rank, title, heat, answers`. Check `tests/fixtures/zhihu-hot.json` for `id` or `url` fields — the detail fetch uses `opencli zhihu question <id>`. Update `FIXTURE_HOT` below if field names differ.

- [ ] **Step 1: Write failing tests**

```js
// tests/platforms/zhihu.test.js
const { parseZhihuHot, buildZhihuItem } = require('../../src/platforms/zhihu');

const FIXTURE_HOT = [
  { rank: 1, title: '如何评价人工智能的发展？', heat: '1234万热度', answers: 892, id: '12345678', url: 'https://www.zhihu.com/question/12345678' },
  { rank: 2, title: '为什么编程很重要？', heat: '567万热度', answers: 312, id: '87654321', url: 'https://www.zhihu.com/question/87654321' },
];

const FIXTURE_DETAIL = {
  title: '如何评价人工智能的发展？',
  description: '人工智能的发展涉及到算法创新、算力提升和数据积累三个核心要素，近年来取得了突破性进展。',
};

describe('parseZhihuHot', () => {
  test('returns empty array for empty input', () => {
    expect(parseZhihuHot([])).toEqual([]);
  });

  test('normalizes hot item fields', () => {
    const [item] = parseZhihuHot([FIXTURE_HOT[0]]);
    expect(item.rank).toBe(1);
    expect(item.title).toBe('如何评价人工智能的发展？');
    expect(item.url).toBe('https://www.zhihu.com/question/12345678');
    expect(item.meta.heat).toBe('1234万热度');
    expect(item.meta.answers).toBe(892);
    expect(item.description).toBe('');
  });

  test('constructs URL from id when url field absent', () => {
    const [item] = parseZhihuHot([{ rank: 1, title: '测试', heat: '1', answers: 1, id: '99999' }]);
    expect(item.url).toBe('https://www.zhihu.com/question/99999');
  });
});

describe('buildZhihuItem', () => {
  test('merges description from question detail', () => {
    const base = parseZhihuHot([FIXTURE_HOT[0]])[0];
    const result = buildZhihuItem(base, FIXTURE_DETAIL);
    expect(result.description).toBe('人工智能的发展涉及到算法创新、算力提升和数据积累三个核心要素，近年来取得了突破性进展。');
  });

  test('returns base item when no detail', () => {
    const base = parseZhihuHot([FIXTURE_HOT[0]])[0];
    expect(buildZhihuItem(base, null).description).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/platforms/zhihu.test.js`
Expected: FAIL

- [ ] **Step 3: Implement zhihu.js**

```js
// src/platforms/zhihu.js
const pLimit = require('p-limit');
const { runCommand } = require('../exec');

function parseZhihuHot(items) {
  return items.map(item => {
    const url = item.url ||
      (item.id ? `https://www.zhihu.com/question/${item.id}` :
        `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(item.title)}`);
    return {
      rank: item.rank,
      title: item.title,
      url,
      description: '',
      meta: {
        heat: item.heat || '',
        answers: item.answers || 0,
      },
    };
  });
}

function buildZhihuItem(base, detail) {
  if (!detail) return base;
  return { ...base, description: detail.description || '' };
}

function extractId(item) {
  if (item.id) return String(item.id);
  const match = item.url && item.url.match(/question\/(\d+)/);
  return match ? match[1] : null;
}

async function fetchDetail(item, run) {
  const id = extractId(item);
  if (!id) return item;
  try {
    const raw = await run(`opencli zhihu question ${id} --format json`);
    return buildZhihuItem(item, JSON.parse(raw));
  } catch {
    return item;
  }
}

async function fetchHot({ run = runCommand, limit = 20 } = {}) {
  const raw = await run(`opencli zhihu hot --format json --limit ${limit}`);
  const items = parseZhihuHot(JSON.parse(raw));
  const limiter = pLimit(5);
  return Promise.all(items.map(item => limiter(() => fetchDetail(item, run))));
}

module.exports = { parseZhihuHot, buildZhihuItem, fetchHot };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/platforms/zhihu.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/platforms/zhihu.js tests/platforms/zhihu.test.js
git commit -m "feat: add zhihu platform module"
```

---

### Task 6: Twitter platform module

**Files:**
- Create: `tests/platforms/twitter.test.js`
- Create: `src/platforms/twitter.js`

Documented columns: `rank, topic, tweets, category`. Detail uses `opencli twitter search "<topic>" --limit 3`. Check `tests/fixtures/twitter-trending.json` and update `FIXTURE_TRENDING` if field names differ.

- [ ] **Step 1: Write failing tests**

```js
// tests/platforms/twitter.test.js
const { parseTwitterTrending, buildTwitterItem } = require('../../src/platforms/twitter');

const FIXTURE_TRENDING = [
  { rank: 1, topic: '#AI', tweets: '125K', category: 'Technology' },
  { rank: 2, topic: 'OpenAI', tweets: '89.3K', category: 'Technology' },
];

const FIXTURE_SEARCH = [
  { text: 'AI is changing everything. New models released today.' },
  { text: 'The future of AI looks bright with recent developments.' },
  { text: 'OpenAI and Google compete in the AI space.' },
];

describe('parseTwitterTrending', () => {
  test('returns empty array for empty input', () => {
    expect(parseTwitterTrending([])).toEqual([]);
  });

  test('normalizes trending item fields', () => {
    const [item] = parseTwitterTrending([FIXTURE_TRENDING[0]]);
    expect(item.rank).toBe(1);
    expect(item.title).toBe('#AI');
    expect(item.url).toContain('twitter.com/search');
    expect(item.meta.tweets).toBe('125K');
    expect(item.meta.category).toBe('Technology');
    expect(item.description).toBe('');
  });
});

describe('buildTwitterItem', () => {
  test('builds description from search results', () => {
    const base = parseTwitterTrending([FIXTURE_TRENDING[0]])[0];
    const result = buildTwitterItem(base, FIXTURE_SEARCH);
    expect(result.description).toContain('AI is changing everything');
  });

  test('returns base item when no search results', () => {
    const base = parseTwitterTrending([FIXTURE_TRENDING[0]])[0];
    expect(buildTwitterItem(base, []).description).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/platforms/twitter.test.js`
Expected: FAIL

- [ ] **Step 3: Implement twitter.js**

```js
// src/platforms/twitter.js
const pLimit = require('p-limit');
const { runCommand } = require('../exec');

function parseTwitterTrending(items) {
  return items.map(item => ({
    rank: item.rank,
    title: item.topic,
    url: `https://twitter.com/search?q=${encodeURIComponent(item.topic)}`,
    description: '',
    meta: {
      tweets: item.tweets || '',
      category: item.category || '',
    },
  }));
}

function buildTwitterItem(base, searchResults) {
  if (!searchResults || searchResults.length === 0) return base;
  const description = searchResults
    .slice(0, 3)
    .map(t => t.text || t.content || '')
    .filter(Boolean)
    .join(' / ');
  return { ...base, description };
}

async function fetchDetail(item, run) {
  try {
    const query = item.title.replace(/"/g, '');
    const raw = await run(`opencli twitter search "${query}" --format json --limit 3`);
    const results = JSON.parse(raw);
    return buildTwitterItem(item, Array.isArray(results) ? results : []);
  } catch {
    return item;
  }
}

async function fetchHot({ run = runCommand, limit = 20 } = {}) {
  const raw = await run(`opencli twitter trending --format json --limit ${limit}`);
  const items = parseTwitterTrending(JSON.parse(raw));
  const limiter = pLimit(5);
  return Promise.all(items.map(item => limiter(() => fetchDetail(item, run))));
}

module.exports = { parseTwitterTrending, buildTwitterItem, fetchHot };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/platforms/twitter.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/platforms/twitter.js tests/platforms/twitter.test.js
git commit -m "feat: add twitter platform module"
```

---

### Task 7: Weibo platform module

**Files:**
- Create: `tests/platforms/weibo.test.js`
- Create: `src/platforms/weibo.js`

Check `tests/fixtures/weibo-hot.json` — field name for the keyword may be `title`, `keyword`, or `word`. Update `FIXTURE_HOT` below accordingly.

- [ ] **Step 1: Write failing tests**

```js
// tests/platforms/weibo.test.js
const { parseWeiboHot, buildWeiboItem } = require('../../src/platforms/weibo');

const FIXTURE_HOT = [
  { rank: 1, title: '某明星结婚', heat: '4567890', url: 'https://s.weibo.com/weibo?q=%23某明星结婚%23' },
  { rank: 2, title: '国足比赛结果', heat: '3210987', url: 'https://s.weibo.com/weibo?q=%23国足比赛结果%23' },
];

const FIXTURE_SEARCH = [
  { text: '某明星今日宣布结婚，粉丝纷纷祝福！婚礼将于下月举行。' },
  { text: '看到某明星结婚的新闻，太突然了！' },
];

describe('parseWeiboHot', () => {
  test('returns empty array for empty input', () => {
    expect(parseWeiboHot([])).toEqual([]);
  });

  test('normalizes hot item fields', () => {
    const [item] = parseWeiboHot([FIXTURE_HOT[0]]);
    expect(item.rank).toBe(1);
    expect(item.title).toBe('某明星结婚');
    expect(item.url).toBe('https://s.weibo.com/weibo?q=%23某明星结婚%23');
    expect(item.meta.heat).toBe('4567890');
    expect(item.description).toBe('');
  });

  test('constructs fallback URL when url field absent', () => {
    const [item] = parseWeiboHot([{ rank: 1, title: '测试热搜', heat: '100' }]);
    expect(item.url).toContain('s.weibo.com');
  });
});

describe('buildWeiboItem', () => {
  test('builds description from search results', () => {
    const base = parseWeiboHot([FIXTURE_HOT[0]])[0];
    const result = buildWeiboItem(base, FIXTURE_SEARCH);
    expect(result.description).toContain('某明星今日宣布结婚');
  });

  test('returns base item when no search results', () => {
    const base = parseWeiboHot([FIXTURE_HOT[0]])[0];
    expect(buildWeiboItem(base, []).description).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/platforms/weibo.test.js`
Expected: FAIL

- [ ] **Step 3: Implement weibo.js**

```js
// src/platforms/weibo.js
const pLimit = require('p-limit');
const { runCommand } = require('../exec');

function parseWeiboHot(items) {
  return items.map(item => {
    const title = item.title || item.keyword || item.word || '';
    const url = item.url ||
      `https://s.weibo.com/weibo?q=${encodeURIComponent('#' + title + '#')}`;
    return {
      rank: item.rank,
      title,
      url,
      description: '',
      meta: {
        heat: String(item.heat || ''),
      },
    };
  });
}

function buildWeiboItem(base, searchResults) {
  if (!searchResults || searchResults.length === 0) return base;
  const description = searchResults
    .slice(0, 2)
    .map(t => t.text || t.content || t.title || '')
    .filter(Boolean)
    .join(' / ');
  return { ...base, description };
}

async function fetchDetail(item, run) {
  try {
    const query = item.title.replace(/"/g, '');
    const raw = await run(`opencli weibo search "${query}" --format json --limit 3`);
    const results = JSON.parse(raw);
    return buildWeiboItem(item, Array.isArray(results) ? results : []);
  } catch {
    return item;
  }
}

async function fetchHot({ run = runCommand, limit = 20 } = {}) {
  const raw = await run(`opencli weibo hot --format json --limit ${limit}`);
  const items = parseWeiboHot(JSON.parse(raw));
  const limiter = pLimit(5);
  return Promise.all(items.map(item => limiter(() => fetchDetail(item, run))));
}

module.exports = { parseWeiboHot, buildWeiboItem, fetchHot };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/platforms/weibo.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/platforms/weibo.js tests/platforms/weibo.test.js
git commit -m "feat: add weibo platform module"
```

---

### Task 8: Fetcher orchestrator

**Files:**
- Create: `tests/fetcher.test.js`
- Create: `src/fetcher.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/fetcher.test.js
const { fetchAll } = require('../src/fetcher');

describe('fetchAll', () => {
  test('returns all 4 platforms with ok status', async () => {
    const mockFetchers = {
      bilibili: jest.fn().mockResolvedValue([{ rank: 1, title: 'b' }]),
      zhihu:    jest.fn().mockResolvedValue([{ rank: 1, title: 'z' }]),
      twitter:  jest.fn().mockResolvedValue([{ rank: 1, title: 't' }]),
      weibo:    jest.fn().mockResolvedValue([{ rank: 1, title: 'w' }]),
    };
    const result = await fetchAll(mockFetchers);
    expect(result.bilibili).toEqual({ status: 'ok', items: [{ rank: 1, title: 'b' }] });
    expect(result.zhihu).toEqual({ status: 'ok', items: [{ rank: 1, title: 'z' }] });
    expect(result.twitter).toEqual({ status: 'ok', items: [{ rank: 1, title: 't' }] });
    expect(result.weibo).toEqual({ status: 'ok', items: [{ rank: 1, title: 'w' }] });
  });

  test('returns error status for failed platform without blocking others', async () => {
    const mockFetchers = {
      bilibili: jest.fn().mockRejectedValue(new Error('browser timeout')),
      zhihu:    jest.fn().mockResolvedValue([{ rank: 1, title: 'z' }]),
      twitter:  jest.fn().mockResolvedValue([]),
      weibo:    jest.fn().mockResolvedValue([]),
    };
    const result = await fetchAll(mockFetchers);
    expect(result.bilibili.status).toBe('error');
    expect(result.bilibili.error).toBe('browser timeout');
    expect(result.bilibili.items).toEqual([]);
    expect(result.zhihu.status).toBe('ok');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/fetcher.test.js`
Expected: FAIL

- [ ] **Step 3: Implement fetcher.js**

```js
// src/fetcher.js
const bilibili = require('./platforms/bilibili');
const zhihu    = require('./platforms/zhihu');
const twitter  = require('./platforms/twitter');
const weibo    = require('./platforms/weibo');

const DEFAULT_FETCHERS = {
  bilibili: () => bilibili.fetchHot(),
  zhihu:    () => zhihu.fetchHot(),
  twitter:  () => twitter.fetchHot(),
  weibo:    () => weibo.fetchHot(),
};

async function fetchPlatform(name, fn) {
  try {
    const items = await fn();
    return [name, { status: 'ok', items }];
  } catch (err) {
    return [name, { status: 'error', error: err.message, items: [] }];
  }
}

async function fetchAll(fetchers = DEFAULT_FETCHERS) {
  const entries = await Promise.all(
    Object.entries(fetchers).map(([name, fn]) => fetchPlatform(name, fn))
  );
  return Object.fromEntries(entries);
}

module.exports = { fetchAll };
```

- [ ] **Step 4: Run all tests**

Run: `npx jest`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/fetcher.js tests/fetcher.test.js
git commit -m "feat: add fetcher orchestrator"
```

---

### Task 9: Express server

**Files:**
- Create: `server.js`

- [ ] **Step 1: Create server.js**

```js
// server.js
const express = require('express');
const path = require('path');
const { Cache } = require('./src/cache');
const { fetchAll } = require('./src/fetcher');

const app = express();
const cache = new Cache();
const PORT = process.env.PORT || 3000;
const REFRESH_INTERVAL = 60 * 60 * 1000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/data', (req, res) => {
  const platforms = cache.getAll();
  const timestamps = Object.values(platforms).map(p => p.updatedAt || 0);
  const updatedAt = timestamps.length ? Math.max(...timestamps) : null;
  res.json({ updatedAt, platforms });
});

async function refresh() {
  console.log('[refresh] Fetching all platforms...');
  const results = await fetchAll();
  for (const [platform, result] of Object.entries(results)) {
    if (result.status === 'ok') {
      cache.set(platform, result.items);
    } else {
      cache.setError(platform, result.error);
    }
  }
  console.log('[refresh] Done.');
}

app.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);
  await refresh();
  setInterval(refresh, REFRESH_INTERVAL);
});
```

- [ ] **Step 2: Verify server starts**

Run: `node server.js`
Expected: prints "Server running at http://localhost:3000" then "[refresh] Fetching all platforms..."

Stop with Ctrl+C after seeing the refresh message.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add express server with hourly refresh"
```

---

### Task 10: Frontend

**Files:**
- Create: `public/index.html`

- [ ] **Step 1: Create index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>热榜聚合</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; }

    header {
      background: #fff;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #e0e0e0;
      position: sticky;
      top: 0;
      z-index: 10;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }
    header h1 { font-size: 18px; font-weight: 700; }
    #updated-at { font-size: 12px; color: #999; }
    #refresh-btn {
      background: #333; color: #fff; border: none;
      padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;
    }
    #refresh-btn:hover { background: #555; }
    #refresh-btn:disabled { background: #aaa; cursor: not-allowed; }

    main {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      padding: 20px;
      max-width: 1600px;
      margin: 0 auto;
    }
    @media (max-width: 1200px) { main { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 768px)  { main { grid-template-columns: 1fr; } }

    .platform-col { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .platform-header {
      padding: 13px 16px; font-weight: 700; font-size: 15px;
      color: #fff; display: flex; align-items: center; gap: 8px;
    }
    .platform-header.bilibili { background: #00A1D6; }
    .platform-header.zhihu    { background: #0084FF; }
    .platform-header.twitter  { background: #000; }
    .platform-header.weibo    { background: #E6162D; }

    .item-list { padding: 4px 0; }
    .item {
      display: block; padding: 10px 16px;
      border-bottom: 1px solid #f0f0f0;
      text-decoration: none; color: inherit; transition: background 0.15s;
    }
    .item:last-child { border-bottom: none; }
    .item:hover { background: #fafafa; }

    .item-inner { display: flex; align-items: flex-start; gap: 10px; }
    .rank { font-size: 16px; font-weight: 800; min-width: 22px; line-height: 1.4; }
    .rank.top3 { font-size: 19px; }
    .bilibili .rank { color: #00A1D6; }
    .zhihu    .rank { color: #0084FF; }
    .twitter  .rank { color: #000; }
    .weibo    .rank { color: #E6162D; }

    .item-body { flex: 1; min-width: 0; }
    .item-title { font-size: 13px; font-weight: 600; line-height: 1.45; margin-bottom: 3px; }
    .item-desc {
      font-size: 12px; color: #666; line-height: 1.5;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .item-meta { margin-top: 4px; display: flex; gap: 8px; flex-wrap: wrap; }
    .meta-tag { font-size: 11px; color: #aaa; }

    .skeleton .sk-line {
      background: #eee; border-radius: 4px; animation: pulse 1.2s infinite;
    }
    .sk-title { height: 13px; width: 80%; margin-bottom: 5px; }
    .sk-desc  { height: 11px; width: 55%; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.45} }

    .error-state { padding: 20px 16px; text-align: center; color: #aaa; font-size: 13px; line-height: 1.6; }
  </style>
</head>
<body>
  <header>
    <h1>热榜聚合</h1>
    <div style="display:flex;align-items:center;gap:12px">
      <span id="updated-at">加载中…</span>
      <button id="refresh-btn" onclick="loadData()">刷新</button>
    </div>
  </header>
  <main id="grid"></main>

  <script>
    const PLATFORMS = [
      { key: 'bilibili', name: 'B站热门',  icon: '📺' },
      { key: 'zhihu',   name: '知乎热榜',  icon: '💬' },
      { key: 'twitter', name: '推特趋势',  icon: '🐦' },
      { key: 'weibo',   name: '微博热搜',  icon: '🔥' },
    ];

    function esc(s) {
      return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function skeletonCol(p) {
      const rows = Array.from({length: 6}, (_,i) => `
        <div class="item skeleton">
          <div class="item-inner">
            <span class="rank ${i<3?'top3':''}">${i+1}</span>
            <div class="item-body">
              <div class="sk-line sk-title"></div>
              <div class="sk-line sk-desc"></div>
            </div>
          </div>
        </div>`).join('');
      return `<div class="platform-col" id="col-${p.key}">
        <div class="platform-header ${p.key}">${p.icon} ${p.name}</div>
        <div class="item-list">${rows}</div>
      </div>`;
    }

    function renderItem(item) {
      const meta = Object.values(item.meta||{}).filter(Boolean)
        .map(v=>`<span class="meta-tag">${esc(v)}</span>`).join('');
      return `<a class="item" href="${esc(item.url)}" target="_blank" rel="noopener">
        <div class="item-inner">
          <span class="rank ${item.rank<=3?'top3':''}">${item.rank}</span>
          <div class="item-body">
            <div class="item-title">${esc(item.title)}</div>
            ${item.description ? `<div class="item-desc">${esc(item.description)}</div>` : ''}
            ${meta ? `<div class="item-meta">${meta}</div>` : ''}
          </div>
        </div>
      </a>`;
    }

    function renderCol(p, data) {
      const col = document.getElementById(`col-${p.key}`);
      if (!col) return;
      const list = col.querySelector('.item-list');
      if (data.status === 'error') {
        list.innerHTML = `<div class="error-state">⚠️ 加载失败<br><small>${esc(data.error||'')}</small></div>`;
      } else if (!data.items || !data.items.length) {
        list.innerHTML = `<div class="error-state">暂无数据</div>`;
      } else {
        list.innerHTML = data.items.map(renderItem).join('');
      }
    }

    function formatTime(ts) {
      if (!ts) return '—';
      return new Date(ts).toLocaleString('zh-CN', { hour12: false });
    }

    async function loadData() {
      const btn = document.getElementById('refresh-btn');
      btn.disabled = true; btn.textContent = '加载中…';
      try {
        const { updatedAt, platforms } = await fetch('/api/data').then(r => r.json());
        document.getElementById('updated-at').textContent = `更新于 ${formatTime(updatedAt)}`;
        PLATFORMS.forEach(p => { if (platforms[p.key]) renderCol(p, platforms[p.key]); });
      } catch {
        document.getElementById('updated-at').textContent = '加载失败';
      } finally {
        btn.disabled = false; btn.textContent = '刷新';
      }
    }

    document.getElementById('grid').innerHTML = PLATFORMS.map(skeletonCol).join('');
    loadData();
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add public/index.html
git commit -m "feat: add dashboard frontend"
```

---

### Task 11: Final integration

- [ ] **Step 1: Run all unit tests**

Run: `npx jest`
Expected: All tests PASS

- [ ] **Step 2: Start the server**

Run: `node server.js`
Expected: "Server running at http://localhost:3000" followed by "[refresh] Fetching all platforms..."

- [ ] **Step 3: Open and verify the dashboard**

Open http://localhost:3000 in a browser.
Expected:
- 4-column grid with skeleton cards appears immediately
- After 30–60 seconds, cards populate with real content from each platform
- Each card title is a clickable link that opens in a new tab
- Each card shows metadata tags (play count, heat, tweet count, etc.)
- Cards with descriptions show 2-line clamped text below the title

- [ ] **Step 4: Verify API response shape**

Run: `curl -s http://localhost:3000/api/data | python3 -m json.tool | head -40`
Expected: JSON containing `updatedAt` (number), `platforms.bilibili`, `platforms.zhihu`, `platforms.twitter`, `platforms.weibo` each with `status`, `items`, `updatedAt`

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat: trending dashboard complete"
```
