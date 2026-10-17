import { openDb } from '@db/client';
import { Repositories } from '@db/repositories';
import { Telemetry } from '@telemetry/events';
import { FixtureSearchProvider } from '@providers/search/fixture';
import { FixtureAgentProvider } from '@providers/agent/fixture';
import { FixturePageFetcher } from '@providers/fetch/fixture';
import type { PageFetcher } from '@providers/fetch/PageFetcher';
import type { WorkflowContext } from '@workflows/context';
import type { AppConfig } from '@server/config';
import type { SearchProvider } from '@providers/search/SearchProvider';
import type { AgentProvider } from '@providers/agent/AgentProvider';

export const testConfig: AppConfig = {
  searchProvider: 'fixture',
  agentProvider: 'fixture',
  dbPath: ':memory:',
  port: 0,
  discoveryMaxQueries: 12,
  discoveryMaxResultsPerQuery: 20,
  investigationMaxQueries: 6,
  validationMaxQueries: 3,
  discoveryEvidenceBatchSize: 25,
  comparisonMaxPageFetches: 4,
  investigationMaxPageFetches: 6,
  validationMaxPageFetches: 3,
  pageFetcher: 'fixture',
  packetMaxChars: 3000,
  searchRetryBudgetMs: 90_000,
  searchMaxRetriesPerQuery: 1,
  searchDefaultRetryWaitMs: 5_000,
  fetchSuppressForbiddenMs: 7 * 24 * 3_600_000,
  fetchSuppressEmptyMs: 24 * 3_600_000,
  jevlin: { bin: 'jevlin', configPath: '', tier: 'fast', maxResultsLimit: 20 },
  claudeCli: { bin: 'claude', model: 'sonnet' },
  anthropic: { model: 'claude-sonnet-5-5' },
};

export function makeCtx(
  overrides: {
    search?: SearchProvider;
    agent?: AgentProvider;
    pageFetcher?: PageFetcher;
    config?: Partial<AppConfig>;
  } = {},
): WorkflowContext {
  const { db } = openDb({ path: ':memory:' });
  const repos = new Repositories(db);
  const search = overrides.search ?? new FixtureSearchProvider();
  const agent = overrides.agent ?? new FixtureAgentProvider();
  const pageFetcher = overrides.pageFetcher ?? new FixturePageFetcher();
  return {
    repos,
    telemetry: new Telemetry(repos),
    providers: { search, agent, pageFetcher, mode: search.isDemo || agent.isDemo ? 'demo' : 'real' },
    config: { ...testConfig, ...overrides.config },
  };
}
