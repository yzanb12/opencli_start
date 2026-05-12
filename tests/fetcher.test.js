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
