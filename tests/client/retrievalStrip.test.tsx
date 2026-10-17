// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { describePages, describeFindings } from '@client/components/RetrievalStrip';
import { describeAgentCost } from '@client/components/RunStatus';
import { retrievalBanner } from '@export/markdown';
import {
  ResearchRun as RunSchema,
  Finding as FindingSchema,
  type ResearchRun,
  type Finding,
} from '@domain/types';

const run = (progress: Partial<ResearchRun['progress']>, maxPageFetches = 8): ResearchRun =>
  RunSchema.parse({
    id: 'run_x',
    projectId: 'p',
    kind: 'investigation',
    targetIds: [],
    status: 'completed',
    stage: 'done',
    budget: { maxQueries: 8, maxResultsPerQuery: 20, maxPageFetches },
    searchProvider: 'jevlin',
    agentProvider: 'claude-cli',
    progress: {
      queriesPlanned: 8,
      queriesCompleted: 8,
      queriesFailed: 0,
      evidenceCount: 0,
      signalCount: 0,
      ...progress,
    },
    error: null,
    createdAt: 'now',
    updatedAt: 'now',
  });
const finding = (supportLevel: Finding['supportLevel']): Finding =>
  FindingSchema.parse({
    id: 'f',
    projectId: 'p',
    investigationId: 'i',
    section: 's',
    claim: 'c',
    kind: supportLevel === 'inference' ? 'inference' : 'sourced_fact',
    supportStrength: 'medium',
    evidenceIds: [],
    supportLevel,
    createdAt: 'now',
  });

describe('retrieval detail lines', () => {
  it('mixed fetch outcomes are shown as counts, separately from search execution', () => {
    expect(
      describePages(
        run({ retrieval: 'complete', pageFetchesSelected: 8, pageFetchesCompleted: 4, pageFetchesFailed: 4 }),
      ),
    ).toBe('pages: 4 of 8 selected pages read, 4 failed');
    expect(
      describePages(
        run({
          retrieval: 'complete',
          pageFetchesSelected: 3,
          pageFetchesCompleted: 3,
          pageFetchesSuppressed: 1,
        }),
      ),
    ).toBe('pages: 3 of 3 selected pages read, 1 excluded by fetch policy');
  });
  it('historical records without fetch instrumentation read as unknown, not zero', () => {
    expect(describePages(run({ retrieval: null, pageFetchesSelected: 0 }))).toMatch(
      /unknown \(run predates fetch tracking\)/,
    );
    expect(describePages(null)).toMatch(/unknown/);
    // V0.1 runs (fetch counters but no retrieval tracking) still read their counts
    expect(
      describePages(
        run({ retrieval: null, pageFetchesSelected: 3, pageFetchesCompleted: 2, pageFetchesFailed: 1 }),
      ),
    ).toBe('pages: 2 of 3 selected pages read, 1 failed');
    expect(describePages(run({ retrieval: 'complete' }, 0))).toMatch(/does not fetch pages/);
  });
  it('finding support distribution', () => {
    expect(
      describeFindings([
        finding('full_page_excerpt_verified'),
        finding('full_page_excerpt_verified'),
        finding('snippet_only'),
        finding('inference'),
      ]),
    ).toBe('findings: 2 full page, excerpt verified · 1 search snippet only · 1 model inference');
    expect(describeFindings(undefined)).toBe('findings: unknown');
    expect(describeFindings([])).toBe('findings: none');
  });
  it('agent cost keeps three categories apart and labels CLI figures as not billed', () => {
    expect(describeAgentCost(null)).toMatch(/unknown \(run predates/);
    const s = describeAgentCost({
      calls: 3,
      cliReportedUsd: 0.21,
      cliReportedCalls: 2,
      estimatedUsd: 0.05,
      estimatedCalls: 1,
      unknownCalls: 0,
      pricingVersion: '2026-09-25',
    });
    expect(s).toMatch(/CLI-reported API-equivalent \$0\.210 \(2 calls; not billed expenditure/);
    expect(s).toMatch(/estimated \$0\.050 from tokens \(1 call, price table 2026-09-25\)/);
    expect(s).not.toMatch(/total/);
    expect(
      describeAgentCost({
        calls: 2,
        cliReportedUsd: null,
        cliReportedCalls: 0,
        estimatedUsd: null,
        estimatedCalls: 0,
        unknownCalls: 2,
        pricingVersion: null,
      }),
    ).toMatch(/2 calls with unknown cost/);
  });
  it('export banner carries the same three lines', () => {
    const md = retrievalBanner(
      { retrieval: 'complete', retrievalNote: '8 of 8 searches executed' },
      run({ retrieval: 'complete', pageFetchesSelected: 8, pageFetchesCompleted: 4, pageFetchesFailed: 4 }),
      [finding('full_page'), finding('inference')],
    );
    expect(md).toContain('> Fresh retrieval complete — 8 of 8 searches executed.');
    expect(md).toContain(
      'searches: 8 of 8 searches executed · pages: 4 of 8 selected pages read, 4 failed · findings: 1 full page read · 1 model inference',
    );
    expect(retrievalBanner(undefined, undefined, [])).toContain(
      'pages: unknown (run record not available) · findings: none',
    );
  });
});
