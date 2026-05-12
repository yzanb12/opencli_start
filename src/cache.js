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
