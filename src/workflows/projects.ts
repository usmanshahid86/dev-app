import type { WorkflowContext } from './context';
import { WorkflowError } from './context';
import { DiscoveryProfile, type OpportunityStatus, type Project, type WorkflowStage } from '@domain/types';
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

/** Full project snapshot for the client: one request, everything needed to render any screen. */
export function projectSnapshot(ctx: WorkflowContext, projectId: string) {
  const r = ctx.repos;
  const project = requireProject(ctx, projectId);
  return {
    project,
    runs: r.listRuns(projectId),
    queries: r.listQueries(projectId),
    evidence: r.listEvidence(projectId),
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
