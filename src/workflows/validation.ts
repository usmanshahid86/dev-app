/**
 * Validation / re-check: fresh bounded search around the original assumptions, new evidence
 * recorded separately (new run, new evidence rows), original research never overwritten.
 */
import type { WorkflowContext } from './context';
import { WorkflowError } from './context';
import { executeQueries } from './search';
import { createRun, setStage, bumpProgress, finishRun, launch } from './runs';
import { planValidation, reviewValidation } from '@providers/agent/ops';
import { toAgentOpportunity } from './investigation';
import { evidenceForOpportunity } from '@domain/lineage';
import type { ResearchRun, ValidationReview } from '@domain/types';
import { newId, nowIso } from '@domain/ids';
import { assertTransition } from '@domain/workflow';

export function startValidation(
  ctx: WorkflowContext,
  projectId: string,
  buildPackageId: string,
  input: { whatWeBuilt?: string; implementationLessons?: string },
): { run: ResearchRun; review: ValidationReview } {
  const { repos, telemetry } = ctx;
  const project = repos.getProject(projectId);
  if (!project) throw new WorkflowError('project not found', 'not_found', 404);
  const pkg = repos.getBuildPackage(buildPackageId);
  if (!pkg || pkg.projectId !== projectId)
    throw new WorkflowError('build package not found', 'not_found', 404);
  const decision = repos.getDecision(pkg.decisionId);
  const opp = decision && repos.getOpportunity(decision.opportunityId);
  if (!decision || !opp) throw new WorkflowError('decision/opportunity missing', 'not_found', 404);
  assertTransition(project.stage, 'VALIDATING');
  const run = createRun(ctx, projectId, 'validation', [buildPackageId], {
    maxQueries: ctx.config.validationMaxQueries,
    maxResultsPerQuery: ctx.config.discoveryMaxResultsPerQuery,
  });
  const version =
    repos.listValidationReviews(projectId).filter((v) => v.buildPackageId === buildPackageId).length + 1;
  const review = repos.createValidationReview({
    id: newId('validation'),
    projectId,
    buildPackageId,
    runId: run.id,
    version,
    originalAssumptions: decision.agentRecommendation.criticalAssumptions,
    whatWeBuilt: input.whatWeBuilt?.trim() ?? '',
    implementationLessons: input.implementationLessons?.trim() ?? '',
    newEvidenceIds: [],
    assumptionStatus: [],
    externalChanges: [],
    verdict: null,
    rationale: '',
    status: 'running',
    createdAt: nowIso(),
  });
  repos.updateProject(projectId, { stage: 'VALIDATING' });
  telemetry.emit('validation_started', projectId, {
    runId: run.id,
    reviewId: review.id,
    buildPackageId,
    version,
  });
  launch(
    run.id,
    async () => {
      setStage(ctx, run, 'planning');
      const assumptions = decision.agentRecommendation.criticalAssumptions;
      const plan = await ctx.providers.agent.run(planValidation, {
        opportunity: toAgentOpportunity(opp),
        assumptions,
        maxQueries: run.budget.maxQueries,
      });
      bumpProgress(ctx, run.id, {
        queriesPlanned: Math.min(plan.output.queries.length, run.budget.maxQueries),
      });
      setStage(ctx, run, 'searching');
      const search = await executeQueries(
        ctx,
        run,
        plan.output.queries.map((q) => ({ ...q, family: 'validation' as const })),
        {
          maxResultsPerQuery: run.budget.maxResultsPerQuery,
          dedupeAcrossProject: false,
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
      setStage(ctx, run, 'reviewing');
      const qText = new Map(repos.listQueries(projectId).map((q) => [q.id, q.query]));
      const toAgent = (list: typeof search.evidence) =>
        list.map((e) => ({
          id: e.id,
          url: e.url,
          title: e.title,
          snippet: e.snippet,
          query: qText.get(e.queryId) ?? '',
        }));
      const originalEvidence = evidenceForOpportunity(
        opp,
        repos.listSignals(projectId),
        repos.listEvidence(projectId),
      ).filter((e) => !search.evidence.some((n) => n.id === e.id));
      const res = await ctx.providers.agent.run(reviewValidation, {
        opportunity: toAgentOpportunity(opp),
        assumptions,
        originalEvidence: toAgent(originalEvidence),
        newEvidence: toAgent(search.evidence),
        whatWeBuilt: review.whatWeBuilt,
        implementationLessons: review.implementationLessons,
      });
      const newIds = new Set(search.evidence.map((e) => e.id));
      const assumptionIds = new Set(assumptions.map((a) => a.id));
      const findings = res.output.findings.map((f) => ({
        id: newId('finding'),
        projectId,
        investigationId: review.id,
        section: f.section,
        claim: f.claim,
        kind: f.evidenceIds.some((id) => newIds.has(id)) ? f.kind : ('inference' as const),
        supportStrength: f.supportStrength,
        evidenceIds: f.evidenceIds.filter((id) => newIds.has(id)),
        createdAt: nowIso(),
      }));
      repos.createFindings(findings);
      repos.updateValidationReview(review.id, {
        newEvidenceIds: [...newIds],
        assumptionStatus: res.output.assumptionStatus.filter((a) => assumptionIds.has(a.assumptionId)),
        externalChanges: res.output.externalChanges,
        verdict: res.output.verdict,
        rationale: res.output.rationale,
        status: search.failed ? 'partial' : 'completed',
      });
      finishRun(
        ctx,
        run.id,
        search.failed ? 'partial' : 'completed',
        search.failed ? `${search.failed} searches failed` : undefined,
      );
      repos.updateProject(projectId, { stage: 'BUILD_PACKAGE_READY' });
      telemetry.emit('validation_completed', projectId, {
        runId: run.id,
        reviewId: review.id,
        verdict: res.output.verdict,
        newEvidence: newIds.size,
      });
    },
    (err) => {
      const message = err instanceof Error ? err.message : String(err);
      finishRun(ctx, run.id, 'failed', message);
      repos.updateValidationReview(review.id, { status: 'failed', rationale: message });
      repos.updateProject(projectId, { stage: 'BUILD_PACKAGE_READY' });
      telemetry.emit('validation_failed', projectId, { runId: run.id, reviewId: review.id, error: message });
    },
  );
  return { run, review };
}
