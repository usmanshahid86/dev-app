/**
 * Shared search execution: persists planned queries, raw responses and normalized evidence.
 * Failures are recorded per query; a run with some failed queries completes as 'partial'.
 * Demo (fixture) results are never produced here as a fallback for a failed real search.
 */
import type { WorkflowContext } from './context';
import type { Evidence, QueryFamily, ResearchQuery, ResearchRun } from '@domain/types';
import { newId, nowIso } from '@domain/ids';
import { SearchProviderError } from '@providers/search/SearchProvider';

export interface PlannedQueryInput {
  query: string;
  family: QueryFamily;
  purpose: string;
}

export interface SearchExecutionResult {
  queries: ResearchQuery[];
  evidence: Evidence[];
  failed: number;
  /** Set when every query failed with a non-retryable provider error (e.g. login needed). */
  fatal?: { message: string; action: string };
}

const MIN_SNIPPET_CHARS = 20;

export async function executeQueries(
  ctx: WorkflowContext,
  run: ResearchRun,
  planned: PlannedQueryInput[],
  opts: {
    maxResultsPerQuery: number;
    /** Skip URLs already held as evidence in this project (default true). Validation sets false so fresh
     *  observations of a known page are recorded as NEW evidence rather than silently dropped. */
    dedupeAcrossProject?: boolean;
    onProgress?: (p: { completed: number; failed: number; evidence: number }) => void;
  },
): Promise<SearchExecutionResult> {
  const { repos, telemetry, providers } = ctx;
  const budgeted = planned.slice(0, run.budget.maxQueries);
  const queries: ResearchQuery[] = budgeted.map((p) =>
    repos.createQuery({
      id: newId('query'),
      projectId: run.projectId,
      runId: run.id,
      query: p.query,
      family: p.family,
      purpose: p.purpose,
      provider: providers.search.name,
      status: 'planned',
      executedAt: null,
      durationMs: null,
      resultCount: null,
      rawResponseId: null,
      error: null,
    }),
  );
  for (const q of queries)
    telemetry.emit('query_planned', run.projectId, {
      runId: run.id,
      queryId: q.id,
      family: q.family,
      query: q.query,
    });

  const allEvidence: Evidence[] = [];
  const seenUrls = new Set(
    opts.dedupeAcrossProject === false ? [] : repos.listEvidence(run.projectId).map((e) => e.url),
  );
  let completed = 0;
  let failed = 0;
  let lastFatal: SearchProviderError | null = null;

  for (const q of queries) {
    repos.updateQuery(q.id, { status: 'running' });
    try {
      const res = await providers.search.search(q.query, { maxResults: opts.maxResultsPerQuery });
      const rawId = newId('raw');
      repos.createRawResponse({ id: rawId, queryId: q.id, provider: res.provider, body: res.rawText });
      const retrievedAt = nowIso();
      const evidence: Evidence[] = [];
      for (const item of res.items) {
        if (!item.url || seenUrls.has(item.url)) continue;
        if ((item.snippet ?? '').length < MIN_SNIPPET_CHARS && !item.title) continue;
        seenUrls.add(item.url);
        evidence.push({
          id: newId('evidence'),
          projectId: run.projectId,
          queryId: q.id,
          url: item.url,
          title: item.title,
          snippet: item.snippet,
          position: item.position,
          providerMeta: item.providerMeta,
          provider: res.provider,
          retrievedAt,
          fullText: null,
          isDemo: res.isDemo,
        });
      }
      repos.createEvidence(evidence);
      allEvidence.push(...evidence);
      repos.updateQuery(q.id, {
        status: 'completed',
        executedAt: retrievedAt,
        durationMs: res.durationMs,
        resultCount: res.items.length,
        rawResponseId: rawId,
      });
      completed++;
      telemetry.emit('search_completed', run.projectId, {
        runId: run.id,
        queryId: q.id,
        provider: res.provider,
        resultCount: res.items.length,
        evidenceCount: evidence.length,
        durationMs: res.durationMs,
        isDemo: res.isDemo,
        costMicros: res.meta.costMicros ?? null,
      });
      for (const e of evidence)
        telemetry.emit('evidence_created', run.projectId, {
          evidenceId: e.id,
          queryId: q.id,
          url: e.url,
          isDemo: e.isDemo,
        });
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      repos.updateQuery(q.id, { status: 'failed', executedAt: nowIso(), error: message });
      telemetry.emit('search_failed', run.projectId, {
        runId: run.id,
        queryId: q.id,
        provider: providers.search.name,
        code: err instanceof SearchProviderError ? err.code : 'unknown',
        action: err instanceof SearchProviderError ? err.action : 'report',
      });
      if (
        err instanceof SearchProviderError &&
        !err.retryable &&
        ['login', 'connect', 'check_access'].includes(err.action)
      ) {
        lastFatal = err;
        // Credentials/registration problems will not fix themselves mid-run: stop spending queries.
        for (const rest of queries.slice(queries.indexOf(q) + 1)) {
          repos.updateQuery(rest.id, { status: 'failed', error: `skipped: ${err.action} required` });
          failed++;
        }
        break;
      }
    }
    opts.onProgress?.({ completed, failed, evidence: allEvidence.length });
  }
  return {
    queries: repos.listQueries(run.projectId, run.id),
    evidence: allEvidence,
    failed,
    fatal: lastFatal
      ? {
          message: (lastFatal as SearchProviderError).message,
          action: (lastFatal as SearchProviderError).action,
        }
      : undefined,
  };
}
