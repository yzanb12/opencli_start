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
        heat: String(item.heat || item.hot_value || ''),
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
