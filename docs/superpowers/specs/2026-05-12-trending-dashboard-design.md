# Trending Dashboard — Design Spec

**Date:** 2026-05-12  
**Status:** Approved

## Overview

A local Node.js web server that aggregates trending content from four platforms (B站、知乎、Twitter/X、微博) using opencli, and serves a single-page dashboard where each item is clickable and includes a content description.

---

## Architecture

```
├── server.js        # Express server + data fetching + caching
├── public/
│   └── index.html   # Single-page frontend (vanilla HTML/CSS/JS)
└── package.json
```

**Runtime:** Node.js + Express. No frontend framework.  
**Port:** 3000 (overridable via `PORT` env var).

### Data Flow

1. Server starts → concurrently calls all 4 platform hot/trending commands (`--format json`)
2. For each trending item, concurrently fetches details (concurrency capped at 5 per platform)
3. Aggregated data stored in memory with `updatedAt` timestamp
4. `setInterval` triggers full re-fetch every 60 minutes
5. Frontend calls `GET /api/data` → receives JSON → renders cards
6. `GET /` serves `index.html`

---

## Data Fetching Strategy

| Platform | Hot List Command | Detail Fetch | Description Source |
|----------|-----------------|--------------|-------------------|
| B站 | `opencli bilibili hot --format json` | `opencli bilibili search "<title>" --limit 1` | 播放量 + 弹幕数 + 作者 + 搜索摘要 |
| 知乎 | `opencli zhihu hot --format json` | `opencli zhihu question <id>` | 问题描述 + 回答数 + 热度 |
| 推特/X | `opencli twitter trending --format json` | `opencli twitter search "<topic>" --limit 3` | 前3条推文内容摘要 + 推文总数 |
| 微博 | `opencli weibo hot --format json` | `opencli weibo search "<keyword>" --limit 3` | 热搜摘要 + 搜索结果摘要 |

**Concurrency:** 4 platforms fetched in parallel. Within each platform, detail requests are batched with `p-limit` (concurrency = 5).

**Error handling:**  
- If a platform's hot list fetch fails: that platform column shows an error state with last successful data (if any).  
- If an individual item's detail fetch fails: item still renders using base fields (title, heat, rank); description shows "暂无详情".  
- Errors do not block other platforms.

**Default item count:** 20 per platform (opencli default).

---

## Frontend Design

### Layout

- 4-column CSS Grid, one column per platform
- Columns collapse to 1 on mobile (≤768px), 2 on tablet (≤1200px)
- Fixed header bar with page title, last-updated time, and manual refresh button

### Item Card

Each trending item card contains:
- **Rank number** — large, styled in platform primary color
- **Title** — clickable link, opens original URL in new tab
- **Description** — 2–3 line excerpt, clamped with `line-clamp`; falls back to metadata if no detail available
- **Metadata tags** — platform-specific (play count, danmaku, heat score, tweet count, etc.)

### Platform Colors

| Platform | Primary Color | Usage |
|----------|--------------|-------|
| B站 | `#00A1D6` | Column header, rank numbers |
| 知乎 | `#0084FF` | Column header, rank numbers |
| 推特/X | `#000000` | Column header, rank numbers |
| 微博 | `#E6162D` | Column header, rank numbers |

### Loading & Error States

- Each platform column shows a **skeleton screen** (3 placeholder cards) while data is loading
- On fetch error: column shows error message + timestamp of last successful fetch
- Manual refresh button triggers `GET /api/data` and re-renders all columns

---

## API

### `GET /`
Returns `public/index.html`.

### `GET /api/data`
Returns cached trending data. Response shape:

```json
{
  "updatedAt": "2026-05-12T10:00:00.000Z",
  "platforms": {
    "bilibili": {
      "status": "ok",
      "updatedAt": "2026-05-12T10:00:00.000Z",
      "items": [
        {
          "rank": 1,
          "title": "...",
          "url": "https://...",
          "description": "...",
          "meta": { "play": "100万", "danmaku": "5000", "author": "..." }
        }
      ]
    },
    "zhihu": { "status": "ok", "items": [...] },
    "twitter": { "status": "ok", "items": [...] },
    "weibo": { "status": "ok", "items": [...] }
  }
}
```

If a platform failed: `"status": "error"`, `"error": "<message>"`, `"items": []` (or last cached items).

---

## Dependencies

```json
{
  "express": "^4.x",
  "p-limit": "^5.x"
}
```

---

## Constraints & Assumptions

- All opencli commands require browser cookies (user must be logged in to respective platforms via the opencli browser profile).
- The `--format json` output for each platform is assumed to include item IDs or URLs (e.g., bilibili bvid, zhihu question id) needed for detail fetches and link construction. If a field is absent, the item URL falls back to a search URL.
- Detail fetching adds latency; initial page load may take 30–60s while all detail requests complete. The frontend renders available data progressively per platform as each completes.
- No persistence: restart clears cache and triggers a fresh fetch.
- Twitter trending requires a logged-in Twitter/X account in the opencli browser profile.
