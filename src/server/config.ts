import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface AppConfig {
  searchProvider: 'fixture' | 'jevlin';
  agentProvider: 'fixture' | 'claude-cli' | 'anthropic-api';
  dbPath: string;
  port: number;
  discoveryMaxQueries: number;
  discoveryMaxResultsPerQuery: number;
  investigationMaxQueries: number;
  validationMaxQueries: number;
  /** Evidence items per signal-extraction agent call. */
  discoveryEvidenceBatchSize: number;
  comparisonMaxPageFetches: number;
  investigationMaxPageFetches: number;
  validationMaxPageFetches: number;
  pageFetcher: 'http' | 'fixture';
  /** Chars of fetched page text handed to the agent per evidence packet. */
  packetMaxChars: number;
  /** Total wall-clock a run may spend waiting on retryable search failures (retry_after_ms). */
  searchRetryBudgetMs: number;
  /** Retries per query on retryable failures. */
  searchMaxRetriesPerQuery: number;
  /** Wait used when a retryable failure carries no retry_after_ms. */
  searchDefaultRetryWaitMs: number;
  jevlin: { bin: string; configPath: string; tier: string; maxResultsLimit: number };
  claudeCli: { bin: string; model: string };
  anthropic: { model: string };
}

/** Minimal .env loader (no dependency): only sets keys not already in the environment. */
export function loadDotEnv(path = resolve(process.cwd(), '.env')): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const key = m[1]!;
    let val = m[2] ?? '';
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const int = (v: string | undefined, d: number) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const nonneg = (v: string | undefined, d: number) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  loadDotEnv();
  const sp = env.DEVAPP_SEARCH_PROVIDER ?? 'fixture';
  const ap = env.DEVAPP_AGENT_PROVIDER ?? 'fixture';
  if (!['fixture', 'jevlin'].includes(sp))
    throw new Error(`DEVAPP_SEARCH_PROVIDER must be fixture|jevlin (got ${sp})`);
  if (!['fixture', 'claude-cli', 'anthropic-api'].includes(ap))
    throw new Error(`DEVAPP_AGENT_PROVIDER must be fixture|claude-cli|anthropic-api (got ${ap})`);
  if (env.DEVAPP_PAGE_FETCHER && !['http', 'fixture'].includes(env.DEVAPP_PAGE_FETCHER))
    throw new Error(`DEVAPP_PAGE_FETCHER must be http|fixture (got ${env.DEVAPP_PAGE_FETCHER})`);
  return {
    searchProvider: sp as AppConfig['searchProvider'],
    agentProvider: ap as AppConfig['agentProvider'],
    dbPath: env.DEVAPP_DB_PATH ?? 'data/devapp.sqlite',
    port: int(env.DEVAPP_PORT, 4100),
    discoveryMaxQueries: int(env.DEVAPP_DISCOVERY_MAX_QUERIES, 12),
    // 20 = the largest depth the stable fast tier honours (25 returned an empty "chosen: -1" answer); see docs/DECISIONS.md #24.
    discoveryMaxResultsPerQuery: int(env.DEVAPP_DISCOVERY_MAX_RESULTS_PER_QUERY, 20),
    investigationMaxQueries: int(env.DEVAPP_INVESTIGATION_MAX_QUERIES, 8),
    validationMaxQueries: int(env.DEVAPP_VALIDATION_MAX_QUERIES, 5),
    discoveryEvidenceBatchSize: int(env.DEVAPP_DISCOVERY_EVIDENCE_BATCH_SIZE, 25),
    comparisonMaxPageFetches: nonneg(env.DEVAPP_COMPARISON_MAX_PAGE_FETCHES, 4),
    investigationMaxPageFetches: nonneg(env.DEVAPP_INVESTIGATION_MAX_PAGE_FETCHES, 8),
    validationMaxPageFetches: nonneg(env.DEVAPP_VALIDATION_MAX_PAGE_FETCHES, 3),
    pageFetcher:
      (env.DEVAPP_PAGE_FETCHER as 'http' | 'fixture' | undefined) ?? (sp === 'fixture' ? 'fixture' : 'http'),
    packetMaxChars: int(env.DEVAPP_PACKET_MAX_CHARS, 3000),
    searchRetryBudgetMs: nonneg(env.DEVAPP_SEARCH_RETRY_BUDGET_MS, 90_000),
    searchMaxRetriesPerQuery: nonneg(env.DEVAPP_SEARCH_MAX_RETRIES_PER_QUERY, 1),
    searchDefaultRetryWaitMs: nonneg(env.DEVAPP_SEARCH_DEFAULT_RETRY_WAIT_MS, 5_000),
    jevlin: {
      bin: env.JEVLIN_BIN ?? `${env.HOME ?? ''}/.local/bin/jevlin`,
      configPath: env.JEVLIN_CONFIG ?? `${env.HOME ?? ''}/.jevlin/jevlin.toml`,
      tier: env.JEVLIN_TIER ?? 'fast',
      maxResultsLimit: int(env.JEVLIN_MAX_RESULTS_LIMIT, 20),
    },
    claudeCli: { bin: env.CLAUDE_BIN ?? 'claude', model: env.CLAUDE_MODEL ?? 'sonnet' },
    anthropic: { model: env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5' },
  };
}
