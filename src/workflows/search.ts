/**
 * Shared search execution: persists planned queries, raw responses, canonical sources (evidence rows)
 * and every discovery relationship. A source found by three queries is ONE evidence row with THREE
 * evidence_discoveries rows. Failures are recorded per query; a run with some failed queries completes
 * as 'partial'. Demo (fixture) results are never produced here as a fallback for a failed real search.
 */
import type { WorkflowContext } from './context';
import type { Evidence, EvidenceDiscovery, QueryFamily, ResearchQuery, ResearchRun } from '@domain/types';
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

  const touched = new Map<string, Evidence>();
  const created: Evidence[] = [];
  const discoveries: EvidenceDiscovery[] = [];
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
        for (const rest of queries.slice(queries.indexOf(q) + 1)) {
          repos.updateQuery(rest.id, { status: 'failed', error: `skipped: ${err.action} required` });
          failed++;
        }
        break;
      }
    }
    opts.onProgress?.({ completed, failed, evidence: touched.size });
  }
  return {
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
