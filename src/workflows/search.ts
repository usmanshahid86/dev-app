/**
 * Shared search execution: persists planned queries, raw responses, canonical sources (evidence rows)
 * and every discovery relationship. A source found by three queries is ONE evidence row with THREE
 * evidence_discoveries rows. Failures are recorded per query; a run with some failed queries completes
 * as 'partial'. Demo (fixture) results are never produced here as a fallback for a failed real search.
 */
import type { WorkflowContext } from './context';
import type {
  Evidence,
  EvidenceDiscovery,
  QueryFamily,
  QueryOutcomes,
  ResearchQuery,
  ResearchRun,
  RetrievalStatus,
} from '@domain/types';
import { newId, nowIso } from '@domain/ids';
import { canonicalizeUrl } from '@domain/canonicalUrl';
import { classifySource } from '@domain/sourceCategory';
import { SearchProviderError } from '@providers/search/SearchProvider';

export interface PlannedQueryInput {
  query: string;
  family: QueryFamily;
  purpose: string;
}

export interface SearchExecutionResult {
  /** Execution status of the planned searches (independent of how much evidence they produced). */
  retrieval: RetrievalStatus;
  outcomes: QueryOutcomes;
  /** Human-readable one-liner, e.g. "0 of 6 searches executed: 6 rate-limited". */
  retrievalNote: string;
  queries: ResearchQuery[];
  /** Every evidence row touched by this run (newly created + rediscovered), deduplicated. */
  evidence: Evidence[];
  /** Only the evidence rows created by this run. */
  newEvidence: Evidence[];
  discoveries: EvidenceDiscovery[];
  failed: number;
  /** Set when a non-retryable provider error (e.g. login needed) stopped the run. */
  fatal?: { message: string; action: string };
}

export async function executeQueries(
  ctx: WorkflowContext,
  run: ResearchRun,
  planned: PlannedQueryInput[],
  opts: {
    maxResultsPerQuery: number;
    onProgress?: (p: { completed: number; failed: number; evidence: number }) => void;
    /** Test hook: replaces the real wait between retries. */
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<SearchExecutionResult> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const retryBudgetMs = ctx.config.searchRetryBudgetMs;
  const maxRetries = ctx.config.searchMaxRetriesPerQuery;
  const defaultWaitMs = ctx.config.searchDefaultRetryWaitMs;
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
      failureCode: null,
    }),
  );
  for (const q of queries)
    telemetry.emit('query_planned', run.projectId, {
      runId: run.id,
      queryId: q.id,
      family: q.family,
      query: q.query,
    });

  const touched = new Map<string, Evidence>();
  const created: Evidence[] = [];
  const discoveries: EvidenceDiscovery[] = [];
  let completed = 0;
  let failed = 0;
  let lastFatal: SearchProviderError | null = null;
  const outcomes: QueryOutcomes = {
    planned: queries.length,
    succeeded: 0,
    succeededEmpty: 0,
    rateLimited: 0,
    transportFailed: 0,
    otherFailed: 0,
    skipped: 0,
    retries: 0,
    waitedMs: 0,
  };
  let waitedMs = 0;
  const skipRest = (from: number, code: string, why: string) => {
    for (const rest of queries.slice(from)) {
      repos.updateQuery(rest.id, { status: 'skipped', failureCode: code, error: `skipped: ${why}` });
      outcomes.skipped++;
      failed++;
    }
  };

  /**
   * Bounded retry/wait policy for retryable failures: honour retry_after_ms (or a default wait)
   * while the run's wait budget lasts; at most `maxRetries` retries per query. Returns the result
   * or throws the final error. Sets `budgetExhausted` when a retry was wanted but not affordable.
   */
  const searchWithRetry = async (q: ResearchQuery) => {
    let attempt = 0;
    for (;;) {
      try {
        return await providers.search.search(q.query, { maxResults: opts.maxResultsPerQuery });
      } catch (err) {
        const retryable = err instanceof SearchProviderError && err.retryable;
        if (!retryable || attempt >= maxRetries) throw err;
        const wantMs = (err as SearchProviderError).retryAfterMs ?? defaultWaitMs;
        if (waitedMs + wantMs > retryBudgetMs) {
          (err as SearchProviderError & { budgetExhausted?: boolean }).budgetExhausted = true;
          throw err;
        }
        attempt++;
        outcomes.retries++;
        waitedMs += wantMs;
        outcomes.waitedMs = waitedMs;
        telemetry.emit('search_retry', run.projectId, {
          runId: run.id,
          queryId: q.id,
          attempt,
          waitMs: wantMs,
          code: (err as SearchProviderError).code,
        });
        await sleep(wantMs);
      }
    }
  };

  for (const [qi, q] of queries.entries()) {
    if (q.status === 'skipped') continue;
    repos.updateQuery(q.id, { status: 'running' });
    try {
      const res = await searchWithRetry(q);
      const rawId = newId('raw');
      repos.createRawResponse({ id: rawId, queryId: q.id, provider: res.provider, body: res.rawText });
      const retrievedAt = nowIso();
      let newCount = 0;
      let rediscovered = 0;
      let dropped = 0;
      for (const item of res.items) {
        const canon = item.url ? canonicalizeUrl(item.url) : null;
        if (!canon) {
          dropped++;
          continue;
        }
        let ev =
          touched.get(canon.canonicalUrl) ?? repos.getEvidenceByCanonical(run.projectId, canon.canonicalUrl);
        const isNew = !ev;
        if (!ev) {
          const cls = classifySource(item.url, item.title);
          ev = {
            id: newId('evidence'),
            projectId: run.projectId,
            queryId: q.id,
            url: item.url,
            canonicalUrl: canon.canonicalUrl,
            domain: canon.domain,
            title: item.title,
            snippet: item.snippet,
            position: item.position,
            providerMeta: item.providerMeta,
            provider: res.provider,
            retrievedAt,
            fullText: null,
            isDemo: res.isDemo,
            category: cls.category,
            categoryConfidence: cls.confidence,
            fetchStatus: 'snippet_only',
            finalUrl: null,
            httpStatus: null,
            contentType: null,
            pageTitle: null,
            textTruncated: false,
            textChars: null,
            textHash: null,
            fetchedAt: null,
            fetchError: null,
            fetchRunId: null,
          };
          repos.createEvidence([ev]);
          created.push(ev);
          newCount++;
          telemetry.emit('source_canonicalized', run.projectId, {
            evidenceId: ev.id,
            url: item.url,
            canonicalUrl: canon.canonicalUrl,
            domain: canon.domain,
            category: cls.category,
            categoryConfidence: cls.confidence,
            rule: cls.rule,
          });
          telemetry.emit('evidence_created', run.projectId, {
            evidenceId: ev.id,
            queryId: q.id,
            url: ev.url,
            isDemo: ev.isDemo,
          });
        } else {
          rediscovered++;
          // Keep the richer snippet if this discovery has one and the page was never fetched.
          if (ev.fetchStatus === 'snippet_only' && item.snippet.length > ev.snippet.length + 40) {
            repos.updateEvidence(ev.id, { snippet: item.snippet });
            ev = { ...ev, snippet: item.snippet };
          }
          telemetry.emit('source_rediscovered', run.projectId, {
            evidenceId: ev.id,
            queryId: q.id,
            runId: run.id,
            position: item.position,
            previousQueryId: ev.queryId,
          });
        }
        touched.set(canon.canonicalUrl, ev);
        const disc: EvidenceDiscovery = {
          id: newId('discovery'),
          projectId: run.projectId,
          evidenceId: ev.id,
          queryId: q.id,
          runId: run.id,
          position: item.position,
          provider: res.provider,
          providerMeta: item.providerMeta,
          url: item.url,
          retrievedAt,
        };
        repos.createDiscoveries([disc]);
        discoveries.push(disc);
        telemetry.emit('search_result_persisted', run.projectId, {
          discoveryId: disc.id,
          evidenceId: ev.id,
          queryId: q.id,
          position: item.position,
          isNew,
        });
      }
      repos.updateQuery(q.id, {
        status: 'completed',
        executedAt: retrievedAt,
        durationMs: res.durationMs,
        resultCount: res.items.length,
        rawResponseId: rawId,
      });
      completed++;
      outcomes.succeeded++;
      if (res.items.length === 0) outcomes.succeededEmpty++;
      telemetry.emit('search_completed', run.projectId, {
        runId: run.id,
        queryId: q.id,
        provider: res.provider,
        resultCount: res.items.length,
        requestedMaxResults: opts.maxResultsPerQuery,
        newEvidence: newCount,
        rediscovered,
        dropped,
        durationMs: res.durationMs,
        isDemo: res.isDemo,
        costMicros: res.meta.costMicros ?? null,
        decision: res.meta.decision ?? null,
      });
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      const code = classifyFailure(err);
      if (code === 'rate_limited') outcomes.rateLimited++;
      else if (code === 'transport') outcomes.transportFailed++;
      else outcomes.otherFailed++;
      repos.updateQuery(q.id, { status: 'failed', executedAt: nowIso(), error: message, failureCode: code });
      telemetry.emit('search_failed', run.projectId, {
        runId: run.id,
        queryId: q.id,
        provider: providers.search.name,
        code: err instanceof SearchProviderError ? err.code : 'unknown',
        failureClass: code,
        action: err instanceof SearchProviderError ? err.action : 'report',
        retryAfterMs: err instanceof SearchProviderError ? (err.retryAfterMs ?? null) : null,
      });
      if (
        err instanceof SearchProviderError &&
        !err.retryable &&
        ['login', 'connect', 'check_access'].includes(err.action)
      ) {
        // Credentials/registration problems will not fix themselves mid-run: stop spending queries.
        lastFatal = err;
        skipRest(qi + 1, `${err.action}_required`, `${err.action} required`);
        break;
      }
      if ((err as { budgetExhausted?: boolean }).budgetExhausted) {
        // Retry/wait budget is gone and the provider is still refusing: do not burn the rest of the plan.
        skipRest(qi + 1, 'retry_budget_exhausted', `retry/wait budget of ${retryBudgetMs} ms exhausted`);
        break;
      }
    }
    opts.onProgress?.({ completed, failed, evidence: touched.size });
  }
  const retrieval: RetrievalStatus =
    outcomes.succeeded === 0 ? 'none' : outcomes.succeeded < outcomes.planned ? 'partial' : 'complete';
  const retrievalNote = describeOutcomes(outcomes);
  telemetry.emit('retrieval_summarized', run.projectId, { runId: run.id, retrieval, ...outcomes });
  return {
    retrieval,
    outcomes,
    retrievalNote,
    queries: repos.listQueries(run.projectId, run.id),
    evidence: [...touched.values()],
    newEvidence: created,
    discoveries,
    failed,
    fatal: lastFatal
      ? {
          message: (lastFatal as SearchProviderError).message,
          action: (lastFatal as SearchProviderError).action,
        }
      : undefined,
  };
}

/** Failure class for run metadata: rate_limited | transport | other. */
export function classifyFailure(err: unknown): 'rate_limited' | 'transport' | 'other' {
  if (!(err instanceof SearchProviderError)) return 'other';
  if (err.code === 'rate_limited') return 'rate_limited';
  if (['timeout', 'spawn', 'no_envelope', 'no_provider_answer', 'network', 'transport'].includes(err.code))
    return 'transport';
  return 'other';
}

/** One line a human can read above a comparison table or brief. */
export function describeOutcomes(o: QueryOutcomes): string {
  const parts: string[] = [];
  if (o.succeededEmpty) parts.push(`${o.succeededEmpty} returned no results`);
  if (o.rateLimited) parts.push(`${o.rateLimited} rate-limited`);
  if (o.transportFailed)
    parts.push(`${o.transportFailed} transport failure${o.transportFailed === 1 ? '' : 's'}`);
  if (o.otherFailed) parts.push(`${o.otherFailed} failed`);
  if (o.skipped) parts.push(`${o.skipped} not attempted`);
  if (o.retries)
    parts.push(
      `${o.retries} retr${o.retries === 1 ? 'y' : 'ies'} after waiting ${Math.round(o.waitedMs / 1000)} s`,
    );
  return `${o.succeeded} of ${o.planned} searches executed${parts.length ? ': ' + parts.join(', ') : ''}`;
}
