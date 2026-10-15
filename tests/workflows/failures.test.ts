import { describe, it, expect } from 'vitest';
import { makeCtx } from '../helpers';
import { createProject, projectSnapshot } from '@workflows/projects';
import { startDiscovery } from '@workflows/discovery';
import { startDeepInvestigation } from '@workflows/investigation';
import { recordUserDecision } from '@workflows/decision';
import { createBuildPackage } from '@workflows/buildPackage';
import { seedDemoProject } from '@workflows/seed';
import { drain } from '@workflows/runs';
import { SearchProviderError, type SearchProvider } from '@providers/search/SearchProvider';
import { AgentProviderError, type AgentProvider } from '@providers/agent/AgentProvider';
import { FixtureSearchProvider } from '@providers/search/fixture';
import { FixtureAgentProvider } from '@providers/agent/fixture';

const failingSearch = (action: 'report' | 'login', retryable = false): SearchProvider => ({
  name: 'jevlin',
  isDemo: false,
  search: async () => {
    throw new SearchProviderError('router unavailable', 'jevlin', 'unavailable', retryable, action);
  },
  healthCheck: async () => ({ ok: false, message: 'down' }),
});

describe('failure handling', () => {
  it('a failed real search never becomes demo evidence', async () => {
    const ctx = makeCtx({ search: failingSearch('report') });
    const p = createProject(ctx, {});
    startDiscovery(ctx, p.id);
    await drain();
    const snap = projectSnapshot(ctx, p.id);
    expect(snap.evidence).toHaveLength(0);
    expect(snap.opportunities).toHaveLength(0);
    const run = snap.runs[0]!;
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(/All searches failed/);
    expect(snap.queries.every((q) => q.status === 'failed')).toBe(true);
    expect(snap.project.stage).toBe('DISCOVERY_SETUP');
  });

  it('stops spending queries when the provider needs login', async () => {
    const ctx = makeCtx({ search: failingSearch('login') });
    const p = createProject(ctx, {});
    startDiscovery(ctx, p.id);
    await drain();
    const snap = projectSnapshot(ctx, p.id);
    expect(snap.runs[0]!.error).toMatch(/login/);
    expect(snap.queries.filter((q) => q.error?.startsWith('skipped')).length).toBeGreaterThan(0);
  });

  it('partial search completion is recorded as partial, keeping the evidence it got', async () => {
    let n = 0;
    const flaky = new FixtureSearchProvider();
    const search: SearchProvider = {
      name: 'flaky',
      isDemo: true,
      healthCheck: async () => ({ ok: true, message: '' }),
      search: async (q, o) => {
        if (n++ % 2 === 1) throw new SearchProviderError('timeout', 'flaky', 'timeout', true, 'retry');
        return flaky.search(q, o);
      },
    };
    const ctx = makeCtx({ search });
    const p = createProject(ctx, {});
    startDiscovery(ctx, p.id);
    await drain();
    const snap = projectSnapshot(ctx, p.id);
    expect(snap.runs[0]!.status).toBe('partial');
    expect(snap.evidence.length).toBeGreaterThan(0);
    expect(snap.queries.filter((q) => q.status === 'failed').length).toBeGreaterThan(0);
  });

  it('a malformed agent result fails the run without inventing opportunities', async () => {
    const base = new FixtureAgentProvider();
    const agent: AgentProvider = {
      name: 'broken',
      isDemo: true,
      healthCheck: async () => ({ ok: true, message: '' }),
      run: async (op, input) => {
        if (op.name === 'generateOpportunities')
          throw new AgentProviderError('bad json', 'broken', 'malformed_output', true);
        return base.run(op, input);
      },
    };
    const ctx = makeCtx({ agent });
    const p = createProject(ctx, {});
    startDiscovery(ctx, p.id);
    await drain();
    const snap = projectSnapshot(ctx, p.id);
    expect(snap.runs[0]!.status).toBe('failed');
    expect(snap.runs[0]!.error).toMatch(/bad json/);
    expect(snap.signals.length).toBeGreaterThan(0); // partial state preserved
    expect(snap.clusters.length).toBeGreaterThan(0);
    expect(snap.opportunities).toHaveLength(0);
  });

  it('agent output referencing unknown evidence ids is dropped, not trusted', async () => {
    const base = new FixtureAgentProvider();
    const agent: AgentProvider = {
      name: 'hallucinating',
      isDemo: true,
      healthCheck: async () => ({ ok: true, message: '' }),
      run: async (op, input) => {
        const res = await base.run(op, input);
        if (op.name === 'extractSignals') {
          const out = res.output as any;
          out.signals.push({
            type: 'other',
            observation: 'made up',
            inference: '',
            affectedUser: null,
            uncertainty: '',
            confidence: 'low',
            evidenceIds: ['ev_doesnotexist'],
          });
        }
        return res;
      },
    };
    const ctx = makeCtx({ agent });
    const p = createProject(ctx, {});
    startDiscovery(ctx, p.id);
    await drain();
    const snap = projectSnapshot(ctx, p.id);
    expect(snap.signals.some((s) => s.observation === 'made up')).toBe(false);
  });

  it('no opportunities when the direction seed matches nothing', async () => {
    const ctx = makeCtx();
    const p = createProject(ctx, { profile: { directionSeed: 'quantum underwater basket weaving' } });
    startDiscovery(ctx, p.id);
    await drain();
    const snap = projectSnapshot(ctx, p.id);
    expect(snap.runs[0]!.status).toBe('completed');
    expect(snap.opportunities).toHaveLength(0);
    expect(snap.project.stage).toBe('OPPORTUNITIES_READY');
  });

  it('a direction seed produces a seeded card when evidence supports it', async () => {
    const ctx = makeCtx();
    const p = createProject(ctx, {
      profile: { directionSeed: 'portable project memory for AI coding agents' },
    });
    startDiscovery(ctx, p.id);
    await drain();
    const snap = projectSnapshot(ctx, p.id);
    expect(snap.queries[0]!.family).toBe('direction_seed');
    expect(snap.opportunities.some((o) => o.seeded)).toBe(true);
  });

  it('build package requires a human BUILD/PIVOT decision, not just a recommendation', async () => {
    const ctx = makeCtx();
    const p = createProject(ctx, {});
    startDiscovery(ctx, p.id);
    await drain();
    const opp = ctx.repos.listOpportunities(p.id)[0]!;
    startDeepInvestigation(ctx, p.id, opp.id);
    await drain();
    const d = ctx.repos.listDecisions(p.id)[0]!;
    expect(d.userDecision).toBeNull();
    await expect(createBuildPackage(ctx, p.id, d.id)).rejects.toThrow(/human decision/);
    recordUserDecision(ctx, p.id, d.id, { decision: 'REJECT', rationale: 'not for me' });
    await expect(createBuildPackage(ctx, p.id, d.id)).rejects.toThrow(/only generated for BUILD or PIVOT/);
    expect(() => recordUserDecision(ctx, p.id, d.id, { decision: 'PIVOT' })).toThrow(/pivot direction/);
  });

  it('seed is deterministic across runs', async () => {
    const a = await seedDemoProject(makeCtx());
    const b = await seedDemoProject(makeCtx());
    expect(a.projectId).not.toBe(b.projectId);
    const ctxA = makeCtx();
    const ctxB = makeCtx();
    const ra = await seedDemoProject(ctxA);
    const rb = await seedDemoProject(ctxB);
    const titles = (ctx: typeof ctxA, id: string) =>
      ctx.repos
        .listOpportunities(id)
        .map((o) => o.title)
        .sort();
    expect(titles(ctxA, ra.projectId)).toEqual(titles(ctxB, rb.projectId));
  });
});
