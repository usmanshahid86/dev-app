/**
 * Opportunity Discovery: plan → search → evidence → signals → clusters → opportunities.
 * Each stage persists its output before the next starts, so a failure leaves inspectable partial state.
 */
import type { WorkflowContext } from './context';
import { WorkflowError } from './context';
import { executeQueries } from './search';
import { createRun, setStage, bumpProgress, finishRun, launch } from './runs';
import {
  planDiscovery,
  extractSignals,
  clusterSignals,
  generateOpportunities,
  type EvidenceForAgent,
} from '@providers/agent/ops';
import type { Evidence, Opportunity, Project, ResearchRun, Signal, SignalCluster } from '@domain/types';
import { newId, nowIso } from '@domain/ids';
import { assertTransition } from '@domain/workflow';

const EVIDENCE_BATCH = 25;

export function startDiscovery(ctx: WorkflowContext, projectId: string): ResearchRun {
  const project = ctx.repos.getProject(projectId);
  if (!project) throw new WorkflowError('project not found', 'not_found', 404);
  assertTransition(project.stage, 'DISCOVERING');
  const run = createRun(ctx, projectId, 'discovery', [], {
    maxQueries: ctx.config.discoveryMaxQueries,
    maxResultsPerQuery: ctx.config.discoveryMaxResultsPerQuery,
  });
  ctx.repos.updateProject(projectId, { stage: 'DISCOVERING' });
  ctx.telemetry.emit('discovery_started', projectId, {
    runId: run.id,
    profile: project.discoveryProfile,
    budget: run.budget,
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
  const { repos, telemetry, providers } = ctx;
  const profile = project.discoveryProfile;

  // 1. Plan
  setStage(ctx, run, 'planning');
  const plan = await providers.agent.run(planDiscovery, { profile, maxQueries: run.budget.maxQueries });
  bumpProgress(ctx, run.id, { queriesPlanned: Math.min(plan.output.queries.length, run.budget.maxQueries) });

  // 2. Search
  setStage(ctx, run, 'searching');
  const search = await executeQueries(ctx, run, plan.output.queries, {
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

  // 3. Signals (batched so prompts stay bounded)
  setStage(ctx, run, 'extracting_signals');
  const signals: Signal[] = [];
  const queryText = new Map(search.queries.map((q) => [q.id, q.query]));
  for (let i = 0; i < search.evidence.length; i += EVIDENCE_BATCH) {
    const batch = search.evidence.slice(i, i + EVIDENCE_BATCH);
    const forAgent: EvidenceForAgent[] = batch.map((e) => ({
      id: e.id,
      url: e.url,
      title: e.title,
      snippet: e.snippet,
      query: queryText.get(e.queryId) ?? '',
    }));
    const res = await providers.agent.run(extractSignals, { profile, evidence: forAgent });
    const validIds = new Set(batch.map((e) => e.id));
    for (const s of res.output.signals) {
      const evidenceIds = s.evidenceIds.filter((id) => validIds.has(id));
      if (!evidenceIds.length) continue; // a signal without real evidence is discarded, never persisted
      signals.push({
        id: newId('signal'),
        projectId: project.id,
        runId: run.id,
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
    bumpProgress(ctx, run.id, { signalCount: signals.length });
  }
  const deduped = dedupeSignals(signals);
  repos.createSignals(deduped);
  for (const s of deduped)
    telemetry.emit('signal_created', project.id, {
      signalId: s.id,
      type: s.type,
      evidenceIds: s.evidenceIds,
      confidence: s.confidence,
    });
  bumpProgress(ctx, run.id, { signalCount: deduped.length });

  if (deduped.length === 0) {
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

  // 4. Cluster
  setStage(ctx, run, 'clustering');
  const clusterRes = await providers.agent.run(clusterSignals, {
    signals: deduped.map((s) => ({
      id: s.id,
      type: s.type,
      observation: s.observation,
      inference: s.inference,
      affectedUser: s.affectedUser,
    })),
  });
  const signalIds = new Set(deduped.map((s) => s.id));
  const clusters: SignalCluster[] = clusterRes.output.clusters
    .map((c) => ({
      id: newId('cluster'),
      projectId: project.id,
      runId: run.id,
      label: c.label,
      description: c.description,
      rationale: c.rationale,
      signalIds: c.signalIds.filter((id) => signalIds.has(id)),
      createdAt: nowIso(),
    }))
    .filter((c) => c.signalIds.length > 0);
  repos.createClusters(clusters);
  for (const c of clusters)
    telemetry.emit('cluster_created', project.id, { clusterId: c.id, signalIds: c.signalIds });

  // 5. Opportunities
  setStage(ctx, run, 'building_opportunities');
  const evidenceById = new Map(search.evidence.map((e) => [e.id, e]));
  const signalById = new Map(deduped.map((s) => [s.id, s]));
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
        uncertainty: s.uncertainty,
        evidence: s.evidenceIds
          .map((eid) => evidenceById.get(eid))
          .filter((e): e is Evidence => Boolean(e))
          .map((e) => ({ id: e.id, title: e.title, url: e.url, snippet: e.snippet })),
      };
    }),
  }));
  let opportunities: Opportunity[] = [];
  if (clustersForAgent.length) {
    const oppRes = await providers.agent.run(generateOpportunities, { profile, clusters: clustersForAgent });
    const clusterIds = new Set(clusters.map((c) => c.id));
    opportunities = oppRes.output.opportunities
      .map((o) => ({
        id: newId('opportunity'),
        projectId: project.id,
        runId: run.id,
        clusterId: o.clusterId && clusterIds.has(o.clusterId) ? o.clusterId : null,
        title: o.title,
        thesis: o.thesis,
        problem: o.problem,
        targetUser: o.targetUser,
        evidenceSummary: o.evidenceSummary,
        signalIds: o.signalIds.filter((id) => signalIds.has(id)),
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
        status: 'candidate' as const,
        seeded: o.seeded,
        createdAt: nowIso(),
      }))
      .filter((o) => o.signalIds.length > 0); // no evidence lineage → no card
    opportunities = dedupeOpportunities(opportunities);
    repos.createOpportunities(opportunities);
    for (const o of opportunities)
      telemetry.emit('opportunity_created', project.id, {
        opportunityId: o.id,
        clusterId: o.clusterId,
        signalIds: o.signalIds,
        dimensions: o.dimensions,
        seeded: o.seeded,
      });
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
    signals: deduped.length,
    clusters: clusters.length,
    opportunities: opportunities.length,
    failedQueries: search.failed,
  });
  telemetry.emit('stage_changed', project.id, { from: 'DISCOVERING', to: 'OPPORTUNITIES_READY' });
}

/** Merge signals whose observation text is near-identical (case/punctuation-insensitive). */
export function dedupeSignals(signals: Signal[]): Signal[] {
  const seen = new Map<string, Signal>();
  for (const s of signals) {
    const key = normalize(s.observation);
    const existing = seen.get(key);
    if (existing) {
      existing.evidenceIds = [...new Set([...existing.evidenceIds, ...s.evidenceIds])];
    } else {
      seen.set(key, { ...s });
    }
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
