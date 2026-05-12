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
