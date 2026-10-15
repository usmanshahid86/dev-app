import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from './config';
import { openDb } from '@db/client';
import { Repositories } from '@db/repositories';
import { Telemetry } from '@telemetry/events';
import { buildProviders } from '@providers/index';
import { createApp } from './app';
import type { WorkflowContext } from '@workflows/context';

const config = loadConfig();
const { db } = openDb({ path: config.dbPath });
const repos = new Repositories(db);
const providers = buildProviders(config);
const ctx: WorkflowContext = { repos, telemetry: new Telemetry(repos), providers, config };
const app = createApp(ctx);

// Production: serve the built client from dist/client with SPA fallback.
const clientDir = resolve('dist/client');
if (existsSync(clientDir)) {
  app.use('/assets/*', serveStatic({ root: 'dist/client' }));
  app.get('*', serveStatic({ root: 'dist/client', path: 'index.html' }));
}

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`dev-app listening on http://localhost:${info.port}`);
  console.log(
    `  mode: ${providers.mode.toUpperCase()}  search=${providers.search.name}  agent=${providers.agent.name}  db=${config.dbPath}`,
  );
  if (providers.mode === 'demo')
    console.log('  DEMO MODE: evidence comes from fixture pages (demo.invalid), not the web.');
  if (!existsSync(clientDir))
    console.log('  (no dist/client — run `npm run dev` for the Vite client on :5173, or `npm run build`)');
});
