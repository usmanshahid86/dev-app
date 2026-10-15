import type { WorkflowContext } from './context';
import { WorkflowError } from './context';
import { generateBuildPackage } from '@providers/agent/ops';
import { toAgentOpportunity } from './investigation';
import type { BuildPackage, Requirement } from '@domain/types';
import { newId, nowIso } from '@domain/ids';
import { assertTransition } from '@domain/workflow';

export async function createBuildPackage(
  ctx: WorkflowContext,
  projectId: string,
  decisionId: string,
): Promise<BuildPackage> {
  const { repos, providers, telemetry } = ctx;
  const project = repos.getProject(projectId);
  if (!project) throw new WorkflowError('project not found', 'not_found', 404);
  const decision = repos.getDecision(decisionId);
  if (!decision || decision.projectId !== projectId)
    throw new WorkflowError('decision not found', 'not_found', 404);
  if (!decision.userDecision)
    throw new WorkflowError(
      'a human decision must be recorded before generating a build package',
      'decision_required',
      409,
    );
  if (decision.userDecision !== 'BUILD' && decision.userDecision !== 'PIVOT')
    throw new WorkflowError(
      `build packages are only generated for BUILD or PIVOT (decision was ${decision.userDecision})`,
      'decision_required',
      409,
    );
  assertTransition(project.stage, 'BUILD_PACKAGE_READY');
  const opp = repos.getOpportunity(decision.opportunityId);
  const brief = repos.getBrief(decision.briefId);
  if (!opp || !brief) throw new WorkflowError('opportunity or brief missing', 'not_found', 404);
  const findings = repos.listFindings(projectId, brief.investigationId);
  const assumptions = decision.agentRecommendation.criticalAssumptions;

  const res = await providers.agent.run(generateBuildPackage, {
    opportunity: toAgentOpportunity(opp),
    decision: {
      kind: decision.userDecision,
      rationale: decision.userRationale,
      pivotDirection: decision.userPivotDirection,
    },
    assumptions,
    findings: findings.map((f) => ({
      id: f.id,
      section: f.section,
      claim: f.claim,
      kind: f.kind,
      supportStrength: f.supportStrength,
    })),
    briefSections: brief.sections.map((s) => ({ key: s.key, body: s.body })),
    profile: project.discoveryProfile,
  });
  const assumptionIds = new Set(assumptions.map((a) => a.id));
  const findingIds = new Set(findings.map((f) => f.id));
  const requirements: Requirement[] = res.output.requirements.map((r, i) => ({
    id: newId('requirement'),
    number: i + 1,
    text: r.text,
    decisionId: decision.id,
    assumptionIds: r.assumptionIds.filter((a) => assumptionIds.has(a)),
    findingIds: r.findingIds.filter((f) => findingIds.has(f)),
    priority: r.priority,
  }));
  const { requirements: _r, ...sections } = res.output;
  const version = repos.listBuildPackages(projectId).filter((b) => b.decisionId === decision.id).length + 1;
  const pkg = repos.createBuildPackage({
    id: newId('buildPackage'),
    projectId,
    decisionId: decision.id,
    version,
    sections,
    requirements,
    createdAt: nowIso(),
  });
  repos.updateProject(projectId, { stage: 'BUILD_PACKAGE_READY' });
  telemetry.emit('build_package_created', projectId, {
    buildPackageId: pkg.id,
    decisionId: decision.id,
    version,
    requirements: requirements.length,
    traced: requirements.filter((r) => r.assumptionIds.length || r.findingIds.length).length,
  });
  telemetry.emit('stage_changed', projectId, { from: project.stage, to: 'BUILD_PACKAGE_READY' });
  return pkg;
}
