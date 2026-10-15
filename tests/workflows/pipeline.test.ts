import { describe, it, expect, beforeAll } from 'vitest';
import { makeCtx } from '../helpers';
import { seedDemoProject } from '@workflows/seed';
import { createProject, projectSnapshot } from '@workflows/projects';
import { startDiscovery } from '@workflows/discovery';
import { drain } from '@workflows/runs';
import { danglingReferences, rawSignalsForConsolidated, findingsForRequirement } from '@domain/lineage';
import type { WorkflowContext } from '@workflows/context';

describe('V0.1 evidence pipeline: canonical sources → raw → consolidated → opportunity → fetched evidence → supported finding', () => {
  let ctx: WorkflowContext;
  let ids: Awaited<ReturnType<typeof seedDemoProject>>;
  beforeAll(async () => {
    ctx = makeCtx();
    ids = await seedDemoProject(ctx);
  });

  it('persists one canonical source per page and a discovery per (query, result)', () => {
    const snap = projectSnapshot(ctx, ids.projectId);
    const canon = new Set(snap.evidence.map((e) => e.canonicalUrl));
    expect(canon.size).toBe(snap.evidence.length);
    expect(snap.evidence.every((e) => e.canonicalUrl && e.domain === 'demo.invalid' && e.category)).toBe(
      true,
    );
    expect(snap.discoveries.length).toBeGreaterThan(snap.evidence.length); // the corpus is rediscovered by several queries
    const multi = snap.evidence.filter(
      (e) => snap.discoveries.filter((d) => d.evidenceId === e.id).length >= 2,
    );
    expect(multi.length).toBeGreaterThan(0);
    for (const e of multi) {
      const qs = new Set(snap.discoveries.filter((d) => d.evidenceId === e.id).map((d) => d.queryId));
      expect(qs.size).toBeGreaterThanOrEqual(2);
    }
    expect(snap.evidenceUsage[snap.evidence[0]!.id]).toMatchObject({ promoted: true });
  });

  it('keeps raw signals and builds consolidated signals with component lineage and stats', () => {
    const snap = projectSnapshot(ctx, ids.projectId);
    const raw = snap.signals.filter((s) => s.kind === 'raw');
    const cons = snap.signals.filter((s) => s.kind === 'consolidated');
    expect(raw.length).toBeGreaterThan(5);
    expect(cons.length).toBeGreaterThan(0);
    expect(cons.length).toBeLessThan(raw.length);
    const merged = cons.filter((s) => s.componentSignalIds.length > 1);
    expect(merged.length).toBeGreaterThan(0);
    for (const s of cons) {
      const comps = rawSignalsForConsolidated(s, snap.signals);
      expect(comps.length).toBe(s.componentSignalIds.length);
      const union = new Set(comps.flatMap((c) => c.evidenceIds));
      expect(new Set(s.evidenceIds)).toEqual(union);
      expect(s.stats).not.toBeNull();
      expect(s.stats!.canonicalSources).toBe(union.size);
    }
    // each raw signal belongs to exactly one consolidated signal
    const counts = new Map<string, number>();
    for (const s of cons) for (const id of s.componentSignalIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
    expect(counts.size).toBe(raw.length);
    expect(danglingReferences(snap)).toEqual([]);
  });

  it('opportunities cite consolidated signals and carry transparent corroboration', () => {
    const snap = projectSnapshot(ctx, ids.projectId);
    const consIds = new Set(snap.signals.filter((s) => s.kind === 'consolidated').map((s) => s.id));
    for (const o of snap.opportunities) {
      expect(o.signalIds.every((id) => consIds.has(id))).toBe(true);
      expect(o.corroboration).not.toBeNull();
      expect(o.corroboration!.canonicalSources).toBeGreaterThan(0);
      expect(o.corroboration!.summary.length).toBeGreaterThan(10);
      expect(Object.keys(o.corroboration!).some((k) => /score/i.test(k))).toBe(false);
      expect(o.majorUncertainties.length).toBeGreaterThan(0);
    }
  });

  it('discovery never fetched pages; deep investigation fetched within budget', () => {
    const snap = projectSnapshot(ctx, ids.projectId);
    const discovery = snap.runs.find((r) => r.kind === 'discovery')!;
    expect(discovery.budget.maxPageFetches).toBe(0);
    expect(discovery.progress.pageFetchesSelected).toBe(0);
    const deep = snap.runs.find((r) => r.kind === 'investigation')!;
    expect(deep.budget.maxPageFetches).toBe(6);
    expect(deep.progress.pageFetchesSelected).toBeGreaterThan(0);
    expect(deep.progress.pageFetchesSelected).toBeLessThanOrEqual(6);
    expect(deep.progress.pageFetchesCompleted).toBeGreaterThan(0);
    const fetched = snap.evidence.filter((e) => e.fetchStatus === 'fetched');
    expect(fetched.length).toBe(
      deep.progress.pageFetchesCompleted +
        snap.runs.find((r) => r.kind === 'comparison')!.progress.pageFetchesCompleted,
    );
    for (const e of fetched) {
      expect(e.textHash).toBeTruthy();
      expect(e.textChars).toBeGreaterThan(50);
      expect(e.fetchedAt).toBeTruthy();
      expect(e.fetchRunId).toBeTruthy();
    }
  });

  it('brief findings carry support levels and verified excerpts; sourced facts never cite invented evidence', () => {
    const snap = projectSnapshot(ctx, ids.projectId);
    const brief = snap.briefs[0]!;
    const findings = snap.findings.filter((f) => f.investigationId === brief.investigationId);
    const evIds = new Set(snap.evidence.map((e) => e.id));
    for (const f of findings) {
      expect(f.evidenceIds.every((id) => evIds.has(id))).toBe(true);
      if (f.kind === 'inference') expect(f.supportLevel).toBe('inference');
      else expect(['full_page_excerpt_verified', 'full_page', 'snippet_only']).toContain(f.supportLevel);
      for (const x of f.excerpts) expect(f.evidenceIds).toContain(x.evidenceId);
    }
    const verified = findings.filter((f) => f.supportLevel === 'full_page_excerpt_verified');
    expect(verified.length).toBeGreaterThan(0);
    expect(verified.every((f) => f.excerpts.some((x) => x.verified && x.note === 'full_page'))).toBe(true);
    expect(findings.some((f) => f.supportLevel === 'snippet_only' || f.supportLevel === 'inference')).toBe(
      true,
    );
  });

  it('requirements still trace to decision → assumption → finding → evidence', () => {
    const snap = projectSnapshot(ctx, ids.projectId);
    const pkg = snap.buildPackages[0]!;
    const decision = snap.decisions.find((d) => d.id === pkg.decisionId)!;
    expect(decision.userDecision).toBe('BUILD');
    const traced = pkg.requirements.filter(
      (r) => findingsForRequirement(r, decision, snap.findings).length > 0,
    );
    expect(traced.length).toBeGreaterThan(0);
    // at least one requirement reaches real evidence through its findings; inference-only links are allowed but visible
    expect(
      traced.some((r) =>
        findingsForRequirement(r, decision, snap.findings).some((f) => f.evidenceIds.length > 0),
      ),
    ).toBe(true);
    for (const r of traced)
      expect(findingsForRequirement(r, decision, snap.findings).length).toBeGreaterThan(0);
    const untraced = pkg.requirements.filter(
      (r) => r.assumptionIds.length === 0 && r.findingIds.length === 0,
    );
    // purely engineering requirements are explicit, not padded with fake research links
    for (const r of untraced) expect(findingsForRequirement(r, decision, snap.findings)).toEqual([]);
  });

  it('emits the V0.1 telemetry events', () => {
    const types = new Set(ctx.repos.listEvents(ids.projectId, 20000).map((e) => e.type));
    for (const t of [
      'search_result_persisted',
      'source_canonicalized',
      'source_rediscovered',
      'page_fetch_selected',
      'page_fetch_completed',
      'raw_signal_created',
      'signals_consolidated',
      'consolidated_signal_created',
      'corroboration_computed',
      'evidence_used_in_finding',
      'evidence_excerpt_verified',
    ])
      expect(types.has(t as any), t).toBe(true);
  });
});

describe('cross-batch consolidation', () => {
  it('merges related signals extracted in separate batches and leaves unrelated ones alone', async () => {
    const ctx = makeCtx({ config: { discoveryEvidenceBatchSize: 4 } });
    const p = createProject(ctx, {});
    startDiscovery(ctx, p.id);
    await drain();
    const snap = projectSnapshot(ctx, p.id);
    const raw = snap.signals.filter((s) => s.kind === 'raw');
    const cons = snap.signals.filter((s) => s.kind === 'consolidated');
    // The three "context handoff" raw signals come from pages that land in different batches.
    const handoffRaw = raw.filter((s) => /re-pasting|CLAUDE\.md|312 upvotes/.test(s.observation));
    expect(handoffRaw.length).toBe(3);
    const merged = cons.find((s) => handoffRaw.every((r) => s.componentSignalIds.includes(r.id)));
    expect(merged).toBeDefined();
    expect(merged!.evidenceIds.length).toBe(3);
    expect(merged!.stats!.canonicalSources).toBe(3);
    // The adoption survey is a related topic, not the same phenomenon → stays separate.
    const survey = raw.find((s) => /61%/.test(s.observation))!;
    expect(merged!.componentSignalIds).not.toContain(survey.id);
    expect(cons.find((s) => s.componentSignalIds.includes(survey.id))!.componentSignalIds).toEqual([
      survey.id,
    ]);
    expect(danglingReferences(snap)).toEqual([]);
    const ev = ctx.repos.listEvents(p.id, 20000).find((e) => e.type === 'signals_consolidated')!;
    expect(ev.payload.raw).toBe(raw.length);
    expect(ev.payload.consolidated).toBe(cons.length);
  });

  it('invented component/evidence ids from the agent are discarded and uncovered raw signals survive', async () => {
    const { FixtureAgentProvider } = await import('@providers/agent/fixture');
    const base = new FixtureAgentProvider();
    const ctx = makeCtx({
      agent: {
        name: 'liar',
        isDemo: true,
        healthCheck: async () => ({ ok: true, message: '' }),
        run: async (op, input) => {
          const res = await base.run(op, input);
          if (op.name === 'consolidateSignals') {
            const out = res.output as any;
            out.consolidated[0].componentSignalIds.push('sig_invented');
            out.consolidated.push({
              type: 'other',
              observation: 'made up',
              inference: '',
              affectedUser: null,
              uncertainty: '',
              confidence: 'low',
              componentSignalIds: ['sig_nope'],
              rationale: 'x',
            });
            out.consolidated = out.consolidated.slice(0, 2); // drop coverage of most raw signals on purpose
          }
          return res;
        },
      },
    });
    const p = createProject(ctx, {});
    startDiscovery(ctx, p.id);
    await drain();
    const snap = projectSnapshot(ctx, p.id);
    const raw = snap.signals.filter((s) => s.kind === 'raw');
    const cons = snap.signals.filter((s) => s.kind === 'consolidated');
    expect(cons.some((s) => s.observation === 'made up')).toBe(false);
    expect(cons.every((s) => s.componentSignalIds.every((id) => raw.some((r) => r.id === id)))).toBe(true);
    const covered = new Set(cons.flatMap((s) => s.componentSignalIds));
    expect(covered.size).toBe(raw.length);
    expect(danglingReferences(snap)).toEqual([]);
  });
});
