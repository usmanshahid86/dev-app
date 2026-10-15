import { describe, it, expect } from 'vitest';
import { classifySource, isFirstParty } from '@domain/sourceCategory';

describe('source classification', () => {
  const cases: Array<[string, string]> = [
    ['https://github.com/org/repo/issues/42', 'issue_tracker'],
    ['https://github.com/org/repo', 'repository'],
    ['https://github.com/org/repo/releases/tag/v1', 'changelog'],
    ['https://vendor.com/pricing', 'pricing'],
    ['https://vendor.com/changelog', 'changelog'],
    ['https://docs.vendor.com/api', 'official_docs'],
    ['https://www.reddit.com/r/devops/comments/abc', 'forum_community'],
    ['https://news.ycombinator.com/item?id=1', 'forum_community'],
    ['https://x.com/someone/status/1', 'social'],
    ['https://techcrunch.com/2026/01/02/story', 'news'],
    ['https://arxiv.org/abs/2601.00001', 'research_benchmark'],
    ['https://marketplace.visualstudio.com/items?itemName=x', 'marketplace'],
    ['https://www.g2.com/products/x/reviews', 'review'],
    ['https://www.federalregister.gov/documents/1', 'regulatory_government'],
    ['https://medium.com/@me/post', 'blog'],
    ['https://example.com/', 'other'],
  ];
  for (const [url, cat] of cases) it(`${url} → ${cat}`, () => expect(classifySource(url).category).toBe(cat));
  it('reports low confidence for other', () => {
    expect(classifySource('https://example.com/').confidence).toBe('low');
  });
  it('uses the title only as a weak hint', () => {
    expect(classifySource('https://example.com/page', 'Acme pricing plans')).toMatchObject({
      category: 'pricing',
      confidence: 'medium',
    });
  });
  it('first-party categories are vendor-published ones', () => {
    expect(isFirstParty('pricing')).toBe(true);
    expect(isFirstParty('forum_community')).toBe(false);
  });
});
