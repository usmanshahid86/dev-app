import { openDb } from '@db/client';
import { Repositories } from '@db/repositories';
import { Telemetry } from '@telemetry/events';
import { FixtureSearchProvider } from '@providers/search/fixture';
import { FixtureAgentProvider } from '@providers/agent/fixture';
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
  discoveryMaxResultsPerQuery: 8,
  investigationMaxQueries: 6,
  validationMaxQueries: 3,
  jevlin: { bin: 'jevlin', configPath: '', tier: 'fast' },
  claudeCli: { bin: 'claude', model: 'sonnet' },
  anthropic: { model: 'claude-sonnet-5-5' },
};

export function makeCtx(
  overrides: { search?: SearchProvider; agent?: AgentProvider; config?: Partial<AppConfig> } = {},
): WorkflowContext {
  const { db } = openDb({ path: ':memory:' });
  const repos = new Repositories(db);
  const search = overrides.search ?? new FixtureSearchProvider();
  const agent = overrides.agent ?? new FixtureAgentProvider();
  return {
    repos,
    telemetry: new Telemetry(repos),
    providers: { search, agent, mode: search.isDemo || agent.isDemo ? 'demo' : 'real' },
    config: { ...testConfig, ...overrides.config },
  };
}
