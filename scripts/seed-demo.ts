import { loadConfig } from '../src/server/config';
import { openDb } from '../src/db/client';
import { Repositories } from '../src/db/repositories';
import { Telemetry } from '../src/telemetry/events';
import { buildProviders } from '../src/providers/index';
import { seedDemoProject } from '../src/workflows/seed';

const config = loadConfig();
const { db } = openDb({ path: config.dbPath });
const repos = new Repositories(db);
const ctx = { repos, telemetry: new Telemetry(repos), providers: buildProviders(config), config };
seedDemoProject(ctx)
  .then((r) => {
    const snap = {
      evidence: repos.listEvidence(r.projectId).length,
      signals: repos.listSignals(r.projectId).length,
      clusters: repos.listClusters(r.projectId).length,
      opportunities: repos.listOpportunities(r.projectId).length,
      findings: repos.listFindings(r.projectId).length,
      requirements: repos.getBuildPackage(r.buildPackageId)?.requirements.length,
    };
    console.log('Seeded DEMO project', r.projectId);
    console.log(JSON.stringify({ ...r, ...snap }, null, 2));
    console.log(`Open http://localhost:${config.port}/projects/${r.projectId} (after starting the app)`);
  })
  .catch((err) => {
    console.error('seed failed:', err);
    process.exit(1);
  });
