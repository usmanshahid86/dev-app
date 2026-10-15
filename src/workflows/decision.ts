import type { WorkflowContext } from './context';
import { WorkflowError } from './context';
import { DecisionKind, type Decision } from '@domain/types';
import { nowIso } from '@domain/ids';
import { assertTransition } from '@domain/workflow';

/** The HUMAN decides. Recorded separately from the agent recommendation, never inferred from it. */
export function recordUserDecision(
  ctx: WorkflowContext,
  projectId: string,
  decisionId: string,
  input: { decision: string; rationale?: string; pivotDirection?: string },
): Decision {
  const project = ctx.repos.getProject(projectId);
  if (!project) throw new WorkflowError('project not found', 'not_found', 404);
  const d = ctx.repos.getDecision(decisionId);
  if (!d || d.projectId !== projectId) throw new WorkflowError('decision not found', 'not_found', 404);
  const kind = DecisionKind.safeParse(input.decision);
  if (!kind.success)
    throw new WorkflowError('decision must be BUILD | INVESTIGATE_FURTHER | PIVOT | REJECT', 'bad_request');
  if (kind.data === 'PIVOT' && !input.pivotDirection?.trim())
    throw new WorkflowError('PIVOT requires a pivot direction', 'bad_request');
  assertTransition(project.stage, 'DECIDED');
  const updated = ctx.repos.updateDecision(decisionId, {
    userDecision: kind.data,
    userRationale: input.rationale?.trim() || null,
    userPivotDirection: input.pivotDirection?.trim() || null,
    decidedAt: nowIso(),
  });
  // Where the workflow goes next depends on the human decision.
  const nextStage =
    kind.data === 'BUILD' || kind.data === 'PIVOT'
      ? 'DECIDED'
      : kind.data === 'INVESTIGATE_FURTHER'
        ? 'DECIDED'
        : 'DECIDED';
  ctx.repos.updateProject(projectId, { stage: nextStage, decisionStatus: 'decided' });
  ctx.telemetry.emit('decision_selected', projectId, {
    decisionId,
    userDecision: kind.data,
    agentRecommendation: d.agentRecommendation.recommendation,
    agreesWithAgent: kind.data === d.agentRecommendation.recommendation,
  });
  ctx.telemetry.emit('stage_changed', projectId, { from: project.stage, to: nextStage });
  return updated;
}
