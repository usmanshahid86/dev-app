import { describe, it, expect } from 'vitest';
import { makeCtx } from '../helpers';
import { createProject, projectSnapshot } from '@workflows/projects';
import { startDiscovery } from '@workflows/discovery';
import { startComparison, startDeepInvestigation, interleave } from '@workflows/investigation';
import { drain } from '@workflows/runs';
import { executeQueries } from '@workflows/search';
import { createRun } from '@workflows/runs';
import { FixtureSearchProvider } from '@providers/search/fixture';
import { SearchProviderError, type SearchProvider } from '@providers/search/SearchProvider';
import type { WorkflowContext } from '@workflows/context';

/** Search provider scripted per call: 'ok' | 'empty' | 'rate' | 'transport' | 'fatal'. Loops the script. */
function scripted(script: string[], retryAfterMs?: number): SearchProvider & { calls: string[] } {
  const base = new FixtureSearchProvider();
  let n = 0;
  const calls: string[] = [];
  return {
    name: 'scripted',
    isDemo: true,
    calls,
    healthCheck: async () => ({ ok: true, message: '' }),
    search: async (q, o) => {
      const step = script[n % script.length]!;
      n++;
      calls.push(q);
      if (step === 'ok') return base.search(q, o);
      if (step === 'empty') return { ...(await base.search('zzzz qqqq', o)), query: q };
      if (step === 'rate')
        throw new SearchProviderError(
          'rate limit exceeded',
          'scripted',
          'rate_limited',
          true,
          'retry',
          undefined,
          retryAfterMs,
        );
      if (step === 'transport')
        throw new SearchProviderError('timed out', 'scripted', 'timeout', true, 'retry');
      throw new SearchProviderError('login needed', 'scripted', 'unauthorized', false, 'login');
    },
  };
}

async function seededProject(ctx: WorkflowContext) {
  const p = createProject(ctx, {});
  startDiscovery(ctx, p.id);
  await drain();
  // A and B have themed investigation plans (2 queries each in the fixture); C has a generic 1-query plan.
  const opps = ctx.repos.listOpportunities(p.id);
  const pick = (needle: string) => opps.find((o) => o.title.toLowerCase().includes(needle))!.id;
  return { p, ids: [pick('portable project memory'), pick('metered billing'), pick('compliance')] };
}

const noSleep = async () => {};

describe('retrieval status: executeQueries', () => {
  const plan = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      query: `coding agent context ${i}`,
      family: 'investigation' as const,
      purpose: `q${i}`,
    }));

  it('classifies a fully successful run as complete', async () => {
    const ctx = makeCtx({ search: scripted(['ok']) });
    const p = createProject(ctx, {});
    const run = createRun(ctx, p.id, 'investigation', [], {
      maxQueries: 3,
      maxResultsPerQuery: 5,
      maxPageFetches: 0,
    });
    const r = await executeQueries(ctx, run, plan(3), { maxResultsPerQuery: 5, sleep: noSleep });
    expect(r.retrieval).toBe('complete');
    expect(r.outcomes).toMatchObject({
      planned: 3,
      succeeded: 3,
      succeededEmpty: 0,
      rateLimited: 0,
      skipped: 0,
    });
    expect(r.retrievalNote).toBe('3 of 3 searches executed');
  });

  it('a successful empty search counts as executed but yields no evidence', async () => {
    const ctx = makeCtx({ search: scripted(['empty']) });
    const p = createProject(ctx, {});
    const run = createRun(ctx, p.id, 'investigation', [], {
      maxQueries: 2,
      maxResultsPerQuery: 5,
      maxPageFetches: 0,
    });
    const r = await executeQueries(ctx, run, plan(2), { maxResultsPerQuery: 5, sleep: noSleep });
    expect(r.retrieval).toBe('complete');
    expect(r.outcomes).toMatchObject({ succeeded: 2, succeededEmpty: 2 });
    expect(r.evidence).toHaveLength(0);
    expect(r.retrievalNote).toMatch(/2 returned no results/);
    expect(r.queries.every((q) => q.status === 'completed' && q.resultCount === 0)).toBe(true);
  });

  it('zero successes → none, with per-class counts', async () => {
    const ctx = makeCtx({ search: scripted(['rate', 'transport']), config: { searchMaxRetriesPerQuery: 0 } });
    const p = createProject(ctx, {});
    const run = createRun(ctx, p.id, 'investigation', [], {
      maxQueries: 4,
      maxResultsPerQuery: 5,
      maxPageFetches: 0,
    });
    const r = await executeQueries(ctx, run, plan(4), { maxResultsPerQuery: 5, sleep: noSleep });
    expect(r.retrieval).toBe('none');
    expect(r.outcomes).toMatchObject({ succeeded: 0, rateLimited: 2, transportFailed: 2, skipped: 0 });
    expect(r.queries.map((q) => q.failureCode)).toEqual([
      'rate_limited',
      'transport',
      'rate_limited',
      'transport',
    ]);
  });

  it('honours retry_after_ms once per query within the wait budget', async () => {
    const waits: number[] = [];
    const ctx = makeCtx({
      search: scripted(['rate', 'ok'], 1500),
      config: { searchRetryBudgetMs: 10_000, searchMaxRetriesPerQuery: 1 },
    });
    const p = createProject(ctx, {});
    const run = createRun(ctx, p.id, 'investigation', [], {
      maxQueries: 3,
      maxResultsPerQuery: 5,
      maxPageFetches: 0,
    });
    const r = await executeQueries(ctx, run, plan(3), {
      maxResultsPerQuery: 5,
      sleep: async (ms) => void waits.push(ms),
    });
    expect(r.retrieval).toBe('complete');
    expect(waits).toEqual([1500, 1500, 1500]);
    expect(r.outcomes).toMatchObject({ succeeded: 3, retries: 3, waitedMs: 4500 });
    expect(ctx.repos.listEvents(p.id, 1000).filter((e) => e.type === 'search_retry')).toHaveLength(3);
  });

  it('marks remaining queries skipped when the wait budget is exhausted', async () => {
    const ctx = makeCtx({
      search: scripted(['rate'], 4000),
      config: { searchRetryBudgetMs: 5000, searchMaxRetriesPerQuery: 1 },
    });
    const p = createProject(ctx, {});
    const run = createRun(ctx, p.id, 'investigation', [], {
      maxQueries: 5,
      maxResultsPerQuery: 5,
      maxPageFetches: 0,
    });
    const r = await executeQueries(ctx, run, plan(5), { maxResultsPerQuery: 5, sleep: noSleep });
    // q0: refused, waits 4000 (budget 5000), refused again → failed. q1: refused, would need 4000 more → budget exhausted → q1 failed, q2..q4 skipped.
    expect(r.retrieval).toBe('none');
    expect(r.outcomes).toMatchObject({
      planned: 5,
      succeeded: 0,
      rateLimited: 2,
      skipped: 3,
      retries: 1,
      waitedMs: 4000,
    });
    expect(r.queries.map((q) => q.status)).toEqual(['failed', 'failed', 'skipped', 'skipped', 'skipped']);
    expect(r.queries[2]!.failureCode).toBe('retry_budget_exhausted');
    expect(r.retrievalNote).toMatch(/3 not attempted/);
  });

  it('partial success is partial', async () => {
    const ctx = makeCtx({ search: scripted(['ok', 'rate']), config: { searchMaxRetriesPerQuery: 0 } });
    const p = createProject(ctx, {});
    const run = createRun(ctx, p.id, 'investigation', [], {
      maxQueries: 4,
      maxResultsPerQuery: 5,
      maxPageFetches: 0,
    });
    const r = await executeQueries(ctx, run, plan(4), { maxResultsPerQuery: 5, sleep: noSleep });
    expect(r.retrieval).toBe('partial');
    expect(r.outcomes).toMatchObject({ succeeded: 2, rateLimited: 2 });
  });
});

describe('retrieval status: comparison', () => {
  it('round-robin interleaves candidate plans deterministically', () => {
    expect(
      interleave([
        ['a1', 'a2'],
        ['b1', 'b2'],
        ['c1', 'c2'],
      ]),
    ).toEqual(['a1', 'b1', 'c1', 'a2', 'b2', 'c2']);
    expect(interleave([['a1'], ['b1', 'b2'], []])).toEqual(['a1', 'b1', 'b2']);
  });

  it('zero-search comparison is partial, carries retrieval none, keeps findings but marks them inherited', async () => {
    const ctx = makeCtx();
    const { p, ids } = await seededProject(ctx);
    // swap in a refusing provider for the comparison only
    ctx.providers.search = scripted(['rate']);
    ctx.config.searchMaxRetriesPerQuery = 0;
    startComparison(ctx, p.id, ids);
    await drain();
    const snap = projectSnapshot(ctx, p.id);
    const inv = snap.investigations.find((i) => i.kind === 'comparative')!;
    const run = snap.runs.find((r) => r.id === inv.runId)!;
    expect(run.status).toBe('partial');
    expect(run.progress.retrieval).toBe('none');
    expect(run.progress.queryOutcomes).toMatchObject({ planned: 5, succeeded: 0, rateLimited: 5 });
    expect(inv.status).toBe('partial');
    expect(inv.retrieval).toBe('none');
    expect(inv.retrievalNote).toBe('0 of 5 searches executed: 5 rate-limited');
    expect(ids.map((id) => inv.candidateRetrieval![id]!.planned)).toEqual([2, 2, 1]);
    for (const id of ids) expect(inv.candidateRetrieval![id]).toMatchObject({ succeeded: 0 });
    expect(inv.comparison).toHaveLength(3); // partial results are retained
    const findings = snap.findings.filter((f) => f.investigationId === inv.id);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.retrievalOrigin === 'inherited' || f.retrievalOrigin === 'none')).toBe(
      true,
    );
    // inherited evidence may still be fetched and verified; its origin stays inherited
    expect(
      findings.some((f) => f.supportLevel.startsWith('full_page') && f.retrievalOrigin === 'inherited'),
    ).toBe(true);
  });

  it('a rate limit after the first query costs every candidate equally (no order bias)', async () => {
    const ctx = makeCtx();
    const { p, ids } = await seededProject(ctx);
    // interleaved order is A1,B1,C1,A2,B2 — the refusal from the 4th request on costs A and B one each, not C both.
    ctx.providers.search = scripted(['ok', 'ok', 'ok', 'rate', 'rate']);
    ctx.config.searchMaxRetriesPerQuery = 0;
    startComparison(ctx, p.id, ids);
    await drain();
    const inv = projectSnapshot(ctx, p.id).investigations.find((i) => i.kind === 'comparative')!;
    expect(inv.retrieval).toBe('partial');
    expect(ids.map((id) => inv.candidateRetrieval![id]!.succeeded)).toEqual([1, 1, 1]);
    expect(ids.map((id) => inv.candidateRetrieval![id]!.rateLimited)).toEqual([1, 1, 0]);
    expect(inv.status).toBe('partial');
  });

  it('a rate limit hitting only the first position still leaves every candidate with one search', async () => {
    const ctx = makeCtx();
    const { p, ids } = await seededProject(ctx);
    ctx.providers.search = scripted(['rate', 'ok', 'ok', 'ok', 'ok']);
    ctx.config.searchMaxRetriesPerQuery = 0;
    startComparison(ctx, p.id, ids);
    await drain();
    const inv = projectSnapshot(ctx, p.id).investigations.find((i) => i.kind === 'comparative')!;
    expect(ids.map((id) => inv.candidateRetrieval![id]!.succeeded)).toEqual([1, 2, 1]);
    expect(ids.every((id) => inv.candidateRetrieval![id]!.succeeded >= 1)).toBe(true);
    expect(inv.retrieval).toBe('partial');
  });

  it('fully successful comparison is completed with retrieval complete and new-origin findings', async () => {
    const ctx = makeCtx();
    const { p, ids } = await seededProject(ctx);
    startComparison(ctx, p.id, ids);
    await drain();
    const snap = projectSnapshot(ctx, p.id);
    const inv = snap.investigations.find((i) => i.kind === 'comparative')!;
    expect(inv.status).toBe('completed');
    expect(inv.retrieval).toBe('complete');
    const findings = snap.findings.filter((f) => f.investigationId === inv.id);
    expect(findings.every((f) => f.retrievalOrigin !== 'unknown')).toBe(true);
  });

  it('deep investigation with zero searches is partial but still produces a brief and recommendation', async () => {
    const ctx = makeCtx();
    const { p, ids } = await seededProject(ctx);
    ctx.providers.search = scripted(['rate']);
    ctx.config.searchMaxRetriesPerQuery = 0;
    startDeepInvestigation(ctx, p.id, ids[0]!);
    await drain();
    const snap = projectSnapshot(ctx, p.id);
    const inv = snap.investigations.find((i) => i.kind === 'deep')!;
    expect(inv.status).toBe('partial');
    expect(inv.retrieval).toBe('none');
    expect(snap.briefs).toHaveLength(1);
    expect(snap.decisions).toHaveLength(1);
    expect(snap.project.stage).toBe('DECISION_READY');
  });
});
