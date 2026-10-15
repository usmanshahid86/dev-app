import type { AppConfig } from '@server/config';
import type { SearchProvider } from './search/SearchProvider';
import type { AgentProvider } from './agent/AgentProvider';
import { JevlinSearchProvider } from './search/jevlin';
import { FixtureSearchProvider } from './search/fixture';
import { ClaudeCliAgentProvider } from './agent/claudeCli';
import { AnthropicApiAgentProvider } from './agent/anthropicApi';
import { FixtureAgentProvider } from './agent/fixture';

export interface Providers {
  search: SearchProvider;
  agent: AgentProvider;
  /** 'demo' if either provider is a fixture. Surfaced prominently in the UI. */
  mode: 'demo' | 'real';
}

export function buildProviders(cfg: AppConfig): Providers {
  const search: SearchProvider =
    cfg.searchProvider === 'jevlin'
      ? new JevlinSearchProvider({
          bin: cfg.jevlin.bin,
          configPath: cfg.jevlin.configPath,
          tier: cfg.jevlin.tier,
        })
      : new FixtureSearchProvider();
  const agent: AgentProvider =
    cfg.agentProvider === 'claude-cli'
      ? new ClaudeCliAgentProvider({ bin: cfg.claudeCli.bin, model: cfg.claudeCli.model })
      : cfg.agentProvider === 'anthropic-api'
        ? new AnthropicApiAgentProvider({ model: cfg.anthropic.model })
        : new FixtureAgentProvider();
  return { search, agent, mode: search.isDemo || agent.isDemo ? 'demo' : 'real' };
}
