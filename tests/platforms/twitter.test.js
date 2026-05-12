const { parseTwitterTrending, buildTwitterItem } = require('../../src/platforms/twitter');

const FIXTURE_TRENDING = [
  { rank: 1, topic: '#AI', tweets: '125K', category: 'Technology' },
  { rank: 2, topic: 'OpenAI', tweets: '89.3K', category: 'Technology' },
];

const FIXTURE_SEARCH = [
  { text: 'AI is changing everything. New models released today.' },
  { text: 'The future of AI looks bright with recent developments.' },
  { text: 'OpenAI and Google compete in the AI space.' },
];

describe('parseTwitterTrending', () => {
  test('returns empty array for empty input', () => {
    expect(parseTwitterTrending([])).toEqual([]);
  });

  test('normalizes trending item fields', () => {
    const [item] = parseTwitterTrending([FIXTURE_TRENDING[0]]);
    expect(item.rank).toBe(1);
    expect(item.title).toBe('#AI');
    expect(item.url).toContain('twitter.com/search');
    expect(item.meta.tweets).toBe('125K');
    expect(item.meta.category).toBe('Technology');
    expect(item.description).toBe('');
  });
});

describe('buildTwitterItem', () => {
  test('builds description from search results', () => {
    const base = parseTwitterTrending([FIXTURE_TRENDING[0]])[0];
    const result = buildTwitterItem(base, FIXTURE_SEARCH);
    expect(result.description).toContain('AI is changing everything');
  });

  test('returns base item when no search results', () => {
    const base = parseTwitterTrending([FIXTURE_TRENDING[0]])[0];
    expect(buildTwitterItem(base, []).description).toBe('');
  });
});
