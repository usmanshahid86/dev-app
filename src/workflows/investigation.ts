/**
 * Comparative investigation (2–3 opportunities) and deep investigation (one opportunity → selective
 * page fetch → Product Brief → agent recommendation). Findings are validated programmatically
 * (domain/findings.ts) and persisted separately from the rendered brief.
 */
import type { WorkflowContext } from './context';
import { WorkflowError } from './context';
import { executeQueries } from './search';
import { selectAndFetch, buildPackets } from './fetch';
import { createRun, setStage, bumpProgress, finishRun, launch, runAgent } from './runs';
import { evidenceForOpportunity, signalsForOpportunity } from '@domain/lineage';
import { validateFindings } from '@domain/findings';
import {
  planInvestigation,
  compareOpportunities,
  synthesizeBrief,
  recommendDecision,
  BRIEF_SECTIONS,
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

function requireOpportunities(ctx: WorkflowContext, projectId: string, ids: string[]): Opportunity[] {
  const opps = ids.map((id) => ctx.repos.getOpportunity(id));
  if (opps.some((o) => !o || o.projectId !== projectId))
    throw new WorkflowError('opportunity not found', 'not_found', 404);
  return opps as Opportunity[];
}

/** Evidence an investigation may cite: the opportunity's discovery evidence plus this run's evidence, re-read from the DB (fetch state included). */
function allowedEvidence(
  ctx: WorkflowContext,
  projectId: string,
  opp: Opportunity,
  runEvidence: Evidence[],
): Map<string, Evidence> {
  const all = ctx.repos.listEvidence(projectId);
  const byId = new Map(all.map((e) => [e.id, e]));
  const discovery = evidenceForOpportunity(opp, ctx.repos.listSignals(projectId), all);
  const m = new Map<string, Evidence>();
  for (const e of [...discovery, ...runEvidence]) {
    const fresh = byId.get(e.id);
    if (fresh) m.set(fresh.id, fresh);
  }
  return m;
}

/** Persist validated findings, emitting the per-evidence usage/excerpt telemetry. */
function persistFindings(
  ctx: WorkflowContext,
  projectId: string,
  investigationId: string,
  proposed: Parameters<typeof validateFindings>[0],
  allowed: Map<string, Evidence>,
): { findings: Finding[]; keyToId: Map<string, string> } {
  const validated = validateFindings(proposed, allowed);
  const keyToId = new Map<string, string>();
  const findings: Finding[] = validated.map((v) => {
    const id = newId('finding');
    keyToId.set(v.key, id);
    return {
      id,
      projectId,
      investigationId,
      section: v.section,
      claim: v.claim,
      kind: v.kind,
      supportStrength: v.supportStrength,
      evidenceIds: v.evidenceIds,
      supportLevel: v.supportLevel,
      excerpts: v.excerpts,
      createdAt: nowIso(),
    };
  });
  ctx.repos.createFindings(findings);
  validated.forEach((v, i) => {
    const f = findings[i]!;
    ctx.telemetry.emit('finding_created', projectId, {
      findingId: f.id,
      investigationId,
      kind: f.kind,
      supportLevel: f.supportLevel,
      evidenceIds: f.evidenceIds,
      section: f.section,
      notes: v.notes,
    });
    for (const eid of f.evidenceIds)
      ctx.telemetry.emit('evidence_used_in_finding', projectId, {
        findingId: f.id,
        evidenceId: eid,
        supportLevel: f.supportLevel,
      });
    for (const ex of f.excerpts)
      ctx.telemetry.emit(ex.verified ? 'evidence_excerpt_verified' : 'evidence_excerpt_rejected', projectId, {
        findingId: f.id,
        evidenceId: ex.evidenceId,
        note: ex.note,
        chars: ex.excerpt.length,
      });
  });
  return { findings, keyToId };
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
    maxPageFetches: ctx.config.comparisonMaxPageFetches,
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
    budget: run.budget,
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
  const { repos, telemetry } = ctx;
  setStage(ctx, run, 'planning');
  const planned: Array<{ query: string; family: 'investigation'; purpose: string }> = [];
  for (const o of opps) {
    const plan = await runAgent(ctx, run, planInvestigation, {
      opportunity: toAgentOpportunity(o),
      kind: 'comparative',
      maxQueries: perOpp,
    });
    planned.push(
      ...plan.queries.slice(0, perOpp).map((q) => ({
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

  // Selective page fetch: split the budget across candidates.
  setStage(ctx, run, 'fetching_pages');
  const queryOpp = new Map(
    search.queries.map((q) => [q.id, q.purpose.match(/^\[(opp_[a-z0-9]+)\]/)?.[1] ?? null]),
  );
  const perCandidate = new Map<string, Map<string, Evidence>>();
  for (const o of opps) {
    const runEv = search.evidence.filter((e) =>
      search.discoveries.some((d) => d.evidenceId === e.id && queryOpp.get(d.queryId) === o.id),
    );
    perCandidate.set(o.id, allowedEvidence(ctx, project.id, o, runEv));
  }
  if (run.budget.maxPageFetches > 0) {
    const share = Math.max(1, Math.floor(run.budget.maxPageFetches / opps.length));
    for (const o of opps) {
      const sub = {
        ...repos.getRun(run.id)!,
        budget: {
          ...run.budget,
          maxPageFetches: Math.min(
            run.budget.maxPageFetches,
            repos.getRun(run.id)!.progress.pageFetchesSelected + share,
          ),
        },
      };
      await selectAndFetch(
        ctx,
        sub,
        toAgentOpportunity(o),
        [...perCandidate.get(o.id)!.values()],
        'comparative',
      );
    }
  }

  setStage(ctx, run, 'comparing');
  const allowedAll = new Map<string, Evidence>();
  const candidates = opps.map((o) => {
    const allowed = allowedEvidence(ctx, project.id, o, [...perCandidate.get(o.id)!.values()]);
    for (const [k, v] of allowed) allowedAll.set(k, v);
    return {
      opportunity: toAgentOpportunity(o),
      evidence: buildPackets(ctx, project.id, [...allowed.values()]),
    };
  });
  const res = await runAgent(ctx, run, compareOpportunities, { candidates });
  const { findings, keyToId } = persistFindings(ctx, project.id, inv.id, res.findings, allowedAll);
  const oppIds = new Set(opps.map((o) => o.id));
  const comparison = res.rows
    .filter((r) => oppIds.has(r.opportunityId))
    .map(({ findingKeys, ...rest }) => ({
      ...rest,
      findingIds: findingKeys.map((k) => keyToId.get(k)).filter((x): x is string => Boolean(x)),
    }));
  repos.updateInvestigation(inv.id, { status: 'completed', comparison, comparisonSummary: res.summary });
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
    fullPageFindings: findings.filter((f) => f.supportLevel.startsWith('full_page')).length,
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
    maxPageFetches: ctx.config.investigationMaxPageFetches,
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
    budget: run.budget,
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
  const { repos, telemetry } = ctx;
  setStage(ctx, run, 'planning');
  const plan = await runAgent(ctx, run, planInvestigation, {
    opportunity: toAgentOpportunity(opp),
    kind: 'deep',
    maxQueries: run.budget.maxQueries,
  });
  bumpProgress(ctx, run.id, { queriesPlanned: Math.min(plan.queries.length, run.budget.maxQueries) });

  setStage(ctx, run, 'searching');
  const search = await executeQueries(
    ctx,
    run,
    plan.queries.map((q) => ({ ...q, family: 'investigation' as const })),
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

  // Selective full-page retrieval of the most consequential sources before synthesis.
  setStage(ctx, run, 'fetching_pages');
  await selectAndFetch(
    ctx,
    run,
    toAgentOpportunity(opp),
    [...allowedEvidence(ctx, project.id, opp, search.evidence).values()],
    'deep',
  );

  setStage(ctx, run, 'synthesizing');
  const allowed = allowedEvidence(ctx, project.id, opp, search.evidence);
  const brief = await runAgent(ctx, run, synthesizeBrief, {
    profile: project.discoveryProfile,
    opportunity: toAgentOpportunity(opp),
    evidence: buildPackets(ctx, project.id, [...allowed.values()]),
  });
  const { findings, keyToId } = persistFindings(ctx, project.id, inv.id, brief.findings, allowed);

  const titles = new Map(BRIEF_SECTIONS.map((s) => [s.key, s.title]));
  const sections = BRIEF_SECTIONS.map((def) => {
    const s = brief.sections.find((x) => x.key === def.key);
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
    supportLevels: countBy(findings.map((f) => f.supportLevel)),
  });

  setStage(ctx, run, 'recommending');
  const rec = await runAgent(ctx, run, recommendDecision, {
    opportunity: toAgentOpportunity(opp),
    findings: findings.map((f) => ({
      id: f.id,
      section: f.section,
      claim: `${f.claim} (support: ${f.supportLevel})`,
      kind: f.kind,
      supportStrength: f.supportStrength,
    })),
    briefSections: sections.map((s) => ({ key: s.key, body: s.body })),
  });
  const findingIds = new Set(findings.map((f) => f.id));
  const onlyKnown = (ids: string[]) => [...new Set(ids)].filter((id) => findingIds.has(id));
  const decisionVersion = repos.listDecisions(project.id).length + 1;
  const decision: Decision = repos.createDecision({
    id: newId('decision'),
    projectId: project.id,
    briefId: briefRecord.id,
    opportunityId: opp.id,
    version: decisionVersion,
    agentRecommendation: {
      ...rec,
      supportingFindingIds: onlyKnown(rec.supportingFindingIds),
      criticalAssumptions: rec.criticalAssumptions.map((a) => ({
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
    fullPageFindings: findings.filter((f) => f.supportLevel.startsWith('full_page')).length,
  });
  telemetry.emit('stage_changed', project.id, { from: 'INVESTIGATING', to: 'DECISION_READY' });
  void signalsForOpportunity;
}

function countBy(xs: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
}
