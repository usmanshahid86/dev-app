/**
 * Selective full-page retrieval. Discovery never calls this; comparison / deep investigation /
 * validation do, under an explicit per-run budget. The agent chooses WHICH sources are worth reading;
 * the PageFetcher (SSRF-guarded) does the reading; the evidence row records what happened.
 */
import type { WorkflowContext } from './context';
import { bumpProgress, runAgent } from './runs';
import { selectSourcesForFetch, type EvidencePacket, type OpportunityForAgent } from '@providers/agent/ops';
import { PageFetchError } from '@providers/fetch/PageFetcher';
import type { Evidence, ResearchRun } from '@domain/types';
import { nowIso } from '@domain/ids';

export interface FetchOutcome {
  selected: Evidence[];
  fetched: Evidence[];
  failed: Evidence[];
}

export async function selectAndFetch(
  ctx: WorkflowContext,
  run: ResearchRun,
  opportunity: OpportunityForAgent,
  candidates: Evidence[],
  purpose: 'comparative' | 'deep' | 'validation',
): Promise<FetchOutcome> {
  const { repos, telemetry, providers } = ctx;
  const budget = run.budget.maxPageFetches;
  const current = repos.getRun(run.id)!;
  const remaining = Math.max(0, budget - current.progress.pageFetchesSelected);
  const unfetched = candidates.filter(
    (e) => e.fetchStatus === 'snippet_only' || e.fetchStatus === 'fetch_failed',
  );
  if (remaining === 0 || unfetched.length === 0) return { selected: [], fetched: [], failed: [] };

  const selection = await runAgent(ctx, run, selectSourcesForFetch, {
    opportunity,
    evidence: unfetched.map((e) => ({
      id: e.id,
      url: e.url,
      title: e.title,
      snippet: e.snippet,
      query: '',
      category: e.category,
      domain: e.domain,
    })),
    maxFetches: remaining,
    purpose,
  });
  const byId = new Map(unfetched.map((e) => [e.id, e]));
  const selected: Evidence[] = [];
  for (const s of selection.selections) {
    const e = byId.get(s.evidenceId);
    if (!e || selected.some((x) => x.id === e.id)) continue; // invented or duplicate id → ignored
    if (selected.length >= remaining) break;
    selected.push(e);
    repos.updateEvidence(e.id, { fetchStatus: 'fetch_pending', fetchRunId: run.id });
    telemetry.emit('page_fetch_selected', run.projectId, {
      runId: run.id,
      evidenceId: e.id,
      url: e.url,
      reason: s.reason,
      purpose,
    });
  }
  bumpProgress(ctx, run.id, { pageFetchesSelected: current.progress.pageFetchesSelected + selected.length });

  const fetched: Evidence[] = [];
  const failed: Evidence[] = [];
  for (const e of selected) {
    try {
      const page = await providers.pageFetcher.fetchPage(e.url);
      const patch: Partial<Evidence> = {
        fetchStatus: 'fetched',
        fullText: page.text,
        finalUrl: page.finalUrl,
        httpStatus: page.status,
        contentType: page.contentType,
        pageTitle: page.title,
        textTruncated: page.textTruncated,
        textChars: page.text.length,
        textHash: page.contentHash,
        fetchedAt: page.fetchedAt,
        fetchError: null,
        fetchRunId: run.id,
      };
      repos.updateEvidence(e.id, patch);
      const updated = { ...e, ...patch } as Evidence;
      fetched.push(updated);
      telemetry.emit('page_fetch_completed', run.projectId, {
        runId: run.id,
        evidenceId: e.id,
        finalUrl: page.finalUrl,
        status: page.status,
        contentType: page.contentType,
        textChars: page.text.length,
        truncated: page.textTruncated,
        hash: page.contentHash,
        isDemo: page.isDemo,
      });
    } catch (err) {
      const code = err instanceof PageFetchError ? err.code : 'unknown';
      const message = err instanceof Error ? err.message : String(err);
      const status: Evidence['fetchStatus'] =
        code === 'blocked_url' || code === 'unavailable' ? 'unavailable' : 'fetch_failed';
      const patch: Partial<Evidence> = {
        fetchStatus: status,
        fetchError: `${code}: ${message}`.slice(0, 500),
        fetchedAt: nowIso(),
        httpStatus: err instanceof PageFetchError ? err.status : null,
        fetchRunId: run.id,
      };
      repos.updateEvidence(e.id, patch);
      failed.push({ ...e, ...patch } as Evidence);
      telemetry.emit('page_fetch_failed', run.projectId, {
        runId: run.id,
        evidenceId: e.id,
        url: e.url,
        code,
        status,
      });
    }
    const p = repos.getRun(run.id)!.progress;
    bumpProgress(ctx, run.id, {
      pageFetchesCompleted: p.pageFetchesCompleted + (fetched.at(-1)?.id === e.id ? 1 : 0),
      pageFetchesFailed: p.pageFetchesFailed + (failed.at(-1)?.id === e.id ? 1 : 0),
    });
  }
  return { selected, fetched, failed };
}

/** Compact evidence packets for the agent: bounded page text when fetched, snippet otherwise. */
export function buildPackets(
  ctx: WorkflowContext,
  projectId: string,
  evidence: Evidence[],
): EvidencePacket[] {
  const qText = new Map(ctx.repos.listQueries(projectId).map((q) => [q.id, q.query]));
  const max = ctx.config.packetMaxChars;
  return evidence.map((e) => {
    const fetched = e.fetchStatus === 'fetched' && e.fullText;
    const text = fetched ? e.fullText!.slice(0, max) : '';
    return {
      id: e.id,
      url: e.canonicalUrl || e.url,
      title: e.pageTitle || e.title,
      snippet: e.snippet,
      query: qText.get(e.queryId) ?? '',
      category: e.category,
      domain: e.domain,
      support: fetched ? 'full_page' : 'snippet_only',
      pageText: text,
      pageTruncated: fetched ? e.textTruncated || e.fullText!.length > max : false,
    };
  });
}
