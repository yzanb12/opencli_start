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
