/**
 * Global inspector drawer: Evidence inspector (why is this on my screen?) and Research inspector
 * (finding → evidence → source → query → other evidence from the same search).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useProjectCtx } from '../lib/useProject';
import { api, type Snapshot } from '../lib/api';
import { opportunitiesForEvidence } from '@domain/lineage';
import { DemoTag } from './Badges';

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
  // Rendered inside ProjectLayout, so a project context is always present.
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
          <FindingView snap={snap} id={target.id} />
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
  const signals = snap.signals.filter((s) => s.evidenceIds.includes(e.id));
  const opps = opportunitiesForEvidence(e.id, snap.signals, snap.opportunities);
  const findings = snap.findings.filter((f) => f.evidenceIds.includes(e.id));
  const siblings = snap.evidence.filter((x) => x.queryId === e.queryId && x.id !== e.id);
  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="chip chip-evidence">{e.id}</span>
        <DemoTag show={e.isDemo} />
        <span className="badge badge-neutral">{e.provider}</span>
        {e.position !== null && <span className="badge badge-neutral">position {e.position}</span>}
      </div>
      <h3>{e.title}</h3>
      <div className="url">
        <a href={e.url} target="_blank" rel="noreferrer">
          {e.url}
        </a>
      </div>
      <p style={{ marginTop: 8 }}>{e.snippet}</p>
      <dl className="kv">
        <dt>Retrieved</dt>
        <dd>{new Date(e.retrievedAt).toLocaleString()}</dd>
        <dt>Discovered by</dt>
        <dd>
          {q ? (
            <>
              <em>“{q.query}”</em>{' '}
              <span className="muted small">
                ({q.family} · {q.purpose})
              </span>
            </>
          ) : (
            '—'
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
      {q?.rawResponseId && (
        <div style={{ margin: '8px 0' }}>
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
      <h4 style={{ marginTop: 12 }}>Signals extracted from this evidence ({signals.length})</h4>
      {signals.length === 0 && (
        <div className="muted small">
          None — this page was returned by search but the agent did not consider it useful evidence.
        </div>
      )}
      {signals.map((s) => (
        <div key={s.id} className="finding">
          <div className="row">
            <SignalChip id={s.id} />
            <span className="badge badge-neutral">{s.type}</span>
            <span className="badge badge-neutral">confidence {s.confidence}</span>
          </div>
          <div>
            <strong>Observed:</strong> {s.observation}
          </div>
          {s.inference && (
            <div>
              <span className="inference-tag">INFERENCE</span> {s.inference}
            </div>
          )}
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
              • <FindingChip id={f.id} inference={f.kind === 'inference'} /> {f.claim}
            </div>
          ))}
        </>
      )}
      {siblings.length > 0 && (
        <>
          <h4 style={{ marginTop: 12 }}>Other evidence returned by the same search ({siblings.length})</h4>
          <div className="small muted" style={{ marginBottom: 4 }}>
            Returned together; not necessarily relevant.
          </div>
          {siblings.map((s) => (
            <div key={s.id} className="small">
              •{' '}
              <button
                className="btn-link"
                onClick={() => open({ kind: 'evidence', id: s.id, from: 'sibling' })}
              >
                {s.title}
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function FindingView({ snap, id }: { snap: Snapshot; id: string }) {
  const { open } = useInspector();
  const f = snap.findings.find((x) => x.id === id);
  if (!f) return <div className="muted">Finding {id} not found.</div>;
  const evs = f.evidenceIds
    .map((eid) => snap.evidence.find((e) => e.id === eid))
    .filter(Boolean) as Snapshot['evidence'];
  return (
    <div>
      <div className="chain">
        <Node
          label={`Finding · ${f.kind === 'sourced_fact' ? 'sourced fact' : 'model inference'} · support ${f.supportStrength}`}
        >
          <div className="row" style={{ marginBottom: 4 }}>
            <FindingChip id={f.id} inference={f.kind === 'inference'} />
            <span className="badge badge-neutral">{f.section}</span>
          </div>
          <div>{f.claim}</div>
        </Node>
        <Arrow />
        <Node label={`Evidence cited (${evs.length})`}>
          {evs.length === 0 && (
            <div className="muted small">
              {f.kind === 'inference'
                ? 'Inferences cite no evidence by definition; treat accordingly.'
                : 'No evidence survived validation for this finding.'}
            </div>
          )}
          {evs.map((e) => {
            const q = snap.queries.find((x) => x.id === e.queryId);
            const siblings = snap.evidence.filter((x) => x.queryId === e.queryId && x.id !== e.id);
            return (
              <div key={e.id} style={{ marginBottom: 10 }}>
                <div className="row">
                  <EvidenceChip id={e.id} from="research-inspector" />
                  <DemoTag show={e.isDemo} />
                </div>
                <div>
                  <strong>{e.title}</strong>
                </div>
                <div className="small muted">{e.snippet}</div>
                <div className="chain-arrow">↓</div>
                <div className="small">
                  <span className="label">Source</span>{' '}
                  <a className="url" href={e.url} target="_blank" rel="noreferrer">
                    {e.url}
                  </a>
                </div>
                <div className="chain-arrow">↓</div>
                <div className="small">
                  <span className="label">Query</span>{' '}
                  {q ? (
                    <>
                      “{q.query}”{' '}
                      <span className="muted">
                        ({q.family}, {q.provider}, {q.status})
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </div>
                {siblings.length > 0 && (
                  <div className="small muted" style={{ marginTop: 4 }}>
                    Other evidence from the same search ({siblings.length}, not necessarily relevant):{' '}
                    {siblings.slice(0, 6).map((s) => (
                      <button
                        key={s.id}
                        className="btn-link"
                        style={{ marginRight: 6 }}
                        onClick={() => open({ kind: 'evidence', id: s.id, from: 'sibling' })}
                      >
                        {s.id}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </Node>
      </div>
    </div>
  );
}

function SignalView({ snap, id }: { snap: Snapshot; id: string }) {
  const s = snap.signals.find((x) => x.id === id);
  if (!s) return <div className="muted">Signal {id} not found.</div>;
  const cluster = snap.clusters.find((c) => c.signalIds.includes(s.id));
  const opps = snap.opportunities.filter((o) => o.signalIds.includes(s.id));
  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <SignalChip id={s.id} />
        <span className="badge badge-neutral">{s.type}</span>
        <span className="badge badge-neutral">confidence {s.confidence}</span>
      </div>
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
const Inf = ({ children }: { children: ReactNode }) => (
  <span>
    <span className="inference-tag">INFERENCE · </span>
    {children}
  </span>
);
