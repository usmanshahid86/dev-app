import type { WorkflowContext } from './context';
import { WorkflowError } from './context';
import {
  DiscoveryProfile,
  type Evidence,
  type OpportunityStatus,
  type Project,
  type WorkflowStage,
} from '@domain/types';
import { newId, nowIso } from '@domain/ids';
import { assertTransition, canTransition } from '@domain/workflow';

export function createProject(ctx: WorkflowContext, input: { title?: string; profile?: unknown }): Project {
  const profile = DiscoveryProfile.parse(input.profile ?? {});
  const title =
    input.title?.trim() ||
    (profile.directionSeed ? profile.directionSeed.slice(0, 60) : 'Untitled exploration');
  const project: Project = {
    id: newId('project'),
    title,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    stage: 'DISCOVERY_SETUP',
    mode: ctx.providers.mode,
    discoveryProfile: profile,
    selectedOpportunityId: null,
    decisionStatus: 'none',
  };
  ctx.repos.createProject(project);
  ctx.telemetry.emit('project_created', project.id, {
    mode: project.mode,
    hasDirection: Boolean(profile.directionSeed),
  });
  return project;
}

export function updateProfile(
  ctx: WorkflowContext,
  projectId: string,
  patch: { title?: string; profile?: unknown },
): Project {
  const p = requireProject(ctx, projectId);
  const profile = patch.profile === undefined ? p.discoveryProfile : DiscoveryProfile.parse(patch.profile);
  return ctx.repos.updateProject(projectId, {
    title: patch.title?.trim() || p.title,
    discoveryProfile: profile,
  });
}

export function requireProject(ctx: WorkflowContext, projectId: string): Project {
  const p = ctx.repos.getProject(projectId);
  if (!p) throw new WorkflowError('project not found', 'not_found', 404);
  return p;
}

/** Stages a user may navigate to directly. Running stages are only entered by workflows. */
const USER_NAVIGABLE: WorkflowStage[] = [
  'DISCOVERY_SETUP',
  'OPPORTUNITIES_READY',
  'DECISION_READY',
  'DECIDED',
  'BUILD_PACKAGE_READY',
];

/** Backward/forward navigation requested by the user. Never deletes artifacts. */
export function moveStage(ctx: WorkflowContext, projectId: string, to: WorkflowStage): Project {
  const p = requireProject(ctx, projectId);
  if (!USER_NAVIGABLE.includes(to))
    throw new WorkflowError(
      `${to} is entered by running a workflow, not by navigation`,
      'invalid_transition',
      409,
    );
  if (!canTransition(p.stage, to))
    throw new WorkflowError(`cannot move from ${p.stage} to ${to}`, 'invalid_transition', 409);
  assertTransition(p.stage, to);
  ctx.telemetry.emit('stage_changed', projectId, { from: p.stage, to, byUser: true });
  return ctx.repos.updateProject(projectId, { stage: to });
}

export function setOpportunityStatus(
  ctx: WorkflowContext,
  projectId: string,
  opportunityId: string,
  status: OpportunityStatus,
) {
  const o = ctx.repos.getOpportunity(opportunityId);
  if (!o || o.projectId !== projectId) throw new WorkflowError('opportunity not found', 'not_found', 404);
  const updated = ctx.repos.setOpportunityStatus(opportunityId, status);
  ctx.telemetry.emit('opportunity_status_changed', projectId, { opportunityId, from: o.status, to: status });
  return updated;
}

export function recordEvidenceViewed(
  ctx: WorkflowContext,
  projectId: string,
  evidenceId: string,
  from: string,
) {
  ctx.telemetry.emit('evidence_viewed', projectId, { evidenceId, from });
}

/**
 * Per-source usage flags (missed-evidence preparation for Search R&D): what happened to every
 * returned result. Derived from stored lineage + events; no opaque score.
 */
export interface EvidenceUsage {
  returned: number; // discovery count
  promoted: true;
  fetchSelected: boolean;
  fetched: boolean;
  usedInRawSignal: boolean;
  usedInConsolidatedSignal: boolean;
  usedInOpportunity: boolean;
  usedInFinding: boolean;
  inspectedByHuman: boolean;
}

export function computeEvidenceUsage(ctx: WorkflowContext, projectId: string): Record<string, EvidenceUsage> {
  const r = ctx.repos;
  const evidence = r.listEvidence(projectId);
  const discoveries = r.listDiscoveries(projectId);
  const signals = r.listSignals(projectId);
  const opportunities = r.listOpportunities(projectId);
  const findings = r.listFindings(projectId);
  const viewed = new Set(
    r
      .listEvents(projectId, 5000)
      .filter((e) => e.type === 'evidence_viewed')
      .map((e) => String(e.payload.evidenceId)),
  );
  const raw = new Set(signals.filter((s) => s.kind === 'raw').flatMap((s) => s.evidenceIds));
  const cons = new Set(signals.filter((s) => s.kind === 'consolidated').flatMap((s) => s.evidenceIds));
  const sigById = new Map(signals.map((s) => [s.id, s]));
  const inOpp = new Set(
    opportunities.flatMap((o) => o.signalIds.flatMap((id) => sigById.get(id)?.evidenceIds ?? [])),
  );
  const inFinding = new Set(findings.flatMap((f) => f.evidenceIds));
  const discCount = new Map<string, number>();
  for (const d of discoveries) discCount.set(d.evidenceId, (discCount.get(d.evidenceId) ?? 0) + 1);
  const out: Record<string, EvidenceUsage> = {};
  for (const e of evidence) {
    out[e.id] = {
      returned: discCount.get(e.id) ?? 1,
      promoted: true,
      fetchSelected: e.fetchStatus !== 'snippet_only',
      fetched: e.fetchStatus === 'fetched',
      usedInRawSignal: raw.has(e.id),
      usedInConsolidatedSignal: cons.has(e.id),
      usedInOpportunity: inOpp.has(e.id),
      usedInFinding: inFinding.has(e.id),
      inspectedByHuman: viewed.has(e.id),
    };
  }
  return out;
}

/** Full project snapshot for the client: one request, everything needed to render any screen. Page text is excluded (see /evidence/:id/text). */
export function projectSnapshot(ctx: WorkflowContext, projectId: string) {
  const r = ctx.repos;
  const project = requireProject(ctx, projectId);
  return {
    project,
    runs: r.listRuns(projectId),
    queries: r.listQueries(projectId),
    evidence: r.listEvidence(projectId).map((e) => ({ ...e, fullText: null }) as Evidence),
    discoveries: r.listDiscoveries(projectId),
    evidenceUsage: computeEvidenceUsage(ctx, projectId),
    signals: r.listSignals(projectId),
    clusters: r.listClusters(projectId),
    opportunities: r.listOpportunities(projectId),
    investigations: r.listInvestigations(projectId),
    findings: r.listFindings(projectId),
    briefs: r.listBriefs(projectId),
    decisions: r.listDecisions(projectId),
    buildPackages: r.listBuildPackages(projectId),
    validationReviews: r.listValidationReviews(projectId),
  };
}
export type ProjectSnapshot = ReturnType<typeof projectSnapshot>;
