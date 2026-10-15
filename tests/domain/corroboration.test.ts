import { describe, it, expect } from 'vitest';
import { computeCorroboration } from '@domain/corroboration';
import { ev } from './lineage.test';
import type { EvidenceDiscovery } from '@domain/types';

const disc = (evidenceId: string, queryId: string): EvidenceDiscovery => ({
  id: `disc_${evidenceId}_${queryId}`,
  projectId: 'p',
  evidenceId,
  queryId,
  runId: 'r',
  position: 0,
  provider: 'fixture',
  providerMeta: null,
  url: '',
  retrievedAt: 'now',
});

describe('corroboration', () => {
  it('counts the same canonical page once but preserves its discoveries', () => {
    const e = ev('e1', {
      canonicalUrl: 'https://a.example/x',
      domain: 'a.example',
      category: 'forum_community',
    });
    const c = computeCorroboration([e], [disc('e1', 'q1'), disc('e1', 'q2'), disc('e1', 'q3')]);
    expect(c).toMatchObject({ evidenceCount: 1, canonicalSources: 1, domains: 1, discoveries: 3 });
    expect(c.summary).toMatch(/single source/);
  });
  it('counts independent domains and aggregates categories', () => {
    const list = [
      ev('e1', { canonicalUrl: 'https://a.example/1', domain: 'a.example', category: 'forum_community' }),
      ev('e2', { canonicalUrl: 'https://b.example/2', domain: 'b.example', category: 'issue_tracker' }),
      ev('e3', { canonicalUrl: 'https://c.example/pricing', domain: 'c.example', category: 'pricing' }),
      ev('e4', {
        canonicalUrl: 'https://a.example/3',
        domain: 'a.example',
        category: 'forum_community',
        fetchStatus: 'fetched',
      }),
    ];
    const c = computeCorroboration(list, []);
    expect(c).toMatchObject({
      evidenceCount: 4,
      canonicalSources: 4,
      domains: 3,
      distinctSourceTypes: 3,
      firstParty: 1,
      thirdParty: 3,
      fetchedPages: 1,
    });
    expect(c.categoryMix).toEqual({ forum_community: 2, issue_tracker: 1, pricing: 1 });
    expect(c.summary).toMatch(/3 independent source types/);
    expect(c.summary).toMatch(/mix of first-party and third-party/);
  });
  it('flags single-domain and first-party-only evidence', () => {
    const list = [
      ev('e1', { domain: 'v.example', category: 'pricing', canonicalUrl: 'https://v.example/p' }),
      ev('e2', { domain: 'v.example', category: 'official_docs', canonicalUrl: 'https://v.example/d' }),
    ];
    const c = computeCorroboration(list, []);
    expect(c.summary).toMatch(/all from one domain/);
    expect(c.summary).toMatch(/first-party sources only/);
  });
  it('introduces no composite score', () => {
    const c = computeCorroboration([ev('e1')], []);
    expect(Object.keys(c).some((k) => /score|rating/i.test(k))).toBe(false);
    expect(Object.values(c).every((v) => typeof v !== 'number' || Number.isInteger(v))).toBe(true);
  });
});
