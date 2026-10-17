/**
 * Retrieval status strip shown above a comparison table or a brief: did this investigation's own
 * searches execute? Separate from evidence provenance (finding origin) and verification (support level).
 */
import type { Finding, Investigation, QueryOutcomes, ResearchRun } from '@domain/types';
import { SUPPORT_LEVEL_LABEL } from '@domain/findings';

/**
 * Page-fetch line from persisted run counters. A run predating fetch instrumentation (no retrieval
 * tracking and nothing ever selected) reads as unknown rather than zero.
 */
export function describePages(run: ResearchRun | null | undefined): string {
  if (!run) return 'pages: unknown (run record not available)';
  const p = run.progress;
  const instrumented = p.retrieval !== null || p.pageFetchesSelected > 0;
  if (!instrumented) return 'pages: unknown (run predates fetch tracking)';
  if (run.budget.maxPageFetches === 0) return 'pages: none (this run does not fetch pages)';
  if (p.pageFetchesSelected === 0) return 'pages: none selected';
  const bits = [`${p.pageFetchesCompleted} of ${p.pageFetchesSelected} selected pages read`];
  if (p.pageFetchesFailed) bits.push(`${p.pageFetchesFailed} failed`);
  if (p.pageFetchesSuppressed) bits.push(`${p.pageFetchesSuppressed} excluded by fetch policy`);
  return `pages: ${bits.join(', ')}`;
}

export function describeFindings(findings: Finding[] | undefined): string {
  if (!findings) return 'findings: unknown';
  if (findings.length === 0) return 'findings: none';
  const order = ['full_page_excerpt_verified', 'full_page', 'snippet_only', 'inference'] as const;
  const counts = order
    .map((k) => [k, findings.filter((f) => f.supportLevel === k).length] as const)
    .filter(([, n]) => n > 0);
  return `findings: ${counts.map(([k, n]) => `${n} ${SUPPORT_LEVEL_LABEL[k].toLowerCase()}`).join(' · ')}`;
}

export function describeCandidate(o: QueryOutcomes | undefined): string {
  if (!o) return 'no searches planned';
  const bits: string[] = [];
  if (o.succeededEmpty) bits.push(`${o.succeededEmpty} empty`);
  if (o.rateLimited) bits.push(`${o.rateLimited} rate-limited`);
  if (o.transportFailed) bits.push(`${o.transportFailed} transport`);
  if (o.otherFailed) bits.push(`${o.otherFailed} failed`);
  if (o.skipped) bits.push(`${o.skipped} not attempted`);
  return `${o.succeeded}/${o.planned} searches executed${bits.length ? ` (${bits.join(', ')})` : ''}`;
}

export function RetrievalStrip({
  inv,
  candidates,
  kind,
  run,
  findings,
}: {
  inv: Investigation;
  candidates?: Array<{ id: string; title: string }>;
  kind: 'comparison' | 'brief';
  /** The investigation's run (for page-fetch counters); omit → "unknown". */
  run?: ResearchRun | null;
  /** This investigation's findings (for the support distribution); omit → "unknown". */
  findings?: Finding[];
}) {
  const detail = (
    <div className="small" style={{ marginTop: 4 }} data-testid="retrieval-detail">
      <div>searches: {inv.retrievalNote ?? 'unknown'}</div>
      <div>{describePages(run)}</div>
      <div>{describeFindings(findings)}</div>
    </div>
  );
  if (inv.retrieval === null || inv.retrieval === undefined) {
    return (
      <div className="notice notice-info" style={{ marginBottom: 10 }} data-testid="retrieval-strip">
        Retrieval status unknown: this {kind} predates retrieval tracking. Treat its conclusions as resting on
        earlier research only.
        {detail}
      </div>
    );
  }
  const tone =
    inv.retrieval === 'complete' ? 'notice-ok' : inv.retrieval === 'partial' ? 'notice-warn' : 'notice-error';
  const headline =
    inv.retrieval === 'complete'
      ? `Fresh retrieval complete — ${inv.retrievalNote}.`
      : inv.retrieval === 'partial'
        ? `Fresh retrieval incomplete — ${inv.retrievalNote}. Conclusions that depend on the missing searches are provisional.`
        : `No fresh search succeeded — ${inv.retrievalNote}. This ${kind} was built from earlier research (inherited evidence) only; its conclusions are provisional.`;
  const zero = candidates?.filter((c) => (inv.candidateRetrieval?.[c.id]?.succeeded ?? 0) === 0) ?? [];
  return (
    <div className={`notice ${tone}`} style={{ marginBottom: 10 }} data-testid="retrieval-strip">
      <div>
        <strong>{headline}</strong>
      </div>
      {detail}
      {candidates && inv.candidateRetrieval && (
        <div className="small" style={{ marginTop: 4 }}>
          {candidates.map((c) => (
            <div key={c.id}>
              {c.title}: {describeCandidate(inv.candidateRetrieval?.[c.id])}
              {(inv.candidateRetrieval?.[c.id]?.succeeded ?? 0) === 0 && (
                <span className="badge badge-warn" style={{ marginLeft: 6 }}>
                  no fresh evidence — provisional
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {inv.retrieval !== 'complete' && zero.length === 0 && candidates && (
        <div className="small" style={{ marginTop: 4 }}>
          Every candidate received at least one fresh search.
        </div>
      )}
    </div>
  );
}

export function OriginTag({ origin }: { origin: string }) {
  const map: Record<string, [string, string]> = {
    new: ['badge-ok', 'fresh evidence'],
    mixed: ['badge-accent', 'fresh + inherited'],
    inherited: ['badge-neutral', 'inherited evidence'],
    none: ['badge-neutral', 'no evidence'],
    unknown: ['badge-neutral', 'origin unknown'],
  };
  const [tone, label] = map[origin] ?? map.unknown!;
  return (
    <span
      className={`badge ${tone}`}
      title="Discovery origin of the cited evidence relative to this investigation's own searches"
    >
      {label}
    </span>
  );
}
