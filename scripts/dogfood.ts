/**
 * Bounded real-mode Opportunity Discovery dogfood run. Stops after discovery: no selection,
 * no comparison, no brief, no decision. Prints an objective JSON summary and writes it to the
 * scratch path given as argv[2] (optional). Requires DEVAPP_SEARCH_PROVIDER=jevlin and
 * DEVAPP_AGENT_PROVIDER=claude-cli (or anthropic-api); refuses to run on fixture providers.
 */
import { writeFileSync } from 'node:fs';
import { loadConfig } from '../src/server/config';
import { openDb } from '../src/db/client';
import { Repositories } from '../src/db/repositories';
import { Telemetry } from '../src/telemetry/events';
import { buildProviders } from '../src/providers/index';
import { createProject, projectSnapshot } from '../src/workflows/projects';
import { startDiscovery } from '../src/workflows/discovery';
import { drain } from '../src/workflows/runs';

const config = loadConfig();
const providers = buildProviders(config);
if (providers.mode !== 'real') {
  console.error('dogfood refuses to run with fixture providers (mode=' + providers.mode + ')');
  process.exit(2);
}
const { db } = openDb({ path: config.dbPath });
const repos = new Repositories(db);
const ctx = { repos, telemetry: new Telemetry(repos), providers, config };

const profile = {
  areas: ['AI and software broadly'],
  strengths: ['small technically strong team'],
  teamSize: '2-5',
  timeToMvp: 'months',
  resources: 'moderate',
  customerType: 'any',
  businessModel: 'open',
  geography: 'open',
  avoid: [],
  constraints:
    'Find software/AI opportunities worth investigating. Prefer evidence of real pain, structural change, economic opportunity, ecosystem gaps or newly possible capabilities. Do not assume the product must be an AI wrapper.',
};

(async () => {
  const startedAt = new Date();
  const project = createProject(ctx, {
    title: `DOGFOOD-01 ${startedAt.toISOString().slice(0, 16)}`,
    profile,
  });
  console.log(
    'project',
    project.id,
    'search',
    providers.search.name,
    'agent',
    providers.agent.name,
    'budget',
    config.discoveryMaxQueries,
    'x',
    config.discoveryMaxResultsPerQuery,
  );
  const run = startDiscovery(ctx, project.id);
  const tick = setInterval(() => {
    const r = repos.getRun(run.id)!;
    console.log(
      `  [${new Date().toISOString().slice(11, 19)}] ${r.stage} q=${r.progress.queriesCompleted}/${r.progress.queriesPlanned} fail=${r.progress.queriesFailed} ev=${r.progress.evidenceCount} raw=${r.progress.signalCount} cons=${r.progress.consolidatedSignalCount} retries=${r.progress.agentRetries}`,
    );
  }, 15000);
  await drain();
  clearInterval(tick);
  const finishedAt = new Date();
  const snap = projectSnapshot(ctx, project.id);
  const r = repos.getRun(run.id)!;
  const events = repos.listEvents(project.id, 50000);
  const searchEvents = events.filter((e) => e.type === 'search_completed');
  const cost = searchEvents.reduce((a, e) => a + (Number(e.payload.costMicros) || 0), 0);
  const byCat = snap.evidence.reduce<Record<string, number>>(
    (a, e) => ((a[e.category] = (a[e.category] ?? 0) + 1), a),
    {},
  );
  const domains = new Set(snap.evidence.map((e) => e.domain));
  const multi = snap.evidence.filter((e) => snap.discoveries.filter((d) => d.evidenceId === e.id).length > 1);
  const cons = snap.signals.filter((s) => s.kind === 'consolidated');
  const raw = snap.signals.filter((s) => s.kind === 'raw');
  const summary = {
    projectId: project.id,
    runId: run.id,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationSec: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
    searchProvider: r.searchProvider,
    agentProvider: r.agentProvider,
    agentModel: config.agentProvider === 'claude-cli' ? config.claudeCli.model : config.anthropic.model,
    status: r.status,
    error: r.error,
    budget: r.budget,
    evidenceBatchSize: config.discoveryEvidenceBatchSize,
    queries: snap.queries.map((q) => ({
      query: q.query,
      family: q.family,
      status: q.status,
      results: q.resultCount,
      durationMs: q.durationMs,
      error: q.error,
    })),
    queriesIssued: snap.queries.length,
    queriesFailed: snap.queries.filter((q) => q.status === 'failed').length,
    resultsReturned: snap.discoveries.length,
    uniqueCanonicalSources: snap.evidence.length,
    rediscoveries: snap.discoveries.length - snap.evidence.length,
    sourcesFoundByMultipleQueries: multi.length,
    rawSignals: raw.length,
    consolidatedSignals: cons.length,
    mergedConsolidatedSignals: cons.filter((s) => s.componentSignalIds.length > 1).length,
    clusters: snap.clusters.length,
    opportunities: snap.opportunities.length,
    sourceCategories: byCat,
    domains: domains.size,
    topDomains: [
      ...snap.evidence.reduce<Map<string, number>>(
        (m, e) => m.set(e.domain, (m.get(e.domain) ?? 0) + 1),
        new Map(),
      ),
    ]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12),
    searchCostMicros: cost,
    agentRetries: r.progress.agentRetries,
    pageFetches: r.progress.pageFetchesSelected,
    opportunityCards: snap.opportunities.map((o) => ({
      title: o.title,
      thesis: o.thesis,
      dimensions: o.dimensions,
      corroboration: o.corroboration,
      signalCount: o.signalIds.length,
      whyNow: o.whyNow,
      majorUncertainties: o.majorUncertainties,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(summary, null, 2));
})().catch((err) => {
  console.error('dogfood failed:', err);
  process.exit(1);
});
