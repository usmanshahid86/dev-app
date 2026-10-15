/**
 * HTTP API (Hono). Thin: validation + delegation to workflows. Also usable in-process by tests via app.request().
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { WorkflowContext } from '@workflows/context';
import { WorkflowError } from '@workflows/context';
import {
  createProject,
  updateProfile,
  moveStage,
  setOpportunityStatus,
  recordEvidenceViewed,
  projectSnapshot,
  requireProject,
} from '@workflows/projects';
import { startDiscovery } from '@workflows/discovery';
import { startComparison, startDeepInvestigation } from '@workflows/investigation';
import { recordUserDecision } from '@workflows/decision';
import { createBuildPackage } from '@workflows/buildPackage';
import { startValidation } from '@workflows/validation';
import { renderAll } from '@export/markdown';
import { seedDemoProject } from '@workflows/seed';
import { WorkflowStage, OpportunityStatus } from '@domain/types';
import { AgentProviderError } from '@providers/agent/AgentProvider';
import { SearchProviderError } from '@providers/search/SearchProvider';
import { InvalidTransitionError } from '@domain/workflow';

export function createApp(ctx: WorkflowContext) {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof WorkflowError)
      return c.json({ error: err.message, code: err.code }, err.status as any);
    if (err instanceof InvalidTransitionError)
      return c.json({ error: err.message, code: 'invalid_transition' }, 409);
    if (err instanceof z.ZodError)
      return c.json({ error: 'invalid input', code: 'bad_request', issues: err.issues }, 400);
    if (err instanceof AgentProviderError)
      return c.json({ error: err.message, code: `agent_${err.code}`, provider: err.provider }, 502);
    if (err instanceof SearchProviderError)
      return c.json(
        { error: err.message, code: `search_${err.code}`, action: err.action, provider: err.provider },
        502,
      );
    console.error(err);
    return c.json({ error: err.message ?? 'internal error', code: 'internal' }, 500);
  });

  app.get('/api/health', async (c) => {
    const [search, agent] = await Promise.all([
      ctx.providers.search.healthCheck(),
      ctx.providers.agent.healthCheck(),
    ]);
    return c.json({
      ok: true,
      mode: ctx.providers.mode,
      providers: {
        search: { name: ctx.providers.search.name, isDemo: ctx.providers.search.isDemo, ...search },
        agent: { name: ctx.providers.agent.name, isDemo: ctx.providers.agent.isDemo, ...agent },
      },
      budgets: {
        discoveryMaxQueries: ctx.config.discoveryMaxQueries,
        discoveryMaxResultsPerQuery: ctx.config.discoveryMaxResultsPerQuery,
        investigationMaxQueries: ctx.config.investigationMaxQueries,
        validationMaxQueries: ctx.config.validationMaxQueries,
      },
    });
  });

  // ---- Projects ----
  app.get('/api/projects', (c) => c.json({ projects: ctx.repos.listProjects() }));
  app.post('/api/projects', async (c) => {
    const body = z
      .object({ title: z.string().optional(), profile: z.unknown().optional() })
      .parse(await c.req.json().catch(() => ({})));
    return c.json({ project: createProject(ctx, body) }, 201);
  });
  app.get('/api/projects/:id', (c) => c.json(projectSnapshot(ctx, c.req.param('id'))));
  app.patch('/api/projects/:id', async (c) => {
    const body = z
      .object({ title: z.string().optional(), profile: z.unknown().optional() })
      .parse(await c.req.json());
    return c.json({ project: updateProfile(ctx, c.req.param('id'), body) });
  });
  app.delete('/api/projects/:id', (c) => {
    requireProject(ctx, c.req.param('id'));
    ctx.repos.deleteProject(c.req.param('id'));
    return c.json({ ok: true });
  });
  app.post('/api/projects/:id/stage', async (c) => {
    const body = z.object({ stage: WorkflowStage }).parse(await c.req.json());
    return c.json({ project: moveStage(ctx, c.req.param('id'), body.stage) });
  });

  // ---- Runs ----
  app.get('/api/projects/:id/runs/:runId', (c) => {
    const run = ctx.repos.getRun(c.req.param('runId'));
    if (!run || run.projectId !== c.req.param('id'))
      throw new WorkflowError('run not found', 'not_found', 404);
    return c.json({ run });
  });
  app.get('/api/projects/:id/raw/:rawId', (c) => {
    const raw = ctx.repos.getRawResponse(c.req.param('rawId'));
    if (!raw) throw new WorkflowError('raw response not found', 'not_found', 404);
    const q = ctx.repos.getQuery(raw.queryId);
    if (!q || q.projectId !== c.req.param('id'))
      throw new WorkflowError('raw response not found', 'not_found', 404);
    return c.json({ raw: { id: raw.id, provider: raw.provider, createdAt: raw.createdAt, body: raw.body } });
  });

  // ---- Discovery ----
  app.post('/api/projects/:id/discovery', (c) =>
    c.json({ run: startDiscovery(ctx, c.req.param('id')) }, 202),
  );

  // ---- Opportunities ----
  app.post('/api/projects/:id/opportunities/:oppId/status', async (c) => {
    const body = z.object({ status: OpportunityStatus }).parse(await c.req.json());
    return c.json({
      opportunity: setOpportunityStatus(ctx, c.req.param('id'), c.req.param('oppId'), body.status),
    });
  });
  app.post('/api/projects/:id/compare', async (c) => {
    const body = z.object({ opportunityIds: z.array(z.string()).min(2).max(3) }).parse(await c.req.json());
    return c.json(startComparison(ctx, c.req.param('id'), body.opportunityIds), 202);
  });
  app.post('/api/projects/:id/investigate', async (c) => {
    const body = z.object({ opportunityId: z.string() }).parse(await c.req.json());
    return c.json(startDeepInvestigation(ctx, c.req.param('id'), body.opportunityId), 202);
  });

  // ---- Decision / build / validation ----
  app.post('/api/projects/:id/decisions/:decisionId', async (c) => {
    const body = z
      .object({
        decision: z.string(),
        rationale: z.string().optional(),
        pivotDirection: z.string().optional(),
      })
      .parse(await c.req.json());
    return c.json({ decision: recordUserDecision(ctx, c.req.param('id'), c.req.param('decisionId'), body) });
  });
  app.post('/api/projects/:id/build-package', async (c) => {
    const body = z.object({ decisionId: z.string() }).parse(await c.req.json());
    return c.json({ buildPackage: await createBuildPackage(ctx, c.req.param('id'), body.decisionId) }, 201);
  });
  app.post('/api/projects/:id/validate', async (c) => {
    const body = z
      .object({
        buildPackageId: z.string(),
        whatWeBuilt: z.string().optional(),
        implementationLessons: z.string().optional(),
      })
      .parse(await c.req.json());
    return c.json(startValidation(ctx, c.req.param('id'), body.buildPackageId, body), 202);
  });

  // ---- Export ----
  app.get('/api/projects/:id/export', (c) => {
    const files = renderAll(projectSnapshot(ctx, c.req.param('id')));
    ctx.telemetry.emit('export_generated', c.req.param('id'), { files: Object.keys(files) });
    return c.json({ files });
  });
  app.get('/api/projects/:id/export/:file', (c) => {
    const files = renderAll(projectSnapshot(ctx, c.req.param('id')));
    const content = files[c.req.param('file')];
    if (content === undefined) throw new WorkflowError('unknown export file', 'not_found', 404);
    ctx.telemetry.emit('export_generated', c.req.param('id'), { files: [c.req.param('file')] });
    return c.body(content, 200, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${c.req.param('file')}"`,
    });
  });

  // ---- Telemetry ----
  app.post('/api/projects/:id/events', async (c) => {
    const body = z
      .object({ type: z.literal('evidence_viewed'), evidenceId: z.string(), from: z.string().default('ui') })
      .parse(await c.req.json());
    requireProject(ctx, c.req.param('id'));
    recordEvidenceViewed(ctx, c.req.param('id'), body.evidenceId, body.from);
    return c.json({ ok: true });
  });
  app.get('/api/projects/:id/events', (c) => {
    requireProject(ctx, c.req.param('id'));
    return c.json({ events: ctx.repos.listEvents(c.req.param('id')) });
  });

  // ---- Demo seed ----
  app.post('/api/demo/seed', async (c) => {
    const result = await seedDemoProject(ctx);
    return c.json(result, 201);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
