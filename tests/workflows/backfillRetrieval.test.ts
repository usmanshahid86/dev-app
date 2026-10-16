import { describe, it, expect } from 'vitest';
import { makeCtx } from '../helpers';
import { createProject } from '@workflows/projects';
import { createRun } from '@workflows/runs';
import { planRetrievalBackfill, applyRetrievalBackfill } from '@workflows/backfillRetrieval';
import { newId, nowIso } from '@domain/ids';

/** Simulate a pre-tracking comparison: investigation retrieval null, query rows without failure_code, failure classes only in events. */
function legacyInvestigation(
  ctx: ReturnType<typeof makeCtx>,
  projectId: string,
  pattern: Array<'ok' | 'fail' | 'empty'>,
  eventCode: string | null,
) {
  const run = createRun(ctx, projectId, 'comparison', ['opp_a', 'opp_b'], {
    maxQueries: pattern.length,
    maxResultsPerQuery: 10,
    maxPageFetches: 0,
  });
  ctx.repos.updateRun(run.id, { status: 'partial', stage: 'done' });
  const inv = ctx.repos.createInvestigation({
    id: newId('investigation'),
    projectId,
    runId: run.id,
    kind: 'comparative',
    opportunityIds: ['opp_a', 'opp_b'],
    status: 'completed',
    comparison: [],
    comparisonSummary: '',
    retrieval: null,
    retrievalNote: null,
    candidateRetrieval: null,
    createdAt: nowIso(),
  });
  pattern.forEach((step, i) => {
    const q = ctx.repos.createQuery({
      id: newId('query'),
      projectId,
      runId: run.id,
      query: `q${i}`,
      family: 'investigation',
      purpose: `[${i % 2 === 0 ? 'opp_a' : 'opp_b'}] p`,
      provider: 'jevlin',
      status: step === 'fail' ? 'failed' : 'completed',
      failureCode: null,
      executedAt: nowIso(),
      durationMs: 1,
      resultCount: step === 'ok' ? 10 : step === 'empty' ? 0 : null,
      rawResponseId: null,
      error: step === 'fail' ? 'rate limit exceeded for this account' : null,
    });
    if (step === 'fail' && eventCode)
      ctx.telemetry.emit('search_failed', projectId, {
        runId: run.id,
        queryId: q.id,
        provider: 'jevlin',
        code: eventCode,
        action: 'retry',
      });
  });
  return { run, inv };
}

describe('historical retrieval backfill', () => {
  it('derives none/partial/complete from query rows and failure classes from events, and is idempotent', () => {
    const ctx = makeCtx();
    const p = createProject(ctx, {});
    const zero = legacyInvestigation(ctx, p.id, ['fail', 'fail', 'fail', 'fail'], 'rate_limited');
    const part = legacyInvestigation(ctx, p.id, ['ok', 'empty', 'fail', 'ok'], 'rate_limited');
    const full = legacyInvestigation(ctx, p.id, ['ok', 'ok'], null);
    const unknownFail = legacyInvestigation(ctx, p.id, ['ok', 'fail'], null);
    const plan = planRetrievalBackfill(ctx, p.id);
    expect(plan).toHaveLength(4);
    const by = Object.fromEntries(plan.map((c) => [c.investigationId, c]));
    expect(by[zero.inv.id]!.after).toMatchObject({
      status: 'partial',
      retrieval: 'none',
      retrievalNote: '0 of 4 searches executed: 4 rate-limited',
    });
    expect(by[zero.inv.id]!.after.candidateRetrieval).toEqual({
      opp_a: expect.objectContaining({ planned: 2, succeeded: 0, rateLimited: 2 }),
      opp_b: expect.objectContaining({ planned: 2, succeeded: 0, rateLimited: 2 }),
    });
    expect(by[zero.inv.id]!.derivation).toMatchObject({
      failureCodesFromRows: 0,
      failureCodesFromEvents: 4,
      unclassifiedFailures: 0,
    });
    expect(by[part.inv.id]!.after).toMatchObject({
      status: 'partial',
      retrieval: 'partial',
      retrievalNote: '3 of 4 searches executed: 1 returned no results, 1 rate-limited',
    });
    expect(by[full.inv.id]!.after).toMatchObject({
      status: 'completed',
      retrieval: 'complete',
      retrievalNote: '2 of 2 searches executed',
    });
    // a failure with no persisted class is counted as 'failed', never guessed as rate-limited
    expect(by[unknownFail.inv.id]!.after).toMatchObject({
      retrieval: 'partial',
      retrievalNote: '1 of 2 searches executed: 1 failed',
    });
    expect(by[unknownFail.inv.id]!.derivation.unclassifiedFailures).toBe(1);

    // preview wrote nothing
    expect(ctx.repos.getInvestigation(zero.inv.id)!.retrieval).toBeNull();
    const before = {
      findings: ctx.repos.listFindings(p.id).length,
      queries: ctx.repos.listQueries(p.id).length,
      events: ctx.repos.listEvents(p.id, 10000).length,
    };

    expect(applyRetrievalBackfill(ctx, plan)).toBe(4);
    const inv = ctx.repos.getInvestigation(zero.inv.id)!;
    expect(inv).toMatchObject({ status: 'partial', retrieval: 'none' });
    expect(ctx.repos.getInvestigation(full.inv.id)!).toMatchObject({
      status: 'completed',
      retrieval: 'complete',
    });
    // audit trail, nothing else touched
    const after = {
      findings: ctx.repos.listFindings(p.id).length,
      queries: ctx.repos.listQueries(p.id).length,
      events: ctx.repos.listEvents(p.id, 10000).length,
    };
    expect(after.findings).toBe(before.findings);
    expect(after.queries).toBe(before.queries);
    expect(after.events).toBe(before.events + 4);
    expect(ctx.repos.getRun(zero.run.id)!.status).toBe('partial'); // run row untouched
    expect(ctx.repos.listQueries(p.id).every((q) => q.failureCode === null)).toBe(true); // no invented metadata
    const audit = ctx.repos.listEvents(p.id, 10000).filter((e) => e.type === 'retrieval_backfilled');
    expect(audit).toHaveLength(4);
    expect(audit[0]!.payload).toMatchObject({
      before: expect.any(Object),
      after: expect.any(Object),
      derivation: expect.any(Object),
    });

    // idempotent: second plan is empty, second apply writes nothing
    expect(planRetrievalBackfill(ctx, p.id)).toEqual([]);
    expect(applyRetrievalBackfill(ctx, plan)).toBe(0);
    expect(ctx.repos.listEvents(p.id, 10000).filter((e) => e.type === 'retrieval_backfilled')).toHaveLength(
      4,
    );
  });
});
