const { parseWeiboHot, buildWeiboItem } = require('../../src/platforms/weibo');

const FIXTURE_HOT = [
  { rank: 1, title: '某明星结婚', heat: '4567890', url: 'https://s.weibo.com/weibo?q=%23某明星结婚%23' },
  { rank: 2, title: '国足比赛结果', heat: '3210987', url: 'https://s.weibo.com/weibo?q=%23国足比赛结果%23' },
];

const FIXTURE_SEARCH = [
  { text: '某明星今日宣布结婚，粉丝纷纷祝福！婚礼将于下月举行。' },
  { text: '看到某明星结婚的新闻，太突然了！' },
];

describe('parseWeiboHot', () => {
  test('returns empty array for empty input', () => {
    expect(parseWeiboHot([])).toEqual([]);
  });

  test('normalizes hot item fields', () => {
    const [item] = parseWeiboHot([FIXTURE_HOT[0]]);
    expect(item.rank).toBe(1);
    expect(item.title).toBe('某明星结婚');
    expect(item.url).toBe('https://s.weibo.com/weibo?q=%23某明星结婚%23');
    expect(item.meta.heat).toBe('4567890');
    expect(item.description).toBe('');
  });

  test('constructs fallback URL when url field absent', () => {
    const [item] = parseWeiboHot([{ rank: 1, title: '测试热搜', heat: '100' }]);
    expect(item.url).toContain('s.weibo.com');
  });
});

describe('buildWeiboItem', () => {
  test('builds description from search results', () => {
    const base = parseWeiboHot([FIXTURE_HOT[0]])[0];
    const result = buildWeiboItem(base, FIXTURE_SEARCH);
    expect(result.description).toContain('某明星今日宣布结婚');
  });

  test('returns base item when no search results', () => {
    const base = parseWeiboHot([FIXTURE_HOT[0]])[0];
    expect(buildWeiboItem(base, []).description).toBe('');
  });
});
