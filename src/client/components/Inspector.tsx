/**
 * Global inspector drawer.
 *  - Evidence inspector: why is this on my screen? canonical source, every discovery that found it,
 *    category, fetch state, page text, signals/opportunities/findings built on it, usage flags.
 *  - Research inspector: finding → fact/inference → support level → excerpts → source page → category
 *    → discovery queries → consolidated/raw signals → opportunity.
 *  - Signal inspector: consolidated signal → component raw signals → evidence.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useProjectCtx } from '../lib/useProject';
import { api, type Snapshot } from '../lib/api';
import { opportunitiesForEvidence, rawSignalsForConsolidated, consolidatedForRaw } from '@domain/lineage';
import { DemoTag, SupportBadge, FetchBadge, CategoryBadge, CorroborationLine } from './Badges';
import type { Evidence, Finding } from '@domain/types';

type Target =
  | { kind: 'evidence'; id: string; from?: string }
  | { kind: 'finding'; id: string }
  | { kind: 'signal'; id: string }
  | null;

const Ctx = createContext<{ target: Target; open: (t: Target) => void; close: () => void } | null>(null);

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target>(null);
  return (
    <Ctx.Provider value={{ target, open: setTarget, close: () => setTarget(null) }}>{children}</Ctx.Provider>
  );
}
export function useInspector() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useInspector outside provider');
  return c;
}

export function EvidenceChip({ id, from }: { id: string; from?: string }) {
  const { open } = useInspector();
  return (
    <button
      type="button"
      className="chip chip-evidence"
      onClick={(e) => {
        e.stopPropagation();
        open({ kind: 'evidence', id, from });
      }}
      title="Inspect evidence"
    >
      {id}
    </button>
  );
}
export function FindingChip({ id, inference }: { id: string; inference?: boolean }) {
  const { open } = useInspector();
  return (
    <button
      type="button"
      className={`chip ${inference ? 'chip-inference' : 'chip-finding'}`}
      onClick={(e) => {
        e.stopPropagation();
        open({ kind: 'finding', id });
      }}
      title="Inspect finding"
    >
      {id}
    </button>
  );
}
export function SignalChip({ id }: { id: string }) {
  const { open } = useInspector();
  return (
    <button
      type="button"
      className="chip chip-signal"
      onClick={(e) => {
        e.stopPropagation();
        open({ kind: 'signal', id });
      }}
      title="Inspect signal"
    >
      {id}
    </button>
  );
}

export function Inspector() {
  const { target, close } = useInspector();
  const ctx = useProjectCtx();
  if (!target) return null;
  const snap = ctx.snapshot;
  return (
    <>
      <div className="drawer-backdrop" onClick={close} />
      <aside className="drawer" role="dialog" aria-label="Inspector">
        <div className="drawer-head">
          <h2>
            {target.kind === 'evidence'
              ? 'Evidence inspector'
              : target.kind === 'finding'
                ? 'Research inspector'
                : 'Signal inspector'}
          </h2>
          <button className="btn btn-sm" onClick={close}>
            Close
          </button>
        </div>
        {!snap ? (
          <div className="muted">No project loaded.</div>
        ) : target.kind === 'evidence' ? (
          <EvidenceView snap={snap} id={target.id} projectId={ctx.projectId} from={target.from} />
        ) : target.kind === 'finding' ? (
          <FindingView snap={snap} id={target.id} projectId={ctx.projectId} />
        ) : (
          <SignalView snap={snap} id={target.id} />
        )}
      </aside>
    </>
  );
}

function Node({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="chain-node">
      <div className="label">{label}</div>
      {children}
    </div>
  );
}
const Arrow = () => <div className="chain-arrow">↓</div>;
const Inf = ({ children }: { children: ReactNode }) => (
  <span>
    <span className="inference-tag">INFERENCE · </span>
    {children}
  </span>
);

function DiscoveryList({ snap, evidenceId }: { snap: Snapshot; evidenceId: string }) {
  const discs = snap.discoveries.filter((d) => d.evidenceId === evidenceId);
  const qById = new Map(snap.queries.map((q) => [q.id, q]));
  const runById = new Map(snap.runs.map((r) => [r.id, r]));
  if (!discs.length) return <div className="muted small">No discovery records.</div>;
  return (
    <ul className="small" style={{ marginBottom: 4 }}>
      {discs.map((d) => {
        const q = qById.get(d.queryId);
        const r = runById.get(d.runId);
        return (
          <li key={d.id}>
            “{q?.query ?? d.queryId}”{' '}
            <span className="muted">
              ({q?.family ?? '?'} · {r?.kind ?? d.runId} · {d.provider} · position {d.position ?? '?'}
              {d.providerMeta && (d.providerMeta as any).foundBy
                ? ` · found by ${((d.providerMeta as any).foundBy as string[]).join(', ')}`
                : ''}
              )
            </span>
            {d.url !== snap.evidence.find((e) => e.id === evidenceId)?.url && (
              <div className="url muted">as {d.url}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PageText({ projectId, e }: { projectId: string; e: Evidence }) {
  const [text, setText] = useState<string | null | undefined>(undefined);
  if (e.fetchStatus !== 'fetched') return null;
  return (
    <div style={{ margin: '8px 0' }}>
      {text === undefined ? (
        <button
          className="btn-link small"
          onClick={() => api.evidenceText(projectId, e.id).then((r) => setText(r.text ?? ''))}
        >
          Show retained page text ({e.textChars} chars{e.textTruncated ? ', truncated' : ''})
        </button>
      ) : (
        <pre
          className="small"
          style={{
            maxHeight: 260,
            overflow: 'auto',
            background: 'var(--surface-2)',
            padding: 8,
            borderRadius: 4,
            whiteSpace: 'pre-wrap',
          }}
        >
          {text}
        </pre>
      )}
    </div>
  );
}

function EvidenceView({
  snap,
  id,
  projectId,
  from,
}: {
  snap: Snapshot;
  id: string;
  projectId: string;
  from?: string;
}) {
  const { open } = useInspector();
  const e = snap.evidence.find((x) => x.id === id);
  useEffect(() => {
    if (e) api.evidenceViewed(projectId, id, from ?? 'inspector');
  }, [projectId, id, e, from]);
  const [raw, setRaw] = useState<string | null>(null);
  if (!e) return <div className="muted">Evidence {id} not found.</div>;
  const q = snap.queries.find((x) => x.id === e.queryId);
  const rawSignals = snap.signals.filter((s) => s.kind === 'raw' && s.evidenceIds.includes(e.id));
  const consSignals = snap.signals.filter((s) => s.kind === 'consolidated' && s.evidenceIds.includes(e.id));
  const opps = opportunitiesForEvidence(e.id, snap.signals, snap.opportunities);
  const findings = snap.findings.filter((f) => f.evidenceIds.includes(e.id));
  const siblings = snap.evidence.filter((x) => x.queryId === e.queryId && x.id !== e.id);
  const usage = snap.evidenceUsage[e.id];
  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="chip chip-evidence">{e.id}</span>
        <DemoTag show={e.isDemo} />
        <CategoryBadge category={e.category} confidence={e.categoryConfidence} />
        <FetchBadge status={e.fetchStatus} />
        <span className="badge badge-neutral">{e.provider}</span>
      </div>
      <h3>{e.pageTitle || e.title}</h3>
      <div className="url">
        <a href={e.url} target="_blank" rel="noreferrer">
          {e.canonicalUrl || e.url}
        </a>
      </div>
      {e.canonicalUrl && e.canonicalUrl !== e.url && (
        <div className="small muted">
          first seen as <span className="url">{e.url}</span>
        </div>
      )}
      <p style={{ marginTop: 8 }}>{e.snippet}</p>
      <dl className="kv">
        <dt>Domain</dt>
        <dd>{e.domain}</dd>
        <dt>Retrieved</dt>
        <dd>{new Date(e.retrievedAt).toLocaleString()}</dd>
        <dt>Page fetch</dt>
        <dd>
          {e.fetchStatus === 'fetched' ? (
            <>
              HTTP {e.httpStatus} · {e.contentType} · {e.textChars} chars
              {e.textTruncated ? ' (truncated)' : ''} · hash <code>{e.textHash?.slice(0, 12)}</code> ·{' '}
              {e.fetchedAt && new Date(e.fetchedAt).toLocaleString()}
            </>
          ) : e.fetchStatus === 'snippet_only' ? (
            <span className="muted">not fetched — only the search snippet is known</span>
          ) : (
            <span style={{ color: 'var(--danger)' }}>{e.fetchError ?? e.fetchStatus}</span>
          )}
        </dd>
        {e.providerMeta && (
          <>
            <dt>Provider meta</dt>
            <dd>
              <code>{JSON.stringify(e.providerMeta)}</code>
            </dd>
          </>
        )}
      </dl>
      <PageText projectId={projectId} e={e} />
      {q?.rawResponseId && (
        <div style={{ margin: '4px 0 8px' }}>
          {raw === null ? (
            <button
              className="btn-link small"
              onClick={() => api.raw(projectId, q.rawResponseId!).then((r) => setRaw(r.body))}
            >
              Show raw provider response
            </button>
          ) : (
            <pre
              className="small"
              style={{
                maxHeight: 200,
                overflow: 'auto',
                background: 'var(--surface-2)',
                padding: 8,
                borderRadius: 4,
              }}
            >
              {raw}
            </pre>
          )}
        </div>
      )}
      <h4 style={{ marginTop: 12 }}>
        Discovered by ({snap.discoveries.filter((d) => d.evidenceId === e.id).length} discover
        {snap.discoveries.filter((d) => d.evidenceId === e.id).length === 1 ? 'y' : 'ies'})
      </h4>
      <DiscoveryList snap={snap} evidenceId={e.id} />
      {usage && (
        <>
          <h4 style={{ marginTop: 12 }}>What happened to this result</h4>
          <div className="row small">
            {(
              [
                ['returned', usage.returned > 0],
                ['promoted to evidence', usage.promoted],
                ['selected for fetch', usage.fetchSelected],
                ['fetched', usage.fetched],
                ['raw signal', usage.usedInRawSignal],
                ['consolidated signal', usage.usedInConsolidatedSignal],
                ['opportunity', usage.usedInOpportunity],
                ['finding', usage.usedInFinding],
                ['inspected by you', usage.inspectedByHuman],
              ] as Array<[string, boolean]>
            ).map(([l, v]) => (
              <span key={l} className={`badge ${v ? 'badge-ok' : 'badge-neutral'}`}>
                {v ? '✓' : '–'} {l}
              </span>
            ))}
          </div>
        </>
      )}
      <h4 style={{ marginTop: 12 }}>Raw signals extracted from this evidence ({rawSignals.length})</h4>
      {rawSignals.length === 0 && (
        <div className="muted small">
          None — this page was returned by search but the agent did not consider it useful evidence.
        </div>
      )}
      {rawSignals.map((s) => (
        <div key={s.id} className="finding">
          <div className="row">
            <SignalChip id={s.id} />
            <span className="badge badge-neutral">{s.type}</span>
            <span className="badge badge-neutral">confidence {s.confidence}</span>
            {consolidatedForRaw(s.id, snap.signals) && (
              <span className="small muted">
                → <SignalChip id={consolidatedForRaw(s.id, snap.signals)!.id} />
              </span>
            )}
          </div>
          <div>
            <strong>Observed:</strong> {s.observation}
          </div>
          {s.inference && (
            <div>
              <Inf>{s.inference}</Inf>
            </div>
          )}
        </div>
      ))}
      {consSignals.length > 0 && (
        <h4 style={{ marginTop: 12 }}>Consolidated signals ({consSignals.length})</h4>
      )}
      {consSignals.map((s) => (
        <div key={s.id} className="small">
          • <SignalChip id={s.id} /> {s.observation}
        </div>
      ))}
      <h4 style={{ marginTop: 12 }}>Opportunities built on it ({opps.length})</h4>
      {opps.map((o) => (
        <div key={o.id} className="small">
          • {o.title}
        </div>
      ))}
      {findings.length > 0 && (
        <>
          <h4 style={{ marginTop: 12 }}>Findings citing it ({findings.length})</h4>
          {findings.map((f) => (
            <div key={f.id} className="small">
              • <FindingChip id={f.id} inference={f.kind === 'inference'} />{' '}
              <SupportBadge level={f.supportLevel} /> {f.claim}
            </div>
          ))}
        </>
      )}
      {siblings.length > 0 && (
        <>
          <h4 style={{ marginTop: 12 }}>Other results from the same search ({siblings.length})</h4>
          <div className="small muted" style={{ marginBottom: 4 }}>
            Returned by search; not necessarily relevant or used.
          </div>
          {siblings.map((s) => (
            <div key={s.id} className="small">
              •{' '}
              <button
                className="btn-link"
                onClick={() => open({ kind: 'evidence', id: s.id, from: 'sibling' })}
              >
                {s.title}
              </button>{' '}
              <span className="muted">
                {snap.evidenceUsage[s.id]?.usedInRawSignal ? '(used)' : '(unused)'}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function FindingView({ snap, id, projectId }: { snap: Snapshot; id: string; projectId: string }) {
  const { open } = useInspector();
  const f = snap.findings.find((x) => x.id === id) as Finding | undefined;
  if (!f) return <div className="muted">Finding {id} not found.</div>;
  const evs = f.evidenceIds
    .map((eid) => snap.evidence.find((e) => e.id === eid))
    .filter(Boolean) as Evidence[];
  const consSignals = snap.signals.filter(
    (s) => s.kind === 'consolidated' && s.evidenceIds.some((e) => f.evidenceIds.includes(e)),
  );
  const opps = snap.opportunities.filter((o) =>
    o.signalIds.some((sid) => consSignals.some((s) => s.id === sid)),
  );
  return (
    <div>
      <div className="chain">
        <Node label="Finding">
          <div className="row" style={{ marginBottom: 4 }}>
            <FindingChip id={f.id} inference={f.kind === 'inference'} />
            <span className="badge badge-neutral">{f.section}</span>
          </div>
          <div>{f.claim}</div>
        </Node>
        <Arrow />
        <Node label="Fact or inference">
          <span className={`badge ${f.kind === 'inference' ? 'badge-demo' : 'badge-ok'}`}>
            {f.kind === 'inference' ? 'model inference' : 'sourced fact'}
          </span>
          <span className="small muted" style={{ marginLeft: 8 }}>
            {f.kind === 'inference'
              ? 'The agent concluded this; sources may inform it but do not state it.'
              : 'A cited source states this.'}
          </span>
        </Node>
        <Arrow />
        <Node label="Support">
          <div className="row">
            <SupportBadge level={f.supportLevel} />
            <span className="badge badge-neutral">agent-rated {f.supportStrength}</span>
          </div>
          <div className="small muted" style={{ marginTop: 4 }}>
            {f.supportLevel === 'full_page_excerpt_verified' &&
              'A quoted passage was verified against the retained text of a fetched source page.'}
            {f.supportLevel === 'full_page' &&
              'A cited source page was fetched and read in full, but no quoted passage could be verified.'}
            {f.supportLevel === 'snippet_only' &&
              'This finding rests only on search-result snippets; the page was not fetched or was unavailable.'}
            {f.supportLevel === 'inference' && 'Inferences carry no source support by definition.'}
          </div>
        </Node>
        <Arrow />
        <Node label={`Supporting excerpts (${f.excerpts.length})`}>
          {f.excerpts.length === 0 && <div className="muted small">No excerpts claimed.</div>}
          {f.excerpts.map((x, i) => (
            <div key={i} className="small" style={{ marginBottom: 6 }}>
              <span className={`badge ${x.verified ? 'badge-ok' : 'badge-bad'}`}>
                {x.verified ? `verified against ${x.note.replace('_', ' ')}` : x.note}
              </span>
              <blockquote
                style={{ margin: '4px 0 0', paddingLeft: 10, borderLeft: '3px solid var(--border-strong)' }}
              >
                “{x.excerpt}”
              </blockquote>
              <span className="muted">
                from <EvidenceChip id={x.evidenceId} from="research-inspector" />
              </span>
            </div>
          ))}
        </Node>
        <Arrow />
        <Node label={`Evidence cited (${evs.length})`}>
          {evs.length === 0 && <div className="muted small">None.</div>}
          {evs.map((e) => (
            <div key={e.id} style={{ marginBottom: 10 }}>
              <div className="row">
                <EvidenceChip id={e.id} from="research-inspector" />
                <DemoTag show={e.isDemo} />
                <CategoryBadge category={e.category} confidence={e.categoryConfidence} />
                <FetchBadge status={e.fetchStatus} />
              </div>
              <div>
                <strong>{e.pageTitle || e.title}</strong>
              </div>
              <div className="small">
                <a className="url" href={e.url} target="_blank" rel="noreferrer">
                  {e.canonicalUrl || e.url}
                </a>
              </div>
              {e.fetchStatus === 'fetched' && (
                <div className="small muted">
                  {e.textChars} chars retained{e.textTruncated ? ' (truncated)' : ''} · HTTP {e.httpStatus}
                </div>
              )}
              <div className="chain-arrow">↓</div>
              <div className="small">
                <span className="label">Discovered by</span>
              </div>
              <DiscoveryList snap={snap} evidenceId={e.id} />
            </div>
          ))}
        </Node>
        {consSignals.length > 0 && (
          <>
            <Arrow />
            <Node label={`Signals on the same evidence (${consSignals.length})`}>
              {consSignals.map((s) => (
                <div key={s.id} className="small">
                  • <SignalChip id={s.id} /> {s.observation}{' '}
                  <span className="muted">({rawSignalsForConsolidated(s, snap.signals).length} raw)</span>
                </div>
              ))}
            </Node>
          </>
        )}
        {opps.length > 0 && (
          <>
            <Arrow />
            <Node label="Opportunity">
              {opps.map((o) => (
                <div key={o.id}>{o.title}</div>
              ))}
            </Node>
          </>
        )}
      </div>
      <PageText
        projectId={projectId}
        e={
          evs.find((e) => e.fetchStatus === 'fetched') ??
          evs[0] ??
          ({ fetchStatus: 'snippet_only' } as Evidence)
        }
      />
      <div className="small muted" style={{ marginTop: 8 }}>
        Other evidence from the same searches is listed in each evidence inspector; it was returned by search,
        not necessarily relevant or used.
      </div>
      <span style={{ display: 'none' }}>{String(open)}</span>
    </div>
  );
}

function SignalView({ snap, id }: { snap: Snapshot; id: string }) {
  const s = snap.signals.find((x) => x.id === id);
  if (!s) return <div className="muted">Signal {id} not found.</div>;
  const cluster = snap.clusters.find((c) => c.signalIds.includes(s.id));
  const opps = snap.opportunities.filter((o) => o.signalIds.includes(s.id));
  const components = s.kind === 'consolidated' ? rawSignalsForConsolidated(s, snap.signals) : [];
  const parent = s.kind === 'raw' ? consolidatedForRaw(s.id, snap.signals) : undefined;
  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <SignalChip id={s.id} />
        <span className={`badge ${s.kind === 'consolidated' ? 'badge-accent' : 'badge-neutral'}`}>
          {s.kind}
        </span>
        <span className="badge badge-neutral">{s.type}</span>
        <span className="badge badge-neutral">confidence {s.confidence}</span>
      </div>
      {s.stats && (
        <div style={{ marginBottom: 8 }}>
          <CorroborationLine c={s.stats} />
        </div>
      )}
      <dl className="kv">
        <dt>Observed</dt>
        <dd>{s.observation}</dd>
        <dt>Inference</dt>
        <dd>{s.inference ? <Inf>{s.inference}</Inf> : <span className="muted">none</span>}</dd>
        <dt>Affected user</dt>
        <dd>{s.affectedUser ?? <span className="muted">unknown</span>}</dd>
        <dt>Uncertainty</dt>
        <dd>{s.uncertainty}</dd>
        <dt>Evidence</dt>
        <dd className="row">
          {s.evidenceIds.map((e) => (
            <EvidenceChip key={e} id={e} from="signal-inspector" />
          ))}
        </dd>
        {s.kind === 'consolidated' && (
          <>
            <dt>Built from</dt>
            <dd>
              {components.length} raw signal{components.length === 1 ? '' : 's'}
              {components.map((c) => (
                <div key={c.id} className="small">
                  • <SignalChip id={c.id} /> {c.observation}
                </div>
              ))}
            </dd>
          </>
        )}
        {parent && (
          <>
            <dt>Consolidated into</dt>
            <dd>
              <SignalChip id={parent.id} /> {parent.observation}
            </dd>
          </>
        )}
        <dt>Cluster</dt>
        <dd>
          {cluster ? (
            <>
              {cluster.label}
              <div className="small muted">{cluster.rationale}</div>
            </>
          ) : (
            <span className="muted">not clustered</span>
          )}
        </dd>
        <dt>Opportunities</dt>
        <dd>
          {opps.length ? (
            opps.map((o) => <div key={o.id}>{o.title}</div>)
          ) : (
            <span className="muted">none</span>
          )}
        </dd>
      </dl>
    </div>
  );
}
