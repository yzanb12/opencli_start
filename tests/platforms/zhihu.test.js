const { parseZhihuHot, buildZhihuItem } = require('../../src/platforms/zhihu');

const FIXTURE_HOT = [
  { rank: 1, title: '如何评价人工智能的发展？', heat: '1234万热度', answers: 892, url: 'https://www.zhihu.com/question/12345678' },
  { rank: 2, title: '为什么编程很重要？', heat: '567万热度', answers: 312, url: 'https://www.zhihu.com/question/87654321' },
];

const FIXTURE_DETAIL = {
  title: '如何评价人工智能的发展？',
  description: '人工智能的发展涉及到算法创新、算力提升和数据积累三个核心要素，近年来取得了突破性进展。',
};

describe('parseZhihuHot', () => {
  test('returns empty array for empty input', () => {
    expect(parseZhihuHot([])).toEqual([]);
  });

  test('normalizes hot item fields', () => {
    const [item] = parseZhihuHot([FIXTURE_HOT[0]]);
    expect(item.rank).toBe(1);
    expect(item.title).toBe('如何评价人工智能的发展？');
    expect(item.url).toBe('https://www.zhihu.com/question/12345678');
    expect(item.meta.heat).toBe('1234万热度');
    expect(item.meta.answers).toBe(892);
    expect(item.description).toBe('');
  });

  test('constructs URL from id when url field absent', () => {
    const [item] = parseZhihuHot([{ rank: 1, title: '测试', heat: '1', answers: 1, id: '99999' }]);
    expect(item.url).toBe('https://www.zhihu.com/question/99999');
  });
});

describe('buildZhihuItem', () => {
  test('merges description from question detail', () => {
    const base = parseZhihuHot([FIXTURE_HOT[0]])[0];
    const result = buildZhihuItem(base, FIXTURE_DETAIL);
    expect(result.description).toBe('人工智能的发展涉及到算法创新、算力提升和数据积累三个核心要素，近年来取得了突破性进展。');
  });

  test('returns base item when no detail', () => {
    const base = parseZhihuHot([FIXTURE_HOT[0]])[0];
    expect(buildZhihuItem(base, null).description).toBe('');
  });
});
