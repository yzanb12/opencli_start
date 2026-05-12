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
