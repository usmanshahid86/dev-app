import { describe, it, expect } from 'vitest';
import { makeCtx } from '../helpers';
import { createApp } from '@server/app';
import { drain } from '@workflows/runs';

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const j = async (r: Response): Promise<any> => r.json();

describe('HTTP API', () => {
  it('walks the workflow over HTTP', async () => {
    const ctx = makeCtx();
    const app = createApp(ctx);
    const health = await j(await app.request('/api/health'));
    expect(health.mode).toBe('demo');
    expect(health.providers.search.isDemo).toBe(true);

    const created = await app.request('/api/projects', json({ profile: { customerType: 'developers' } }));
    expect(created.status).toBe(201);
    const { project } = await j(created);
    expect(project.stage).toBe('DISCOVERY_SETUP');

    const disc = await app.request(`/api/projects/${project.id}/discovery`, { method: 'POST' });
    expect(disc.status).toBe(202);
    await drain();
    const snap = await j(await app.request(`/api/projects/${project.id}`));
    expect(snap.project.stage).toBe('OPPORTUNITIES_READY');
    expect(snap.opportunities.length).toBeGreaterThan(0);

    const opp = snap.opportunities[0];
    const st = await app.request(
      `/api/projects/${project.id}/opportunities/${opp.id}/status`,
      json({ status: 'interesting' }),
    );
    expect((await j(st)).opportunity.status).toBe('interesting');

    const bad = await app.request(`/api/projects/${project.id}/compare`, json({ opportunityIds: [opp.id] }));
    expect(bad.status).toBe(400);

    const inv = await app.request(`/api/projects/${project.id}/investigate`, json({ opportunityId: opp.id }));
    expect(inv.status).toBe(202);
    await drain();
    const snap2 = await j(await app.request(`/api/projects/${project.id}`));
    expect(snap2.project.stage).toBe('DECISION_READY');
    const decision = snap2.decisions[0];

    const early = await app.request(
      `/api/projects/${project.id}/build-package`,
      json({ decisionId: decision.id }),
    );
    expect(early.status).toBe(409);

    const dec = await app.request(
      `/api/projects/${project.id}/decisions/${decision.id}`,
      json({ decision: 'BUILD', rationale: 'ok' }),
    );
    expect((await j(dec)).decision.userDecision).toBe('BUILD');
    const bp = await app.request(
      `/api/projects/${project.id}/build-package`,
      json({ decisionId: decision.id }),
    );
    expect(bp.status).toBe(201);

    const exp = await app.request(`/api/projects/${project.id}/export/AGENT-HANDOFF.md`);
    expect(exp.headers.get('content-type')).toContain('text/markdown');
    expect(await exp.text()).toContain('# Agent Handoff');

    const ev = await app.request(
      `/api/projects/${project.id}/events`,
      json({ type: 'evidence_viewed', evidenceId: snap.evidence[0].id }),
    );
    expect(ev.status).toBe(200);
    const events = await j(await app.request(`/api/projects/${project.id}/events`));
    expect(events.events.some((e: any) => e.type === 'evidence_viewed')).toBe(true);

    const raw = await app.request(`/api/projects/${project.id}/raw/${snap.queries[0].rawResponseId}`);
    expect((await j(raw)).raw.provider).toBe('fixture');

    const invalid = await app.request(`/api/projects/${project.id}/stage`, json({ stage: 'VALIDATING' }));
    expect(invalid.status).toBe(409);
    expect((await app.request('/api/projects/nope')).status).toBe(404);
  });

  it('seeds a demo project', async () => {
    const app = createApp(makeCtx());
    const res = await app.request('/api/demo/seed', { method: 'POST' });
    expect(res.status).toBe(201);
    const body = await j(res);
    expect(body.buildPackageId).toMatch(/^bp_/);
  });
});
