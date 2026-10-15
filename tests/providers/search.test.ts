import { describe, it, expect } from 'vitest';
import { normalizeJevlin } from '@providers/search/jevlin';
import { FixtureSearchProvider, tokenize } from '@providers/search/fixture';
import { parseOutput } from '@providers/agent/structured';
import { AgentProviderError } from '@providers/agent/AgentProvider';
import { z } from 'zod';

describe('Jevlin normalization', () => {
  it('maps the merged list to provider-neutral items', () => {
    const env = {
      version: 1,
      command: 'search',
      ok: true,
      result: {
        chosen: 0,
        merged: [
          {
            url: 'https://a.example/x',
            title: 'A',
            snippet: 'alpha',
            found_by: ['serper'],
            found_in: [{ candidate: 0, citation: 0 }],
            best_rank: 0,
          },
          {
            url: 'https://b.example/y',
            title: '',
            snippet: 'beta',
            found_by: ['serper', 'exa'],
            best_rank: 2,
          },
          { url: '', title: 'dropped', snippet: 'no url' },
        ],
      },
    };
    const items = normalizeJevlin(env as any);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ url: 'https://a.example/x', title: 'A', snippet: 'alpha', position: 0 });
    expect(items[1]!.title).toBe('https://b.example/y');
    expect(items[1]!.providerMeta).toMatchObject({ foundBy: ['serper', 'exa'], bestRank: 2 });
  });
  it('falls back to the chosen candidate citations without a merged view', () => {
    const env = {
      version: 1,
      command: 'search',
      ok: true,
      result: {
        chosen: 1,
        candidates: [
          { citations: [] },
          { citations: [{ url: 'https://c.example', title: 'C', snippet: 's' }] },
        ],
      },
    };
    expect(normalizeJevlin(env as any)).toHaveLength(1);
  });
});

describe('Fixture search provider', () => {
  const p = new FixtureSearchProvider();
  it('is labelled demo and returns demo.invalid pages only', async () => {
    const res = await p.search('coding agent context handoff complaint');
    expect(p.isDemo).toBe(true);
    expect(res.isDemo).toBe(true);
    expect(res.items.length).toBeGreaterThan(0);
    for (const i of res.items) {
      expect(i.url.startsWith('https://demo.invalid/')).toBe(true);
      expect(i.title.startsWith('[DEMO]')).toBe(true);
    }
  });
  it('is deterministic', async () => {
    const a = await p.search('billing pricing incumbent');
    const b = await p.search('billing pricing incumbent');
    expect(a.items.map((i) => i.url)).toEqual(b.items.map((i) => i.url));
  });
  it('returns nothing for unrelated queries', async () => {
    const res = await p.search('zzzz qqqq');
    expect(res.items).toHaveLength(0);
  });
  it('tokenizes with stopwords removed', () => {
    expect(tokenize('How are the developers doing billing?')).toEqual(['developers', 'doing', 'billing']);
  });
});

describe('structured output parsing', () => {
  const schema = z.object({ a: z.number() });
  it('accepts objects and fenced JSON strings', () => {
    expect(parseOutput('x', schema, { a: 1 })).toEqual({ a: 1 });
    expect(parseOutput('x', schema, '```json\n{"a": 2}\n```')).toEqual({ a: 2 });
  });
  it('raises malformed_output on bad shapes', () => {
    expect(() => parseOutput('x', schema, { a: 'no' })).toThrow(AgentProviderError);
    expect(() => parseOutput('x', schema, 'not json')).toThrow(AgentProviderError);
  });
});
