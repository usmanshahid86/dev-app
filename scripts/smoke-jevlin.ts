/**
 * One real Jevlin search through the provider adapter. Costs one fast-tier search.
 * Usage: npm run smoke:jevlin -- "your query"
 */
import { loadConfig } from '../src/server/config';
import { JevlinSearchProvider } from '../src/providers/search/jevlin';

const cfg = loadConfig();
const q =
  process.argv.slice(2).join(' ') || 'developers frustrated manual context handoff between AI coding agents';
const p = new JevlinSearchProvider({
  bin: cfg.jevlin.bin,
  configPath: cfg.jevlin.configPath,
  tier: cfg.jevlin.tier,
});
(async () => {
  console.log('health:', await p.healthCheck());
  const res = await p.search(q, { maxResults: 5 });
  console.log(
    `query: ${q}\nprovider: ${res.provider} demo=${res.isDemo} ${res.durationMs}ms meta=${JSON.stringify(res.meta)}`,
  );
  for (const i of res.items)
    console.log(`  #${i.position} ${i.title}\n     ${i.url}\n     ${i.snippet.slice(0, 140)}`);
})().catch((err) => {
  console.error('smoke failed:', err.message, err.action ? `(action: ${err.action})` : '');
  process.exit(1);
});
