/**
 * Versioned price table for ESTIMATING agent cost from token counts (API adapter). Prices are USD per
 * million tokens from Anthropic's published first-party rates on the version date. Estimates ignore
 * cache reads/writes and are labelled as estimates wherever shown; they are never billed expenditure.
 */
export const PRICING_VERSION = '2026-09-25';

const PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-fable-5-1': { input: 10, output: 50 },
  'claude-fable-5': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

export function estimateUsd(
  model: string | undefined,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): number | null {
  if (!model || typeof inputTokens !== 'number' || typeof outputTokens !== 'number') return null;
  const key = Object.keys(PER_MTOK).find((k) => model === k || model.startsWith(k));
  if (!key) return null;
  const p = PER_MTOK[key]!;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
