/**
 * Historical backfill of investigation retrieval status, derived ONLY from persisted facts:
 *   - research_queries rows of the investigation's run (status, result_count, failure_code, purpose)
 *   - search_failed events of that run (provider failure code), when a query row has no failure_code
 * Investigations that already carry a retrieval status are never touched (idempotent). Nothing is
 * deleted; findings, evidence, discoveries, queries and run rows are not modified. Each applied change
 * is recorded as a `retrieval_backfilled` event with before/after values.
 */
import type { WorkflowContext } from './context';
import type { Investigation, QueryOutcomes, RetrievalStatus } from '@domain/types';
import { describeOutcomes } from './search';

export interface BackfillChange {
  investigationId: string;
  runId: string;
  before: { status: Investigation['status']; retrieval: RetrievalStatus | null };
  after: {
    status: Investigation['status'];
    retrieval: RetrievalStatus;
    retrievalNote: string;
    candidateRetrieval: Record<string, QueryOutcomes>;
  };
  /** Which persisted facts the failure classes came from. */
  derivation: {
    queries: number;
    failureCodesFromRows: number;
    failureCodesFromEvents: number;
    unclassifiedFailures: number;
  };
}

export function planRetrievalBackfill(ctx: WorkflowContext, projectId?: string): BackfillChange[] {
  const { repos } = ctx;
  const projects = projectId ? [repos.getProject(projectId)].filter(Boolean) : repos.listProjects();
  const changes: BackfillChange[] = [];
  for (const p of projects) {
    for (const inv of repos.listInvestigations(p!.id)) {
      if (inv.retrieval !== null || !inv.runId) continue; // already tracked (or no run): leave alone
      const run = repos.getRun(inv.runId);
      if (!run) continue;
      const queries = repos.listQueries(p!.id, inv.runId);
      if (queries.length === 0) continue; // nothing persisted to derive from
      const eventCodes = new Map<string, string>();
      for (const e of repos.listEvents(p!.id, 50000)) {
        if (
          e.type === 'search_failed' &&
          e.payload.runId === inv.runId &&
          typeof e.payload.queryId === 'string'
        )
          eventCodes.set(e.payload.queryId, String(e.payload.code ?? ''));
      }
      let fromRows = 0,
        fromEvents = 0,
        unclassified = 0;
      const empty = (): QueryOutcomes => ({
        planned: 0,
        succeeded: 0,
        succeededEmpty: 0,
        rateLimited: 0,
        transportFailed: 0,
        otherFailed: 0,
        skipped: 0,
        retries: 0,
        waitedMs: 0,
      });
      const total = empty();
      const perCandidate: Record<string, QueryOutcomes> = {};
      for (const q of queries) {
        const cand = q.purpose.match(/^\[(opp_[a-z0-9]+)\]/)?.[1];
        const buckets = [total, ...(cand ? [(perCandidate[cand] ??= empty())] : [])];
        for (const b of buckets) b.planned++;
        if (q.status === 'completed') {
          for (const b of buckets) {
            b.succeeded++;
            if ((q.resultCount ?? 0) === 0) b.succeededEmpty++;
          }
        } else if (q.status === 'skipped') {
          for (const b of buckets) b.skipped++;
        } else if (q.status === 'failed') {
          let cls: 'rateLimited' | 'transportFailed' | 'otherFailed';
          const code = q.failureCode ?? eventCodes.get(q.id) ?? null;
          if (q.failureCode) fromRows++;
          else if (eventCodes.has(q.id)) fromEvents++;
          else unclassified++;
          if (code === 'rate_limited') cls = 'rateLimited';
          else if (
            code &&
            ['transport', 'timeout', 'spawn', 'no_envelope', 'no_provider_answer', 'network'].includes(code)
          )
            cls = 'transportFailed';
          else cls = 'otherFailed';
          for (const b of buckets) b[cls]++;
        }
      }
      const retrieval: RetrievalStatus =
        total.succeeded === 0 ? 'none' : total.succeeded < total.planned ? 'partial' : 'complete';
      const afterStatus: Investigation['status'] =
        inv.status === 'completed' && retrieval !== 'complete' ? 'partial' : inv.status;
      changes.push({
        investigationId: inv.id,
        runId: inv.runId,
        before: { status: inv.status, retrieval: inv.retrieval },
        after: {
          status: afterStatus,
          retrieval,
          retrievalNote: describeOutcomes(total),
          candidateRetrieval: perCandidate,
        },
        derivation: {
          queries: queries.length,
          failureCodesFromRows: fromRows,
          failureCodesFromEvents: fromEvents,
          unclassifiedFailures: unclassified,
        },
      });
    }
  }
  return changes;
}

export function applyRetrievalBackfill(ctx: WorkflowContext, changes: BackfillChange[]): number {
  let n = 0;
  for (const c of changes) {
    const inv = ctx.repos.getInvestigation(c.investigationId);
    if (!inv || inv.retrieval !== null) continue; // idempotent: re-running applies nothing
    ctx.repos.updateInvestigation(c.investigationId, {
      status: c.after.status,
      retrieval: c.after.retrieval,
      retrievalNote: c.after.retrievalNote,
      candidateRetrieval: c.after.candidateRetrieval,
    });
    ctx.telemetry.emit('retrieval_backfilled', inv.projectId, {
      investigationId: c.investigationId,
      runId: c.runId,
      before: c.before,
      after: c.after,
      derivation: c.derivation,
    });
    n++;
  }
  return n;
}
