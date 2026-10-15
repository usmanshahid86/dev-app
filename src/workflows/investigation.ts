/**
 * Comparative investigation (2–3 opportunities) and deep investigation (one opportunity → Product
 * Brief → agent recommendation). Findings are persisted separately from the rendered brief.
 */
import type { WorkflowContext } from './context';
import { WorkflowError } from './context';
import { executeQueries } from './search';
import { createRun, setStage, bumpProgress, finishRun, launch } from './runs';
import { evidenceForOpportunity } from '@domain/lineage';
import {
  planInvestigation,
  compareOpportunities,
  synthesizeBrief,
  recommendDecision,
  BRIEF_SECTIONS,
  type EvidenceForAgent,
  type OpportunityForAgent,
} from '@providers/agent/ops';
import type {
  Evidence,
  Finding,
  Investigation,
  Opportunity,
  Project,
  ResearchRun,
  ProductBrief,
  Decision,
} from '@domain/types';
import { newId, nowIso } from '@domain/ids';
import { assertTransition } from '@domain/workflow';

export function toAgentOpportunity(o: Opportunity): OpportunityForAgent {
  return {
    id: o.id,
    title: o.title,
    thesis: o.thesis,
    problem: o.problem,
    targetUser: o.targetUser,
    evidenceSummary: o.evidenceSummary,
    whyNow: o.whyNow,
    currentAlternatives: o.currentAlternatives,
    potentialWedge: o.potentialWedge,
    openQuestions: o.openQuestions,
    majorUncertainties: o.majorUncertainties,
  };
}

function toAgentEvidence(ctx: WorkflowContext, projectId: string, evidence: Evidence[]): EvidenceForAgent[] {
  const qText = new Map(ctx.repos.listQueries(projectId).map((q) => [q.id, q.query]));
  return evidence.map((e) => ({
    id: e.id,
    url: e.url,
    title: e.title,
    snippet: e.snippet,
    query: qText.get(e.queryId) ?? '',
  }));
}

function requireOpportunities(ctx: WorkflowContext, projectId: string, ids: string[]): Opportunity[] {
  const opps = ids.map((id) => ctx.repos.getOpportunity(id));
  if (opps.some((o) => !o || o.projectId !== projectId))
    throw new WorkflowError('opportunity not found', 'not_found', 404);
  return opps as Opportunity[];
}

// ---------------- Comparative ----------------

export function startComparison(
  ctx: WorkflowContext,
  projectId: string,
  opportunityIds: string[],
): { run: ResearchRun; investigation: Investigation } {
  const project = ctx.repos.getProject(projectId);
  if (!project) throw new WorkflowError('project not found', 'not_found', 404);
  if (opportunityIds.length < 2 || opportunityIds.length > 3)
    throw new WorkflowError('select 2–3 opportunities to compare', 'bad_request');
  const opps = requireOpportunities(ctx, projectId, opportunityIds);
  assertTransition(project.stage, 'COMPARING');
  const perOpp = Math.max(1, Math.floor(ctx.config.investigationMaxQueries / opps.length));
  const run = createRun(ctx, projectId, 'comparison', opportunityIds, {
    maxQueries: perOpp * opps.length,
    maxResultsPerQuery: ctx.config.discoveryMaxResultsPerQuery,
  });
  const investigation = ctx.repos.createInvestigation({
    id: newId('investigation'),
    projectId,
    runId: run.id,
    kind: 'comparative',
    opportunityIds,
    status: 'running',
    comparison: null,
    comparisonSummary: null,
    createdAt: nowIso(),
  });
  for (const o of opps) ctx.repos.setOpportunityStatus(o.id, 'comparing');
  ctx.repos.updateProject(projectId, { stage: 'COMPARING' });
  ctx.telemetry.emit('investigation_started', projectId, {
    runId: run.id,
    investigationId: investigation.id,
    kind: 'comparative',
    opportunityIds,
  });
  launch(
    run.id,
    () => runComparison(ctx, project, run, investigation, opps, perOpp),
    (err) => {
      const message = err instanceof Error ? err.message : String(err);
      finishRun(ctx, run.id, 'failed', message);
      ctx.repos.updateInvestigation(investigation.id, { status: 'failed' });
      ctx.repos.updateProject(projectId, { stage: 'OPPORTUNITIES_READY' });
      ctx.telemetry.emit('investigation_failed', projectId, {
        runId: run.id,
        investigationId: investigation.id,
        error: message,
      });
    },
  );
  return { run, investigation };
}

async function runComparison(
  ctx: WorkflowContext,
  project: Project,
  run: ResearchRun,
  inv: Investigation,
  opps: Opportunity[],
  perOpp: number,
) {
  const { repos, providers, telemetry } = ctx;
  setStage(ctx, run, 'planning');
  const planned: Array<{ query: string; family: 'investigation'; purpose: string }> = [];
  for (const o of opps) {
    const plan = await providers.agent.run(planInvestigation, {
      opportunity: toAgentOpportunity(o),
      kind: 'comparative',
      maxQueries: perOpp,
    });
    planned.push(
      ...plan.output.queries.slice(0, perOpp).map((q) => ({
        query: q.query,
        family: 'investigation' as const,
        purpose: `[${o.id}] ${q.purpose}`,
      })),
    );
  }
  bumpProgress(ctx, run.id, { queriesPlanned: planned.length });
  setStage(ctx, run, 'searching');
  const search = await executeQueries(ctx, run, planned, {
    maxResultsPerQuery: run.budget.maxResultsPerQuery,
    onProgress: (p) =>
      bumpProgress(ctx, run.id, {
        queriesCompleted: p.completed,
        queriesFailed: p.failed,
        evidenceCount: p.evidence,
      }),
  });
  if (search.fatal)
    throw new Error(`Search provider needs attention (${search.fatal.action}): ${search.fatal.message}`);

  setStage(ctx, run, 'comparing');
  const signals = repos.listSignals(project.id);
  const allEvidence = repos.listEvidence(project.id);
  const queryOpp = new Map(
    search.queries.map((q) => [q.id, q.purpose.match(/^\[(opp_[a-z0-9]+)\]/)?.[1] ?? null]),
  );
  const candidates = opps.map((o) => {
    const discoveryEv = evidenceForOpportunity(o, signals, allEvidence);
    const invEv = search.evidence.filter((e) => queryOpp.get(e.queryId) === o.id);
    const merged = [...discoveryEv, ...invEv].filter(
      (e, i, arr) => arr.findIndex((x) => x.id === e.id) === i,
    );
    return { opportunity: toAgentOpportunity(o), evidence: toAgentEvidence(ctx, project.id, merged) };
  });
  const res = await providers.agent.run(compareOpportunities, { candidates });
  const validEvidence = new Set(allEvidence.map((e) => e.id));
  const keyToId = new Map<string, string>();
  const findings: Finding[] = res.output.findings
    .map((f) => {
      const id = newId('finding');
      keyToId.set(f.key, id);
      return {
        id,
        projectId: project.id,
        investigationId: inv.id,
        section: f.section,
        claim: f.claim,
        kind: f.kind,
        supportStrength: f.supportStrength,
        evidenceIds: f.evidenceIds.filter((e) => validEvidence.has(e)),
        createdAt: nowIso(),
      };
    })
    .map((f) =>
      f.kind === 'sourced_fact' && f.evidenceIds.length === 0 ? { ...f, kind: 'inference' as const } : f,
    );
  repos.createFindings(findings);
  for (const f of findings)
    telemetry.emit('finding_created', project.id, {
      findingId: f.id,
      investigationId: inv.id,
      kind: f.kind,
      evidenceIds: f.evidenceIds,
    });
  const oppIds = new Set(opps.map((o) => o.id));
  const comparison = res.output.rows
    .filter((r) => oppIds.has(r.opportunityId))
    .map((r) => ({
      ...r,
      findingIds: r.findingKeys.map((k) => keyToId.get(k)).filter((x): x is string => Boolean(x)),
      findingKeys: undefined,
    }))
    .map(({ findingKeys: _fk, ...rest }) => rest);
  repos.updateInvestigation(inv.id, {
    status: 'completed',
    comparison,
    comparisonSummary: res.output.summary,
  });
  finishRun(
    ctx,
    run.id,
    search.failed ? 'partial' : 'completed',
    search.failed ? `${search.failed} searches failed` : undefined,
  );
  telemetry.emit('investigation_completed', project.id, {
    runId: run.id,
    investigationId: inv.id,
    kind: 'comparative',
    findings: findings.length,
  });
}

// ---------------- Deep ----------------

export function startDeepInvestigation(
  ctx: WorkflowContext,
  projectId: string,
  opportunityId: string,
): { run: ResearchRun; investigation: Investigation } {
  const project = ctx.repos.getProject(projectId);
  if (!project) throw new WorkflowError('project not found', 'not_found', 404);
  const [opp] = requireOpportunities(ctx, projectId, [opportunityId]);
  assertTransition(project.stage, 'INVESTIGATING');
  const run = createRun(ctx, projectId, 'investigation', [opportunityId], {
    maxQueries: ctx.config.investigationMaxQueries,
    maxResultsPerQuery: ctx.config.discoveryMaxResultsPerQuery,
  });
  const investigation = ctx.repos.createInvestigation({
    id: newId('investigation'),
    projectId,
    runId: run.id,
    kind: 'deep',
    opportunityIds: [opportunityId],
    status: 'running',
    comparison: null,
    comparisonSummary: null,
    createdAt: nowIso(),
  });
  for (const o of ctx.repos.listOpportunities(projectId))
    if (o.status === 'selected' || o.status === 'comparing')
      ctx.repos.setOpportunityStatus(o.id, 'interesting');
  ctx.repos.setOpportunityStatus(opportunityId, 'selected');
  ctx.repos.updateProject(projectId, {
    stage: 'INVESTIGATING',
    selectedOpportunityId: opportunityId,
    decisionStatus: 'none',
  });
  ctx.telemetry.emit('opportunity_selected', projectId, { opportunityId });
  ctx.telemetry.emit('investigation_started', projectId, {
    runId: run.id,
    investigationId: investigation.id,
    kind: 'deep',
    opportunityIds: [opportunityId],
  });
  launch(
    run.id,
    () => runDeepInvestigation(ctx, project, run, investigation, opp!),
    (err) => {
      const message = err instanceof Error ? err.message : String(err);
      finishRun(ctx, run.id, 'failed', message);
      ctx.repos.updateInvestigation(investigation.id, { status: 'failed' });
      ctx.repos.updateProject(projectId, { stage: 'OPPORTUNITIES_READY' });
      ctx.telemetry.emit('investigation_failed', projectId, {
        runId: run.id,
        investigationId: investigation.id,
        error: message,
      });
    },
  );
  return { run, investigation };
}

async function runDeepInvestigation(
  ctx: WorkflowContext,
  project: Project,
  run: ResearchRun,
  inv: Investigation,
  opp: Opportunity,
) {
  const { repos, providers, telemetry } = ctx;
  setStage(ctx, run, 'planning');
  const plan = await providers.agent.run(planInvestigation, {
    opportunity: toAgentOpportunity(opp),
    kind: 'deep',
    maxQueries: run.budget.maxQueries,
  });
  bumpProgress(ctx, run.id, { queriesPlanned: Math.min(plan.output.queries.length, run.budget.maxQueries) });

  setStage(ctx, run, 'searching');
  const search = await executeQueries(
    ctx,
    run,
    plan.output.queries.map((q) => ({ ...q, family: 'investigation' as const })),
    {
      maxResultsPerQuery: run.budget.maxResultsPerQuery,
      onProgress: (p) =>
        bumpProgress(ctx, run.id, {
          queriesCompleted: p.completed,
          queriesFailed: p.failed,
          evidenceCount: p.evidence,
        }),
    },
  );
  if (search.fatal)
    throw new Error(`Search provider needs attention (${search.fatal.action}): ${search.fatal.message}`);

  setStage(ctx, run, 'synthesizing');
  const signals = repos.listSignals(project.id);
  const allEvidence = repos.listEvidence(project.id);
  const discoveryEv = evidenceForOpportunity(opp, signals, allEvidence);
  const merged = [...discoveryEv, ...search.evidence].filter(
    (e, i, arr) => arr.findIndex((x) => x.id === e.id) === i,
  );
  const brief = await providers.agent.run(synthesizeBrief, {
    profile: project.discoveryProfile,
    opportunity: toAgentOpportunity(opp),
    evidence: toAgentEvidence(ctx, project.id, merged),
  });
  const validEvidence = new Set(allEvidence.map((e) => e.id));
  const keyToId = new Map<string, string>();
  const findings: Finding[] = brief.output.findings
    .map((f) => {
      const id = newId('finding');
      keyToId.set(f.key, id);
      return {
        id,
        projectId: project.id,
        investigationId: inv.id,
        section: f.section,
        claim: f.claim,
        kind: f.kind,
        supportStrength: f.supportStrength,
        evidenceIds: f.evidenceIds.filter((e) => validEvidence.has(e)),
        createdAt: nowIso(),
      };
    })
    // A "sourced fact" with no surviving evidence is demoted to an inference rather than silently kept.
    .map((f) =>
      f.kind === 'sourced_fact' && f.evidenceIds.length === 0 ? { ...f, kind: 'inference' as const } : f,
    );
  repos.createFindings(findings);
  for (const f of findings)
    telemetry.emit('finding_created', project.id, {
      findingId: f.id,
      investigationId: inv.id,
      kind: f.kind,
      evidenceIds: f.evidenceIds,
      section: f.section,
    });

  const titles = new Map(BRIEF_SECTIONS.map((s) => [s.key, s.title]));
  const sections = BRIEF_SECTIONS.map((def) => {
    const s = brief.output.sections.find((x) => x.key === def.key);
    let body = s?.body ?? '_Not covered by the agent._';
    body = body.replace(/\[F:([^\]]+)\]/g, (_m, key) => (keyToId.get(key) ? `[F:${keyToId.get(key)}]` : ''));
    return {
      key: def.key,
      title: titles.get(def.key) ?? def.key,
      body,
      findingIds: (s?.findingKeys ?? []).map((k) => keyToId.get(k)).filter((x): x is string => Boolean(x)),
    };
  });
  const version = repos.listBriefs(project.id).filter((b) => b.opportunityId === opp.id).length + 1;
  const briefRecord: ProductBrief = repos.createBrief({
    id: newId('brief'),
    projectId: project.id,
    investigationId: inv.id,
    opportunityId: opp.id,
    version,
    sections,
    createdAt: nowIso(),
  });
  telemetry.emit('brief_created', project.id, {
    briefId: briefRecord.id,
    version,
    findings: findings.length,
  });

  setStage(ctx, run, 'recommending');
  const rec = await providers.agent.run(recommendDecision, {
    opportunity: toAgentOpportunity(opp),
    findings: findings.map((f) => ({
      id: f.id,
      section: f.section,
      claim: f.claim,
      kind: f.kind,
      supportStrength: f.supportStrength,
    })),
    briefSections: sections.map((s) => ({ key: s.key, body: s.body })),
  });
  const findingIds = new Set(findings.map((f) => f.id));
  const onlyKnown = (ids: string[]) => ids.filter((id) => findingIds.has(id));
  const decisionVersion = repos.listDecisions(project.id).length + 1;
  const decision: Decision = repos.createDecision({
    id: newId('decision'),
    projectId: project.id,
    briefId: briefRecord.id,
    opportunityId: opp.id,
    version: decisionVersion,
    agentRecommendation: {
      ...rec.output,
      supportingFindingIds: onlyKnown(rec.output.supportingFindingIds),
      criticalAssumptions: rec.output.criticalAssumptions.map((a) => ({
        id: newId('assumption'),
        statement: a.statement,
        supportingFindingIds: onlyKnown(a.supportingFindingIds),
        evidenceAgainstFindingIds: onlyKnown(a.evidenceAgainstFindingIds),
        status: a.status,
      })),
    },
    userDecision: null,
    userRationale: null,
    userPivotDirection: null,
    decidedAt: null,
    createdAt: nowIso(),
  });
  telemetry.emit('decision_recommended', project.id, {
    decisionId: decision.id,
    recommendation: decision.agentRecommendation.recommendation,
    assumptions: decision.agentRecommendation.criticalAssumptions.length,
  });

  repos.updateInvestigation(inv.id, { status: 'completed' });
  finishRun(
    ctx,
    run.id,
    search.failed ? 'partial' : 'completed',
    search.failed ? `${search.failed} searches failed` : undefined,
  );
  repos.updateProject(project.id, { stage: 'DECISION_READY', decisionStatus: 'recommended' });
  telemetry.emit('investigation_completed', project.id, {
    runId: run.id,
    investigationId: inv.id,
    kind: 'deep',
    findings: findings.length,
  });
  telemetry.emit('stage_changed', project.id, { from: 'INVESTIGATING', to: 'DECISION_READY' });
}
