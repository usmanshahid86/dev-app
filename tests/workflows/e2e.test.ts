import { describe, it, expect, beforeAll } from 'vitest';
import { makeCtx } from '../helpers';
import { seedDemoProject } from '@workflows/seed';
import { startValidation } from '@workflows/validation';
import { drain } from '@workflows/runs';
import { projectSnapshot } from '@workflows/projects';
import { renderAll } from '@export/markdown';
import { danglingReferences, findingsForRequirement } from '@domain/lineage';
import { moveStage } from '@workflows/projects';
import type { WorkflowContext } from '@workflows/context';

describe('end-to-end: no idea → opportunities → brief → decision → build package → validation', () => {
  let ctx: WorkflowContext;
  let ids: Awaited<ReturnType<typeof seedDemoProject>>;
  beforeAll(async () => {
    ctx = makeCtx();
    ids = await seedDemoProject(ctx);
  });

  it('produces evidence → signals → clusters → opportunities with intact lineage', () => {
    const snap = projectSnapshot(ctx, ids.projectId);
    expect(snap.project.mode).toBe('demo');
    expect(snap.evidence.length).toBeGreaterThan(10);
    expect(snap.evidence.every((e) => e.isDemo)).toBe(true);
    expect(snap.signals.length).toBeGreaterThan(5);
    expect(snap.clusters.length).toBeGreaterThanOrEqual(3);
    expect(snap.opportunities.length).toBeGreaterThanOrEqual(4);
    expect(snap.opportunities.length).toBeLessThanOrEqual(6);
    expect(danglingReferences(snap)).toEqual([]);
    // Every opportunity traces to signals that trace to evidence.
    for (const o of snap.opportunities) {
      expect(o.signalIds.length).toBeGreaterThan(0);
      for (const sid of o.signalIds) {
        const s = snap.signals.find((x) => x.id === sid)!;
        expect(s.evidenceIds.length).toBeGreaterThan(0);
      }
    }
    // Noise pages were returned by search but never became signals.
    const noise = snap.evidence.find((e) => e.url.includes('listicle'));
    expect(noise).toBeDefined();
    expect(snap.signals.some((s) => s.evidenceIds.includes(noise!.id))).toBe(false);
    // Webhook theme has evidence but no card (weak/competitive → agent declined).
    expect(snap.opportunities.some((o) => o.title.toLowerCase().includes('webhook'))).toBe(false);
  });

  it('records a run with budget, provider names and done status', () => {
    const snap = projectSnapshot(ctx, ids.projectId);
    const discovery = snap.runs.find((r) => r.kind === 'discovery')!;
    expect(discovery.status).toBe('completed');
    expect(discovery.searchProvider).toBe('fixture');
    expect(discovery.progress.queriesCompleted).toBeLessThanOrEqual(discovery.budget.maxQueries);
    expect(snap.queries.filter((q) => q.runId === discovery.id).every((q) => q.rawResponseId)).toBe(true);
  });

  it('comparison rows reference the compared opportunities and findings', () => {
    const snap = projectSnapshot(ctx, ids.projectId);
    const cmp = snap.investigations.find((i) => i.kind === 'comparative')!;
    expect(cmp.status).toBe('completed');
    expect(cmp.comparison).toHaveLength(2);
    expect(cmp.comparison!.every((r) => cmp.opportunityIds.includes(r.opportunityId))).toBe(true);
    expect(cmp.comparison!.some((r) => r.findingIds.length > 0)).toBe(true);
  });

  it('brief sections cite findings that cite evidence', () => {
    const snap = projectSnapshot(ctx, ids.projectId);
    const brief = snap.briefs[0]!;
    expect(brief.sections).toHaveLength(12);
    const findings = snap.findings.filter((f) => f.investigationId === brief.investigationId);
    expect(findings.length).toBeGreaterThan(5);
    const sourced = findings.filter((f) => f.kind === 'sourced_fact');
    expect(sourced.every((f) => f.evidenceIds.length > 0)).toBe(true);
    const exec = brief.sections.find((s) => s.key === 'executive_summary')!;
    expect(exec.findingIds.length).toBeGreaterThan(0);
    expect(exec.body).toMatch(/\[F:fnd_[a-z0-9]+\]/);
  });

  it('keeps agent recommendation and human decision separate', () => {
    const d = projectSnapshot(ctx, ids.projectId).decisions[0]!;
    expect(d.agentRecommendation.recommendation).toBe('BUILD');
    expect(d.userDecision).toBe('BUILD');
    expect(d.decidedAt).not.toBeNull();
    expect(d.agentRecommendation.criticalAssumptions.length).toBeGreaterThan(0);
    const a = d.agentRecommendation.criticalAssumptions.find((x) => x.status === 'contested')!;
    expect(a.supportingFindingIds.length).toBeGreaterThan(0);
    expect(a.evidenceAgainstFindingIds.length).toBeGreaterThan(0);
  });

  it('requirements trace back to decision, assumptions and findings', () => {
    const snap = projectSnapshot(ctx, ids.projectId);
    const pkg = snap.buildPackages[0]!;
    const decision = snap.decisions.find((d) => d.id === pkg.decisionId)!;
    expect(pkg.requirements.length).toBeGreaterThan(3);
    expect(pkg.requirements.every((r) => r.decisionId === decision.id)).toBe(true);
    const traced = pkg.requirements.filter(
      (r) => findingsForRequirement(r, decision, snap.findings).length > 0,
    );
    expect(traced.length).toBeGreaterThanOrEqual(pkg.requirements.length - 1);
    expect(snap.project.stage).toBe('BUILD_PACKAGE_READY');
  });

  it('renders all four export artifacts with DEMO banners', () => {
    const files = renderAll(projectSnapshot(ctx, ids.projectId));
    expect(Object.keys(files)).toEqual([
      'PROJECT-BRIEF.md',
      'PRODUCT-DECISION.md',
      'BUILD-PACKAGE.md',
      'AGENT-HANDOFF.md',
    ]);
    for (const content of Object.values(files)) expect(content).toContain('DEMO CONTENT');
    expect(files['BUILD-PACKAGE.md']).toMatch(/Traces to: .*assumption asm_/);
    expect(files['PROJECT-BRIEF.md']).toContain('## 14. Sources');
    expect(files['AGENT-HANDOFF.md']).toContain('Definition of done');
  });

  it('validation re-checks without overwriting original research', async () => {
    const before = projectSnapshot(ctx, ids.projectId);
    const { review } = startValidation(ctx, ids.projectId, ids.buildPackageId, {
      whatWeBuilt: 'A CLI prototype',
      implementationLessons: 'Generators were easy',
    });
    await drain();
    const after = projectSnapshot(ctx, ids.projectId);
    const v = after.validationReviews.find((x) => x.id === review.id)!;
    expect(v.status).toBe('completed');
    expect(v.verdict).toBe('CONTINUE');
    expect(v.newEvidenceIds.length).toBeGreaterThan(0);
    expect(v.assumptionStatus.length).toBe(v.originalAssumptions.length);
    // Original artifacts untouched; new evidence appended.
    expect(after.briefs).toEqual(before.briefs);
    expect(after.decisions).toEqual(before.decisions);
    expect(after.evidence.length).toBeGreaterThan(before.evidence.length);
    expect(after.project.stage).toBe('BUILD_PACKAGE_READY');
  });

  it('allows backward navigation without deleting artifacts', () => {
    const p = moveStage(ctx, ids.projectId, 'OPPORTUNITIES_READY');
    expect(p.stage).toBe('OPPORTUNITIES_READY');
    const snap = projectSnapshot(ctx, ids.projectId);
    expect(snap.buildPackages).toHaveLength(1);
    expect(snap.briefs).toHaveLength(1);
  });

  it('emits the R&D telemetry chain', () => {
    const types = new Set(ctx.repos.listEvents(ids.projectId).map((e) => e.type));
    for (const t of [
      'discovery_started',
      'query_planned',
      'search_completed',
      'evidence_created',
      'signal_created',
      'opportunity_created',
      'opportunity_selected',
      'investigation_started',
      'finding_created',
      'decision_recommended',
      'decision_selected',
      'build_package_created',
      'validation_started',
      'validation_completed',
    ])
      expect(types.has(t as any), t).toBe(true);
  });
});
