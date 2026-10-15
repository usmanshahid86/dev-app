/**
 * One real agent call (planDiscovery) through the configured agent provider.
 * Usage: DEVAPP_AGENT_PROVIDER=claude-cli npm run smoke:agent
 */
import { loadConfig } from '../src/server/config';
import { buildProviders } from '../src/providers/index';
import { planDiscovery } from '../src/providers/agent/ops';
import { emptyProfile } from '../src/domain/types';

const cfg = loadConfig();
const { agent } = buildProviders(cfg);
(async () => {
  console.log('provider:', agent.name, 'demo=', agent.isDemo, await agent.healthCheck());
  const res = await agent.run(planDiscovery, {
    profile: { ...emptyProfile(), customerType: 'developers' },
    maxQueries: 4,
  });
  console.log(JSON.stringify(res.output, null, 2));
  console.log('meta:', res.meta);
})().catch((err) => {
  console.error('smoke failed:', err.message);
  process.exit(1);
});
