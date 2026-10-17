/**
 * In-process run tracker. Runs are persisted in `research_runs` so a crash/restart leaves an honest
 * 'failed' or 'partial' record rather than losing the session. V0 keeps execution in the server
 * process; swapping this for a queue later only touches this file.
 */
import type { WorkflowContext } from './context';
import type { ResearchRun, RunKind, RunStageLabel, ResearchBudget } from '@domain/types';
import { newId, nowIso } from '@domain/ids';
import { AgentProviderError, type AgentOperation, type AgentRunResult } from '@providers/agent/AgentProvider';
import { estimateUsd, PRICING_VERSION } from '@providers/agent/pricing';
import type { AgentCost } from '@domain/types';

/**
 * Record one completed agent call from the provider's usage metadata and recompute the run's cost
 * accounting from events. Call identity is stable: `${runId}:${op}:${n}` where n counts the agent_call
 * events already persisted for that run and op, so re-processing never double-counts.
 */
function recordAgentCall(
  ctx: WorkflowContext,
  run: ResearchRun,
  opName: string,
  res: AgentRunResult<unknown>,
  attempt: number,
): void {
  const meta = res.meta ?? {};
  const prior = ctx.repos
    .listEvents(run.projectId, 50000)
    .filter((e) => e.type === 'agent_call' && e.payload.runId === run.id && e.payload.op === opName).length;
  const costUsd = typeof meta.costUsd === 'number' ? meta.costUsd : null;
  const inputTokens = typeof meta.inputTokens === 'number' ? meta.inputTokens : null;
  const outputTokens = typeof meta.outputTokens === 'number' ? meta.outputTokens : null;
  const model = typeof meta.model === 'string' ? meta.model : null;
  const estimated =
    costUsd === null
      ? estimateUsd(model ?? undefined, inputTokens ?? undefined, outputTokens ?? undefined)
      : null;
  const costClass = costUsd !== null ? 'cli_reported' : estimated !== null ? 'estimated' : 'unknown';
  ctx.telemetry.emit('agent_call', run.projectId, {
    callId: `${run.id}:${opName}:${prior}`,
    runId: run.id,
    op: opName,
    attempt,
    provider: res.provider,
    model,
    durationMs: typeof meta.durationMs === 'number' ? meta.durationMs : null,
    inputTokens,
    outputTokens,
    costClass,
    cliReportedUsd: costUsd,
    estimatedUsd: estimated,
    pricingVersion: estimated !== null ? PRICING_VERSION : null,
  });
  recomputeAgentCost(ctx, run.projectId, run.id);
}

/** Idempotent: derives the run's agent cost from its agent_call events. */
export function recomputeAgentCost(ctx: WorkflowContext, projectId: string, runId: string): AgentCost {
  const calls = ctx.repos
    .listEvents(projectId, 50000)
    .filter((e) => e.type === 'agent_call' && e.payload.runId === runId);
  const seen = new Set<string>();
  const cost: AgentCost = {
    calls: 0,
    cliReportedUsd: null,
    cliReportedCalls: 0,
    estimatedUsd: null,
    estimatedCalls: 0,
    unknownCalls: 0,
    pricingVersion: null,
  };
  for (const e of calls) {
    const id = String(e.payload.callId);
    if (seen.has(id)) continue;
    seen.add(id);
    cost.calls++;
    if (e.payload.costClass === 'cli_reported') {
      cost.cliReportedCalls++;
      cost.cliReportedUsd = (cost.cliReportedUsd ?? 0) + Number(e.payload.cliReportedUsd);
    } else if (e.payload.costClass === 'estimated') {
      cost.estimatedCalls++;
      cost.estimatedUsd = (cost.estimatedUsd ?? 0) + Number(e.payload.estimatedUsd);
      cost.pricingVersion = String(e.payload.pricingVersion ?? cost.pricingVersion ?? '');
    } else cost.unknownCalls++;
  }
  bumpProgress(ctx, runId, { agentCost: cost });
  return cost;
}

/**
 * Run an agent operation with ONE retry on a retryable failure (e.g. malformed structured output).
 * Retries are counted on the run and emitted as telemetry; the second failure propagates.
 * Every completed call is recorded for cost accounting (each retry is a real call).
 */
export async function runAgent<I, O>(
  ctx: WorkflowContext,
  run: ResearchRun,
  op: AgentOperation<I, O>,
  input: I,
): Promise<O> {
  try {
    const res = await ctx.providers.agent.run(op, input);
    recordAgentCall(ctx, run, op.name, res, 1);
    return res.output;
  } catch (err) {
    if (err instanceof AgentProviderError && err.retryable) {
      const cur = ctx.repos.getRun(run.id);
      if (cur) bumpProgress(ctx, run.id, { agentRetries: cur.progress.agentRetries + 1 });
      ctx.telemetry.emit('agent_retry', run.projectId, {
        runId: run.id,
        op: op.name,
        code: err.code,
        provider: err.provider,
      });
      const res = await ctx.providers.agent.run(op, input);
      recordAgentCall(ctx, run, op.name, res, 2);
      return res.output;
    }
    throw err;
  }
}

export function createRun(
  ctx: WorkflowContext,
  projectId: string,
  kind: RunKind,
  targetIds: string[],
  budget: ResearchBudget,
): ResearchRun {
  return ctx.repos.createRun({
    id: newId('run'),
    projectId,
    kind,
    targetIds,
    status: 'queued',
    stage: 'planning',
    budget,
    searchProvider: ctx.providers.search.name,
    agentProvider: ctx.providers.agent.name,
    progress: {
      queriesPlanned: 0,
      queriesCompleted: 0,
      queriesFailed: 0,
      evidenceCount: 0,
      signalCount: 0,
      consolidatedSignalCount: 0,
      pageFetchesSelected: 0,
      pageFetchesCompleted: 0,
      pageFetchesFailed: 0,
      agentRetries: 0,
      pageFetchesSuppressed: 0,
      agentCost: null,
      retrieval: null,
      queryOutcomes: null,
      retrievalNote: null,
    },
    error: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
}

export function setStage(
  ctx: WorkflowContext,
  run: ResearchRun,
  stage: RunStageLabel,
  message?: string,
): ResearchRun {
  return ctx.repos.updateRun(run.id, {
    stage,
    status: 'running',
    progress: { ...ctx.repos.getRun(run.id)!.progress, message },
  });
}

export function bumpProgress(
  ctx: WorkflowContext,
  runId: string,
  patch: Partial<ResearchRun['progress']>,
): void {
  const cur = ctx.repos.getRun(runId);
  if (!cur) return;
  ctx.repos.updateRun(runId, { progress: { ...cur.progress, ...patch } });
}

export function finishRun(
  ctx: WorkflowContext,
  runId: string,
  status: 'completed' | 'partial' | 'failed',
  error?: string,
): ResearchRun {
  return ctx.repos.updateRun(runId, { status, stage: 'done', error: error ?? null });
}

const active = new Map<string, Promise<void>>();

/** Fire-and-track: starts the async work, records failures on the run, never throws to the caller. */
export function launch(runId: string, work: () => Promise<void>, onError: (err: unknown) => void): void {
  const p = work()
    .catch(onError)
    .finally(() => active.delete(runId));
  active.set(runId, p);
}

export function isActive(runId: string): boolean {
  return active.has(runId);
}

/** Test helper: await all in-flight runs. */
export async function drain(): Promise<void> {
  await Promise.all([...active.values()]);
}
