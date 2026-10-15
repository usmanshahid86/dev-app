/**
 * Data backfill that runs after SQL migrations (Drizzle migrations are SQL-only).
 * Idempotent: fills canonical_url/domain/category for V0 evidence rows and creates the missing
 * first-discovery rows. V0 signals are already 'raw' by column default; they are promoted to
 * standalone consolidated signals lazily only when a project is re-run (clusters keep citing them).
 */
import { eq, isNull, sql } from 'drizzle-orm';
import type { Db } from './client';
import * as t from './schema';
import { canonicalizeUrl } from '@domain/canonicalUrl';
import { classifySource } from '@domain/sourceCategory';
import { randomUUID } from 'node:crypto';

export function backfillV01(db: Db): { canonicalized: number; discoveriesCreated: number } {
  let canonicalized = 0;
  let discoveriesCreated = 0;
  const rows = db.select().from(t.evidence).where(eq(t.evidence.canonicalUrl, '')).all();
  for (const r of rows) {
    const c = canonicalizeUrl(r.url);
    const cls = classifySource(r.url, r.title);
    db.update(t.evidence)
      .set({
        canonicalUrl: c?.canonicalUrl ?? r.url,
        domain: c?.domain ?? '',
        category: cls.category,
        categoryConfidence: cls.confidence,
        fetchStatus: r.fullText ? 'fetched' : 'snippet_only',
      })
      .where(eq(t.evidence.id, r.id))
      .run();
    canonicalized++;
  }
  const missing = db
    .select({ e: t.evidence })
    .from(t.evidence)
    .leftJoin(t.evidenceDiscoveries, eq(t.evidenceDiscoveries.evidenceId, t.evidence.id))
    .where(isNull(t.evidenceDiscoveries.id))
    .all();
  for (const { e } of missing) {
    const q = db
      .select({ runId: t.researchQueries.runId })
      .from(t.researchQueries)
      .where(eq(t.researchQueries.id, e.queryId))
      .get();
    db.insert(t.evidenceDiscoveries)
      .values({
        id: `disc_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        projectId: e.projectId,
        evidenceId: e.id,
        queryId: e.queryId,
        runId: q?.runId ?? 'unknown',
        position: e.position,
        provider: e.provider,
        providerMeta: e.providerMeta as any,
        url: e.url,
        retrievedAt: e.retrievedAt,
      })
      .run();
    discoveriesCreated++;
  }
  void sql;
  return { canonicalized, discoveriesCreated };
}
