/**
 * Agent provider boundary. Workflows ask an AgentProvider to run a typed AgentOperation
 * (prompt + Zod output schema). Nothing in the domain stores provider-specific message objects.
 */
import type { ZodType } from 'zod';

export interface AgentOperation<I, O> {
  /** Stable operation name (used by the fixture provider and telemetry). */
  name: string;
  description: string;
  output: ZodType<O>;
  buildPrompt(input: I): { system: string; user: string };
  /** Hint for providers that let us choose effort/size. */
  effort?: 'low' | 'medium' | 'high';
}

export interface AgentRunResult<O> {
  output: O;
  provider: string;
  /** Cost/usage metadata if the provider reports it. Never contains reasoning text. */
  meta: Record<string, unknown>;
}

export class AgentProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly code: 'unavailable' | 'malformed_output' | 'timeout' | 'auth' | 'unknown',
    public readonly retryable: boolean,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AgentProviderError';
  }
}

export interface AgentProvider {
  readonly name: string;
  readonly isDemo: boolean;
  run<I, O>(op: AgentOperation<I, O>, input: I): Promise<AgentRunResult<O>>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}

export function defineOperation<I, O>(op: AgentOperation<I, O>): AgentOperation<I, O> {
  return op;
}
