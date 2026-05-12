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
