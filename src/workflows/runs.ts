/**
 * In-process run tracker. Runs are persisted in `research_runs` so a crash/restart leaves an honest
 * 'failed' or 'partial' record rather than losing the session. V0 keeps execution in the server
 * process; swapping this for a queue later only touches this file.
 */
import type { WorkflowContext } from './context';
import type { ResearchRun, RunKind, RunStageLabel, ResearchBudget } from '@domain/types';
import { newId, nowIso } from '@domain/ids';
import { AgentProviderError, type AgentOperation } from '@providers/agent/AgentProvider';

/**
 * Run an agent operation with ONE retry on a retryable failure (e.g. malformed structured output).
 * Retries are counted on the run and emitted as telemetry; the second failure propagates.
 */
export async function runAgent<I, O>(
  ctx: WorkflowContext,
  run: ResearchRun,
  op: AgentOperation<I, O>,
  input: I,
): Promise<O> {
  try {
    return (await ctx.providers.agent.run(op, input)).output;
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
      return (await ctx.providers.agent.run(op, input)).output;
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
