/**
 * Validation / re-check: fresh bounded search around the original assumptions, selective page fetch,
 * new evidence recorded separately (new run, new discoveries), original research never overwritten.
 */
import type { WorkflowContext } from './context';
import { WorkflowError } from './context';
import { executeQueries } from './search';
import { selectAndFetch, buildPackets, evidenceOrigins } from './fetch';
import { createRun, setStage, bumpProgress, finishRun, launch, runAgent } from './runs';
import { planValidation, reviewValidation } from '@providers/agent/ops';
import { toAgentOpportunity } from './investigation';
import { evidenceForOpportunity } from '@domain/lineage';
import { validateFindings } from '@domain/findings';
import type { Evidence, ResearchRun, ValidationReview } from '@domain/types';
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
    maxPageFetches: ctx.config.validationMaxPageFetches,
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
    budget: run.budget,
  });
  launch(
    run.id,
    async () => {
      setStage(ctx, run, 'planning');
      const assumptions = decision.agentRecommendation.criticalAssumptions;
      const plan = await runAgent(ctx, run, planValidation, {
        opportunity: toAgentOpportunity(opp),
        assumptions,
        maxQueries: run.budget.maxQueries,
      });
      bumpProgress(ctx, run.id, { queriesPlanned: Math.min(plan.queries.length, run.budget.maxQueries) });
      setStage(ctx, run, 'searching');
      const search = await executeQueries(
        ctx,
        run,
        plan.queries.map((q) => ({ ...q, family: 'validation' as const })),
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
      bumpProgress(ctx, run.id, {
        retrieval: search.retrieval,
        queryOutcomes: search.outcomes,
        retrievalNote: search.retrievalNote,
      });
      setStage(ctx, run, 'fetching_pages');
      await selectAndFetch(ctx, run, toAgentOpportunity(opp), search.evidence, 'validation');
      setStage(ctx, run, 'reviewing');
      // "New evidence" = every source this run observed (new or rediscovered), re-read for fetch state.
      const all = new Map(repos.listEvidence(projectId).map((e) => [e.id, e]));
      const newEvidence = search.evidence.map((e) => all.get(e.id)).filter((e): e is Evidence => Boolean(e));
      const newIds = new Set(newEvidence.map((e) => e.id));
      const originalEvidence = evidenceForOpportunity(opp, repos.listSignals(projectId), [
        ...all.values(),
      ]).filter((e) => !newIds.has(e.id));
      const qText = new Map(repos.listQueries(projectId).map((q) => [q.id, q.query]));
      const res = await runAgent(ctx, run, reviewValidation, {
        opportunity: toAgentOpportunity(opp),
        assumptions,
        originalEvidence: originalEvidence.map((e) => ({
          id: e.id,
          url: e.url,
          title: e.title,
          snippet: e.snippet,
          query: qText.get(e.queryId) ?? '',
          category: e.category,
          domain: e.domain,
        })),
        newEvidence: buildPackets(ctx, projectId, newEvidence, run.id),
        whatWeBuilt: review.whatWeBuilt,
        implementationLessons: review.implementationLessons,
      });
      const assumptionIds = new Set(assumptions.map((a) => a.id));
      const allowed = new Map(newEvidence.map((e) => [e.id, e]));
      const validated = validateFindings(res.findings, allowed);
      const origins = evidenceOrigins(ctx, run.id);
      const findings = validated.map((v) => ({
        retrievalOrigin:
          v.evidenceIds.length === 0
            ? ('none' as const)
            : v.evidenceIds.every((id) => origins.created.has(id))
              ? ('new' as const)
              : v.evidenceIds.some((id) => origins.created.has(id))
                ? ('mixed' as const)
                : ('inherited' as const),
        id: newId('finding'),
        projectId,
        investigationId: review.id,
        section: v.section,
        claim: v.claim,
        kind: v.kind,
        supportStrength: v.supportStrength,
        evidenceIds: v.evidenceIds,
        supportLevel: v.supportLevel,
        excerpts: v.excerpts,
        createdAt: nowIso(),
      }));
      repos.createFindings(findings);
      for (const f of findings)
        telemetry.emit('finding_created', projectId, {
          findingId: f.id,
          investigationId: review.id,
          kind: f.kind,
          supportLevel: f.supportLevel,
          evidenceIds: f.evidenceIds,
        });
      repos.updateValidationReview(review.id, {
        newEvidenceIds: [...newIds],
        assumptionStatus: res.assumptionStatus.filter((a) => assumptionIds.has(a.assumptionId)),
        externalChanges: res.externalChanges,
        verdict: res.verdict,
        rationale: res.rationale,
        status: search.failed ? 'partial' : 'completed',
      });
      finishRun(
        ctx,
        run.id,
        search.failed ? 'partial' : 'completed',
        search.failed ? search.retrievalNote : undefined,
      );
      repos.updateProject(projectId, { stage: 'BUILD_PACKAGE_READY' });
      telemetry.emit('validation_completed', projectId, {
        runId: run.id,
        reviewId: review.id,
        verdict: res.verdict,
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
