/**
 * Fetch-failure policy: deterministic, per exact URL (evidence row), never per domain.
 *   404 / 410 / unsupported content / blocked URL  → suppressed permanently
 *   401 / 403                                       → suppressed until fetchedAt + fetchSuppressForbiddenMs
 *   empty extracted text                            → suppressed until fetchedAt + fetchSuppressEmptyMs
 *   timeout / network / 5xx / too large / redirects → eligible again (bounded by the run's fetch budget)
 * Suppressed sources stay in search results, findings and the inspector; they are only kept out of the
 * page-selection candidate list, and every exclusion is recorded as a `page_fetch_suppressed` event.
 */
import type { Evidence } from '@domain/types';

export interface FetchPolicyConfig {
  fetchSuppressForbiddenMs: number;
  fetchSuppressEmptyMs: number;
}

export type Suppression =
  { suppressed: false } | { suppressed: true; reason: string; permanent: boolean; until: string | null };

export function fetchSuppression(e: Evidence, now: Date, cfg: FetchPolicyConfig): Suppression {
  if (e.fetchStatus === 'snippet_only' || e.fetchStatus === 'fetch_pending') return { suppressed: false };
  if (e.fetchStatus === 'fetched')
    return { suppressed: true, reason: 'already fetched', permanent: true, until: null };
  if (e.fetchStatus === 'unavailable')
    return {
      suppressed: true,
      reason: `blocked or unservable URL (${e.fetchError ?? 'unavailable'})`,
      permanent: true,
      until: null,
    };
  // fetch_failed: classify by the persisted error string
  const err = e.fetchError ?? '';
  const status = e.httpStatus ?? Number(err.match(/HTTP (\d{3})/)?.[1] ?? 0);
  const failedAt = e.fetchedAt ? new Date(e.fetchedAt).getTime() : 0;
  const temp = (ms: number, why: string): Suppression => {
    const until = failedAt + ms;
    if (!failedAt || now.getTime() >= until) return { suppressed: false };
    return { suppressed: true, reason: why, permanent: false, until: new Date(until).toISOString() };
  };
  if (status === 404 || status === 410)
    return { suppressed: true, reason: `HTTP ${status} (gone)`, permanent: true, until: null };
  if (err.startsWith('unsupported_content'))
    return { suppressed: true, reason: 'unsupported content type', permanent: true, until: null };
  if (status === 401 || status === 403)
    return temp(cfg.fetchSuppressForbiddenMs, `HTTP ${status} (forbidden) — cooldown`);
  if (err.startsWith('empty')) return temp(cfg.fetchSuppressEmptyMs, 'no readable text — cooldown');
  return { suppressed: false }; // timeout, network, 5xx, too_large, too_many_redirects, unknown
}
