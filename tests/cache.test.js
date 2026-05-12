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
