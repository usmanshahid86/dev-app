import { describe, it, expect } from 'vitest';
import { makeCtx } from '../helpers';
import { createProject } from '@workflows/projects';
import { createRun, runAgent, recomputeAgentCost } from '@workflows/runs';
import { planDiscovery } from '@providers/agent/ops';
import { AgentProviderError, type AgentProvider } from '@providers/agent/AgentProvider';
import { FixtureAgentProvider } from '@providers/agent/fixture';
import { emptyProfile } from '@domain/types';
import { estimateUsd, PRICING_VERSION } from '@providers/agent/pricing';

function withMeta(meta: Record<string, unknown>, provider = 'stub', failFirst = false): AgentProvider {
  const base = new FixtureAgentProvider();
  let n = 0;
  return {
    name: provider,
    isDemo: false,
    healthCheck: async () => ({ ok: true, message: '' }),
    run: async (op, input) => {
      if (failFirst && n++ === 0)
        throw new AgentProviderError('bad json', provider, 'malformed_output', true);
      const r = await base.run(op, input);
      return { ...r, provider, meta };
    },
  };
}
const input = { profile: emptyProfile(), maxQueries: 3 };

describe('agent cost accounting', () => {
  it('CLI-reported cost is recorded as cli_reported, never as an estimate', async () => {
    const ctx = makeCtx({
      agent: withMeta(
        { costUsd: 0.0233, durationMs: 4116, inputTokens: 2, outputTokens: 479, model: 'sonnet' },
        'claude-cli',
      ),
    });
    const p = createProject(ctx, {});
    const run = createRun(ctx, p.id, 'discovery', [], {
      maxQueries: 1,
      maxResultsPerQuery: 1,
      maxPageFetches: 0,
    });
    await runAgent(ctx, run, planDiscovery, input);
    await runAgent(ctx, run, planDiscovery, input);
    const cost = ctx.repos.getRun(run.id)!.progress.agentCost!;
    expect(cost).toMatchObject({
      calls: 2,
      cliReportedCalls: 2,
      estimatedUsd: null,
      estimatedCalls: 0,
      unknownCalls: 0,
      pricingVersion: null,
    });
    expect(cost.cliReportedUsd).toBeCloseTo(0.0466, 6);
    const calls = ctx.repos.listEvents(p.id, 1000).filter((e) => e.type === 'agent_call');
    expect(calls.map((e) => e.payload.callId).sort()).toEqual([
      `${run.id}:planDiscovery:0`,
      `${run.id}:planDiscovery:1`,
    ]);
    expect(calls[0]!.payload).toMatchObject({
      provider: 'claude-cli',
      model: 'sonnet',
      costClass: 'cli_reported',
      attempt: 1,
    });
  });

  it('token-only metadata yields an estimate with model and pricing version recorded', async () => {
    const ctx = makeCtx({
      agent: withMeta(
        { inputTokens: 1_000_000, outputTokens: 100_000, model: 'claude-sonnet-5-5' },
        'anthropic-api',
      ),
    });
    const p = createProject(ctx, {});
    const run = createRun(ctx, p.id, 'discovery', [], {
      maxQueries: 1,
      maxResultsPerQuery: 1,
      maxPageFetches: 0,
    });
    await runAgent(ctx, run, planDiscovery, input);
    const cost = ctx.repos.getRun(run.id)!.progress.agentCost!;
    expect(cost).toMatchObject({
      calls: 1,
      cliReportedUsd: null,
      estimatedCalls: 1,
      pricingVersion: PRICING_VERSION,
      unknownCalls: 0,
    });
    expect(cost.estimatedUsd).toBeCloseTo(2 + 1, 6); // $2/MTok in + $10/MTok out × 0.1M
    expect(estimateUsd('claude-unknown-model', 10, 10)).toBeNull();
    expect(estimateUsd('claude-opus-5-5', 1_000_000, 0)).toBe(4);
  });

  it('fixture / missing metadata counts as unknown, not zero', async () => {
    const ctx = makeCtx();
    const p = createProject(ctx, {});
    const run = createRun(ctx, p.id, 'discovery', [], {
      maxQueries: 1,
      maxResultsPerQuery: 1,
      maxPageFetches: 0,
    });
    await runAgent(ctx, run, planDiscovery, input);
    expect(ctx.repos.getRun(run.id)!.progress.agentCost).toMatchObject({
      calls: 1,
      cliReportedUsd: null,
      estimatedUsd: null,
      unknownCalls: 1,
    });
  });

  it('a retry is a second real call with attempt 2; recompute is idempotent', async () => {
    const ctx = makeCtx({ agent: withMeta({ costUsd: 0.01 }, 'claude-cli', true) });
    const p = createProject(ctx, {});
    const run = createRun(ctx, p.id, 'discovery', [], {
      maxQueries: 1,
      maxResultsPerQuery: 1,
      maxPageFetches: 0,
    });
    await runAgent(ctx, run, planDiscovery, input);
    const calls = ctx.repos.listEvents(p.id, 1000).filter((e) => e.type === 'agent_call');
    expect(calls).toHaveLength(1); // the failed first attempt returned no metadata; only the successful retry is a completed call
    expect(calls[0]!.payload.attempt).toBe(2);
    expect(ctx.repos.getRun(run.id)!.progress.agentRetries).toBe(1);
    const once = ctx.repos.getRun(run.id)!.progress.agentCost!;
    recomputeAgentCost(ctx, p.id, run.id);
    recomputeAgentCost(ctx, p.id, run.id);
    expect(ctx.repos.getRun(run.id)!.progress.agentCost).toEqual(once);
    expect(once.cliReportedUsd).toBeCloseTo(0.01, 9);
  });
});
