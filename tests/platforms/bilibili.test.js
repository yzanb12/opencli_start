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
