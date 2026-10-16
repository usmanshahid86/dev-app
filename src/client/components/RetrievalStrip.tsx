/**
 * Retrieval status strip shown above a comparison table or a brief: did this investigation's own
 * searches execute? Separate from evidence provenance (finding origin) and verification (support level).
 */
import type { Investigation, QueryOutcomes } from '@domain/types';

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
}: {
  inv: Investigation;
  candidates?: Array<{ id: string; title: string }>;
  kind: 'comparison' | 'brief';
}) {
  if (inv.retrieval === null || inv.retrieval === undefined) {
    return (
      <div className="notice notice-info" style={{ marginBottom: 10 }} data-testid="retrieval-strip">
        Retrieval status unknown: this {kind} predates retrieval tracking. Treat its conclusions as resting on
        earlier research only.
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
