/**
 * FixtureSearchProvider — deterministic demo search over a small corpus of clearly fake pages
 * (all under https://demo.invalid/). Used for UI development, tests and running without credentials.
 * Results are labelled isDemo=true; the app never substitutes this for a failed real search.
 */
import type { SearchOptions, SearchProvider, SearchResultSet } from './SearchProvider';
import { DEMO_PAGES, type DemoPage } from '../../../fixtures/demo/corpus';

const STOP = new Set(
  'a an the of for to in on and or with without is are be by from at as into about how what why who which when where do does can vs versus best top new my your our their it its this that these those'.split(
    ' ',
  ),
);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[-.]+|[-.]+$/g, ''))
    .filter((w) => w.length > 1 && !STOP.has(w));
}

export function scorePage(queryTokens: string[], page: DemoPage): number {
  const kw = new Set(page.keywords.flatMap((k) => tokenize(k)));
  const textTokens = new Set(tokenize(`${page.title} ${page.snippet}`));
  let score = 0;
  for (const tok of queryTokens) {
    if (kw.has(tok)) score += 3;
    else if (textTokens.has(tok)) score += 1;
  }
  return score;
}

export class FixtureSearchProvider implements SearchProvider {
  readonly name = 'fixture';
  readonly isDemo = true;

  constructor(private readonly pages: DemoPage[] = DEMO_PAGES) {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResultSet> {
    const tokens = tokenize(query);
    const scored = this.pages
      .map((p) => ({ p, score: scorePage(tokens, p) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id));
    const max = options.maxResults ?? 8;
    const items = scored.slice(0, max).map((x, i) => ({
      url: x.p.url,
      title: `[DEMO] ${x.p.title}`,
      snippet: x.p.snippet,
      position: i,
      providerMeta: { demo: true, matchScore: x.score, fixturePageId: x.p.id },
    }));
    const raw = { provider: 'fixture', demo: true, query, items };
    return {
      provider: this.name,
      query,
      items,
      rawText: JSON.stringify(raw),
      durationMs: 1,
      isDemo: true,
      meta: { demo: true },
    };
  }

  async healthCheck() {
    return { ok: true, message: `fixture search (${this.pages.length} demo pages)` };
  }
}
