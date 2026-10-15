/**
 * Opportunity Discovery: plan → search → evidence (canonical sources + discoveries) → raw signals
 * (batched) → consolidated signals (cross-batch) → clusters → opportunities with corroboration.
 * Each stage persists its output before the next starts, so a failure leaves inspectable partial state.
 * Discovery never fetches full pages; it stays snippet-first by design.
 */
import type { WorkflowContext } from './context';
import { WorkflowError } from './context';
import { executeQueries } from './search';
import { createRun, setStage, bumpProgress, finishRun, launch, runAgent } from './runs';
import {
  planDiscovery,
  extractSignals,
  consolidateSignals,
  clusterSignals,
  generateOpportunities,
  type EvidenceForAgent,
} from '@providers/agent/ops';
import type {
  Evidence,
  EvidenceDiscovery,
  Opportunity,
  Project,
  ResearchRun,
  Signal,
  SignalCluster,
} from '@domain/types';
import { newId, nowIso } from '@domain/ids';
import { assertTransition } from '@domain/workflow';
import { computeCorroboration } from '@domain/corroboration';

export function startDiscovery(ctx: WorkflowContext, projectId: string): ResearchRun {
  const project = ctx.repos.getProject(projectId);
  if (!project) throw new WorkflowError('project not found', 'not_found', 404);
  assertTransition(project.stage, 'DISCOVERING');
  const run = createRun(ctx, projectId, 'discovery', [], {
    maxQueries: ctx.config.discoveryMaxQueries,
    maxResultsPerQuery: ctx.config.discoveryMaxResultsPerQuery,
    maxPageFetches: 0,
  });
  ctx.repos.updateProject(projectId, { stage: 'DISCOVERING' });
  ctx.telemetry.emit('discovery_started', projectId, {
    runId: run.id,
    profile: project.discoveryProfile,
    budget: run.budget,
    evidenceBatchSize: ctx.config.discoveryEvidenceBatchSize,
  });
  ctx.telemetry.emit('stage_changed', projectId, { from: project.stage, to: 'DISCOVERING' });
  launch(
    run.id,
    () => runDiscovery(ctx, project, run),
    (err) => {
      const message = err instanceof Error ? err.message : String(err);
      finishRun(ctx, run.id, 'failed', message);
      ctx.repos.updateProject(projectId, { stage: 'DISCOVERY_SETUP' });
      ctx.telemetry.emit('discovery_failed', projectId, { runId: run.id, error: message });
    },
  );
  return run;
}

export async function runDiscovery(ctx: WorkflowContext, project: Project, run: ResearchRun): Promise<void> {
  const { repos, telemetry } = ctx;
  const profile = project.discoveryProfile;

  // 1. Plan
  setStage(ctx, run, 'planning');
  const plan = await runAgent(ctx, run, planDiscovery, { profile, maxQueries: run.budget.maxQueries });
  bumpProgress(ctx, run.id, { queriesPlanned: Math.min(plan.queries.length, run.budget.maxQueries) });

  // 2. Search
  setStage(ctx, run, 'searching');
  const search = await executeQueries(ctx, run, plan.queries, {
    maxResultsPerQuery: run.budget.maxResultsPerQuery,
    onProgress: (p) =>
      bumpProgress(ctx, run.id, {
        queriesCompleted: p.completed,
        queriesFailed: p.failed,
        evidenceCount: p.evidence,
      }),
  });
  if (search.fatal) {
    finishRun(
      ctx,
      run.id,
      'failed',
      `Search provider needs attention (${search.fatal.action}): ${search.fatal.message}`,
    );
    repos.updateProject(project.id, { stage: 'DISCOVERY_SETUP' });
    telemetry.emit('discovery_failed', project.id, { runId: run.id, action: search.fatal.action });
    return;
  }
  if (search.evidence.length === 0) {
    finishRun(
      ctx,
      run.id,
      search.failed ? 'failed' : 'completed',
      search.failed ? 'All searches failed; no evidence collected.' : 'Searches returned no usable evidence.',
    );
    repos.updateProject(project.id, { stage: search.failed ? 'DISCOVERY_SETUP' : 'OPPORTUNITIES_READY' });
    telemetry.emit(search.failed ? 'discovery_failed' : 'discovery_completed', project.id, {
      runId: run.id,
      opportunities: 0,
      evidence: 0,
    });
    return;
  }

  // 3. Raw signals (batched so prompts stay bounded)
  setStage(ctx, run, 'extracting_signals');
  const batchSize = Math.max(1, ctx.config.discoveryEvidenceBatchSize);
  const queryText = new Map(search.queries.map((q) => [q.id, q.query]));
  const rawSignals: Signal[] = [];
  for (let i = 0; i < search.evidence.length; i += batchSize) {
    const batch = search.evidence.slice(i, i + batchSize);
    const forAgent: EvidenceForAgent[] = batch.map((e) => ({
      id: e.id,
      url: e.url,
      title: e.title,
      snippet: e.snippet,
      query: queryText.get(e.queryId) ?? '',
      category: e.category,
      domain: e.domain,
    }));
    const res = await runAgent(ctx, run, extractSignals, { profile, evidence: forAgent });
    const validIds = new Set(batch.map((e) => e.id));
    for (const s of res.signals) {
      const evidenceIds = [...new Set(s.evidenceIds)].filter((id) => validIds.has(id));
      if (!evidenceIds.length) continue; // a signal without real evidence is discarded, never persisted
      rawSignals.push({
        id: newId('signal'),
        projectId: project.id,
        runId: run.id,
        kind: 'raw',
        componentSignalIds: [],
        stats: null,
        type: s.type,
        observation: s.observation,
        inference: s.inference,
        affectedUser: s.affectedUser,
        uncertainty: s.uncertainty,
        confidence: s.confidence,
        evidenceIds,
        createdAt: nowIso(),
      });
    }
    bumpProgress(ctx, run.id, { signalCount: rawSignals.length });
  }
  const raw = dedupeSignals(rawSignals);
  repos.createSignals(raw);
  for (const s of raw) {
    telemetry.emit('raw_signal_created', project.id, {
      signalId: s.id,
      type: s.type,
      evidenceIds: s.evidenceIds,
      confidence: s.confidence,
    });
    telemetry.emit('signal_created', project.id, {
      signalId: s.id,
      kind: 'raw',
      type: s.type,
      evidenceIds: s.evidenceIds,
    });
  }
  bumpProgress(ctx, run.id, { signalCount: raw.length });
  if (raw.length === 0) {
    finishRun(
      ctx,
      run.id,
      search.failed ? 'partial' : 'completed',
      'No signals could be extracted from the collected evidence.',
    );
    repos.updateProject(project.id, { stage: 'OPPORTUNITIES_READY' });
    telemetry.emit('discovery_completed', project.id, {
      runId: run.id,
      opportunities: 0,
      evidence: search.evidence.length,
      signals: 0,
    });
    return;
  }

  // 4. Consolidate across batches
  setStage(ctx, run, 'consolidating_signals');
  const evidenceById = new Map(search.evidence.map((e) => [e.id, e]));
  const consolidated = await consolidate(ctx, run, raw, evidenceById, search.discoveries);
  repos.createSignals(consolidated);
  bumpProgress(ctx, run.id, { consolidatedSignalCount: consolidated.length });

  // 5. Cluster (consolidated signals only)
  setStage(ctx, run, 'clustering');
  const clusterRes = await runAgent(ctx, run, clusterSignals, {
    signals: consolidated.map((s) => ({
      id: s.id,
      type: s.type,
      observation: s.observation,
      inference: s.inference,
      affectedUser: s.affectedUser,
    })),
  });
  const consolidatedIds = new Set(consolidated.map((s) => s.id));
  const clusters: SignalCluster[] = clusterRes.clusters
    .map((c) => ({
      id: newId('cluster'),
      projectId: project.id,
      runId: run.id,
      label: c.label,
      description: c.description,
      rationale: c.rationale,
      signalIds: [...new Set(c.signalIds)].filter((id) => consolidatedIds.has(id)),
      createdAt: nowIso(),
    }))
    .filter((c) => c.signalIds.length > 0);
  repos.createClusters(clusters);
  for (const c of clusters)
    telemetry.emit('cluster_created', project.id, { clusterId: c.id, signalIds: c.signalIds });

  // 6. Opportunities
  setStage(ctx, run, 'building_opportunities');
  const signalById = new Map(consolidated.map((s) => [s.id, s]));
  const clustersForAgent = clusters.map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description,
    rationale: c.rationale,
    signals: c.signalIds.map((id) => {
      const s = signalById.get(id)!;
      return {
        id: s.id,
        type: s.type,
        observation: s.observation,
        inference: s.inference,
        affectedUser: s.affectedUser,
        uncertainty: `${s.uncertainty} [${s.stats?.summary ?? ''}]`,
        evidence: s.evidenceIds
          .map((eid) => evidenceById.get(eid))
          .filter((e): e is Evidence => Boolean(e))
          .map((e) => ({ id: e.id, title: e.title, url: e.url, snippet: e.snippet })),
      };
    }),
  }));
  let opportunities: Opportunity[] = [];
  if (clustersForAgent.length) {
    const oppRes = await runAgent(ctx, run, generateOpportunities, { profile, clusters: clustersForAgent });
    const clusterIds = new Set(clusters.map((c) => c.id));
    opportunities = oppRes.opportunities
      .map((o) => {
        const signalIds = [...new Set(o.signalIds)].filter((id) => consolidatedIds.has(id));
        const evidence = [...new Set(signalIds.flatMap((id) => signalById.get(id)!.evidenceIds))]
          .map((eid) => evidenceById.get(eid))
          .filter((e): e is Evidence => Boolean(e));
        return {
          id: newId('opportunity'),
          projectId: project.id,
          runId: run.id,
          clusterId: o.clusterId && clusterIds.has(o.clusterId) ? o.clusterId : null,
          title: o.title,
          thesis: o.thesis,
          problem: o.problem,
          targetUser: o.targetUser,
          evidenceSummary: o.evidenceSummary,
          signalIds,
          whyNow: o.whyNow,
          currentAlternatives: o.currentAlternatives,
          potentialWedge: o.potentialWedge,
          monetizationNotes: o.monetizationNotes,
          competitionNotes: o.competitionNotes,
          buildabilityNotes: o.buildabilityNotes,
          distributionNotes: o.distributionNotes,
          majorUncertainties: o.majorUncertainties,
          openQuestions: o.openQuestions,
          dimensions: o.dimensions,
          corroboration: computeCorroboration(evidence, search.discoveries),
          status: 'candidate' as const,
          seeded: o.seeded,
          createdAt: nowIso(),
        };
      })
      .filter((o) => o.signalIds.length > 0); // no consolidated-signal lineage → no card
    opportunities = dedupeOpportunities(opportunities);
    repos.createOpportunities(opportunities);
    for (const o of opportunities) {
      telemetry.emit('opportunity_created', project.id, {
        opportunityId: o.id,
        clusterId: o.clusterId,
        signalIds: o.signalIds,
        dimensions: o.dimensions,
        seeded: o.seeded,
      });
      telemetry.emit('corroboration_computed', project.id, {
        subject: 'opportunity',
        id: o.id,
        ...o.corroboration,
      });
    }
  }

  finishRun(
    ctx,
    run.id,
    search.failed ? 'partial' : 'completed',
    search.failed ? `${search.failed} of ${search.queries.length} searches failed` : undefined,
  );
  repos.updateProject(project.id, { stage: 'OPPORTUNITIES_READY' });
  telemetry.emit('discovery_completed', project.id, {
    runId: run.id,
    evidence: search.evidence.length,
    discoveries: search.discoveries.length,
    rawSignals: raw.length,
    consolidatedSignals: consolidated.length,
    clusters: clusters.length,
    opportunities: opportunities.length,
    failedQueries: search.failed,
  });
  telemetry.emit('stage_changed', project.id, { from: 'DISCOVERING', to: 'OPPORTUNITIES_READY' });
}

/**
 * Cross-batch consolidation. Agent output is filtered programmatically: unknown ids dropped, each raw
 * signal used at most once, uncovered raw signals become standalone consolidated signals.
 */
export async function consolidate(
  ctx: WorkflowContext,
  run: ResearchRun,
  raw: Signal[],
  evidenceById: Map<string, Evidence>,
  discoveries: EvidenceDiscovery[],
): Promise<Signal[]> {
  const { telemetry } = ctx;
  const res = await runAgent(ctx, run, consolidateSignals, {
    signals: raw.map((s) => ({
      id: s.id,
      type: s.type,
      observation: s.observation,
      inference: s.inference,
      affectedUser: s.affectedUser,
      uncertainty: s.uncertainty,
      confidence: s.confidence,
      evidence: s.evidenceIds
        .map((id) => evidenceById.get(id))
        .filter((e): e is Evidence => Boolean(e))
        .map((e) => ({ id: e.id, domain: e.domain, category: e.category, title: e.title })),
    })),
  });
  const rawById = new Map(raw.map((s) => [s.id, s]));
  const used = new Set<string>();
  const out: Signal[] = [];
  const build = (
    components: Signal[],
    fields: {
      type: Signal['type'];
      observation: string;
      inference: string;
      affectedUser: string | null;
      uncertainty: string;
      confidence: Signal['confidence'];
    },
    rationale: string,
  ): Signal => {
    const evidenceIds = [...new Set(components.flatMap((c) => c.evidenceIds))];
    const evidence = evidenceIds.map((id) => evidenceById.get(id)).filter((e): e is Evidence => Boolean(e));
    return {
      id: newId('signal'),
      projectId: run.projectId,
      runId: run.id,
      kind: 'consolidated',
      componentSignalIds: components.map((c) => c.id),
      stats: computeCorroboration(evidence, discoveries),
      type: fields.type,
      observation: fields.observation,
      inference: fields.inference,
      affectedUser: fields.affectedUser,
      uncertainty: rationale
        ? `${fields.uncertainty} Consolidation rationale: ${rationale}`
        : fields.uncertainty,
      confidence: fields.confidence,
      evidenceIds,
      createdAt: nowIso(),
    };
  };
  for (const c of res.consolidated) {
    const components = [...new Set(c.componentSignalIds)]
      .map((id) => rawById.get(id))
      .filter((s): s is Signal => Boolean(s) && !used.has(s!.id));
    if (!components.length) continue;
    for (const comp of components) used.add(comp.id);
    out.push(build(components, c, c.rationale));
  }
  for (const s of raw) if (!used.has(s.id)) out.push(build([s], s, ''));
  for (const s of out) {
    telemetry.emit('consolidated_signal_created', run.projectId, {
      signalId: s.id,
      componentSignalIds: s.componentSignalIds,
      evidenceIds: s.evidenceIds,
      stats: s.stats,
    });
    telemetry.emit('corroboration_computed', run.projectId, { subject: 'signal', id: s.id, ...s.stats });
  }
  telemetry.emit('signals_consolidated', run.projectId, {
    runId: run.id,
    raw: raw.length,
    consolidated: out.length,
    merged: out.filter((s) => s.componentSignalIds.length > 1).length,
  });
  return out;
}

/** Merge raw signals whose observation text is near-identical (case/punctuation-insensitive). */
export function dedupeSignals(signals: Signal[]): Signal[] {
  const seen = new Map<string, Signal>();
  for (const s of signals) {
    const key = normalize(s.observation);
    const existing = seen.get(key);
    if (existing) existing.evidenceIds = [...new Set([...existing.evidenceIds, ...s.evidenceIds])];
    else seen.set(key, { ...s });
  }
  return [...seen.values()];
}

export function dedupeOpportunities(opps: Opportunity[]): Opportunity[] {
  const seen = new Map<string, Opportunity>();
  for (const o of opps) {
    const key = normalize(o.title);
    if (!seen.has(key)) seen.set(key, o);
  }
  return [...seen.values()];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
