import { describe, it, expect } from 'vitest';
import { fetchSuppression } from '@workflows/fetchPolicy';
import { makeCtx } from '../helpers';
import { createProject, projectSnapshot } from '@workflows/projects';
import { startDiscovery } from '@workflows/discovery';
import { startDeepInvestigation } from '@workflows/investigation';
import { drain } from '@workflows/runs';
import { ev } from '../domain/lineage.test';
import { PageFetchError, type PageFetcher } from '@providers/fetch/PageFetcher';
import { FixturePageFetcher } from '@providers/fetch/fixture';

const cfg = { fetchSuppressForbiddenMs: 7 * 24 * 3_600_000, fetchSuppressEmptyMs: 24 * 3_600_000 };
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
const failed = (error: string, hoursAgo: number, httpStatus: number | null = null) =>
  ev('ev_x', { fetchStatus: 'fetch_failed', fetchError: error, fetchedAt: at(hoursAgo), httpStatus });

describe('fetch-failure policy (exact URL, never domain)', () => {
  it('never-fetched and stale-pending rows are eligible', () => {
    expect(fetchSuppression(ev('a'), new Date(), cfg)).toEqual({ suppressed: false });
    expect(fetchSuppression(ev('a', { fetchStatus: 'fetch_pending' }), new Date(), cfg)).toEqual({
      suppressed: false,
    });
  });
  it('404 / 410 / unsupported content / blocked URL are suppressed permanently', () => {
    for (const [err, st] of [
      ['http_error: HTTP 404', 404],
      ['http_error: HTTP 410', 410],
    ] as const)
      expect(fetchSuppression(failed(err, 1000, st), new Date(), cfg)).toMatchObject({
        suppressed: true,
        permanent: true,
      });
    expect(
      fetchSuppression(
        failed('unsupported_content: unsupported content type application/pdf', 1000),
        new Date(),
        cfg,
      ),
    ).toMatchObject({ suppressed: true, permanent: true });
    expect(
      fetchSuppression(
        ev('b', { fetchStatus: 'unavailable', fetchError: 'blocked_url: host is blocked' }),
        new Date(),
        cfg,
      ),
    ).toMatchObject({ suppressed: true, permanent: true });
  });
  it('401 / 403 are suppressed during the cooldown and eligible after it', () => {
    const recent = fetchSuppression(failed('http_error: HTTP 403', 1, 403), new Date(), cfg);
    expect(recent).toMatchObject({ suppressed: true, permanent: false });
    expect((recent as { until: string }).until > new Date().toISOString()).toBe(true);
    expect(fetchSuppression(failed('http_error: HTTP 403', 24 * 8, 403), new Date(), cfg)).toEqual({
      suppressed: false,
    });
    expect(fetchSuppression(failed('http_error: HTTP 401', 1, 401), new Date(), cfg)).toMatchObject({
      suppressed: true,
      permanent: false,
    });
  });
  it('empty text is suppressed for its own shorter cooldown', () => {
    expect(fetchSuppression(failed('empty: no readable text', 1), new Date(), cfg)).toMatchObject({
      suppressed: true,
      permanent: false,
    });
    expect(fetchSuppression(failed('empty: no readable text', 25), new Date(), cfg)).toEqual({
      suppressed: false,
    });
  });
  it('timeout, network, 5xx, too large and redirects stay eligible', () => {
    for (const err of [
      'timeout: timed out after 15000ms',
      'network: socket hang up',
      'http_error: HTTP 503',
      'too_large: body exceeds limit',
      'too_many_redirects: more than 5 redirects',
    ])
      expect(fetchSuppression(failed(err, 0.1, err.includes('503') ? 503 : null), new Date(), cfg)).toEqual({
        suppressed: false,
      });
  });
  it('a 403 row with no fetchedAt is treated as eligible (nothing to time a cooldown from)', () => {
    expect(
      fetchSuppression(
        ev('c', { fetchStatus: 'fetch_failed', fetchError: 'http_error: HTTP 403', fetchedAt: null }),
        new Date(),
        cfg,
      ),
    ).toEqual({ suppressed: false });
  });
});

/** Fixture fetcher that answers 403 for the FIRST url it is asked for (and that url forever after), so the selector must fill its budget from alternatives next time. */
function forbidding(): PageFetcher & { forbidden: string | null } {
  const base = new FixturePageFetcher();
  const f: PageFetcher & { forbidden: string | null } = {
    name: 'fixture-403',
    isDemo: true,
    forbidden: null,
    fetchPage: async (u) => {
      if (f.forbidden === null) f.forbidden = u;
      if (u === f.forbidden) throw new PageFetchError('HTTP 403', 'http_error', 403);
      return base.fetchPage(u);
    },
  };
  return f;
}

describe('selection under the policy', () => {
  it('a URL that failed with 403 is excluded next time, recorded as suppressed, and the budget is filled from alternatives', async () => {
    const fetcher = forbidding();
    const ctx = makeCtx({
      pageFetcher: fetcher,
      config: { investigationMaxPageFetches: 3, investigationMaxQueries: 2 },
    });
    const p = createProject(ctx, {});
    startDiscovery(ctx, p.id);
    await drain();
    const opp = ctx.repos.listOpportunities(p.id).find((o) => o.title.toLowerCase().includes('portable'))!;
    // run 1: the first selected page answers 403 → recorded on that row
    startDeepInvestigation(ctx, p.id, opp.id);
    await drain();
    const forbiddenUrl = fetcher.forbidden!;
    const after1 = projectSnapshot(ctx, p.id);
    const row = after1.evidence.find((e) => e.url === forbiddenUrl)!;
    expect(row.fetchStatus).toBe('fetch_failed');
    expect(row.fetchError).toMatch(/HTTP 403/);
    const run1 = after1.runs.find((r) => r.kind === 'investigation')!;
    expect(run1.progress.pageFetchesFailed).toBe(1);
    expect(run1.progress.pageFetchesSuppressed).toBe(0);
    // run 2 (go back and investigate again): the 403 URL is not offered; three other pages are read
    ctx.repos.updateProject(p.id, { stage: 'OPPORTUNITIES_READY' });
    startDeepInvestigation(ctx, p.id, opp.id);
    await drain();
    const after2 = projectSnapshot(ctx, p.id);
    const run2 = after2.runs.find((r) => r.kind === 'investigation' && r.id !== run1.id)!;
    expect(run2.progress.pageFetchesSuppressed).toBe(1);
    expect(run2.progress.pageFetchesSelected).toBe(3);
    expect(run2.progress.pageFetchesCompleted).toBe(3);
    expect(run2.progress.pageFetchesFailed).toBe(0);
    const sup = ctx.repos
      .listEvents(p.id, 10000)
      .filter((e) => e.type === 'page_fetch_suppressed' && e.payload.runId === run2.id);
    expect(sup).toHaveLength(1);
    expect(sup[0]!.payload).toMatchObject({
      url: forbiddenUrl,
      permanent: false,
      reason: expect.stringMatching(/403/),
    });
    expect(typeof sup[0]!.payload.until).toBe('string');
    // the suppressed source is still evidence, still in findings' allowed set, still inspectable
    expect(after2.evidence.some((e) => e.url === forbiddenUrl)).toBe(true);
    expect(after2.findings.some((f) => f.evidenceIds.includes(row.id))).toBe(true);
    // after the cooldown it is eligible again
    ctx.repos.updateEvidence(row.id, { fetchedAt: new Date(Date.now() - 8 * 24 * 3_600_000).toISOString() });
    ctx.repos.updateProject(p.id, { stage: 'OPPORTUNITIES_READY' });
    startDeepInvestigation(ctx, p.id, opp.id);
    await drain();
    const run3 = projectSnapshot(ctx, p.id)
      .runs.filter((r) => r.kind === 'investigation')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .at(-1)!;
    expect(run3.progress.pageFetchesSuppressed).toBe(0);
  });
});
