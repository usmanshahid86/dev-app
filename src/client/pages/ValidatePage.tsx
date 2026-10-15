import { useState } from 'react';
import { api } from '../lib/api';
import { useProjectCtx, useSnapshot } from '../lib/useProject';
import { RunStatus } from '../components/RunStatus';
import { EvidenceChip } from '../components/Inspector';

export function ValidatePage() {
  const snap = useSnapshot();
  const { projectId, act, actionError } = useProjectCtx();
  const pkg = snap.buildPackages[0];
  const [built, setBuilt] = useState('');
  const [lessons, setLessons] = useState('');
  const active = snap.runs.find(
    (r) => r.kind === 'validation' && (r.status === 'running' || r.status === 'queued'),
  );
  const reviews = snap.validationReviews;
  if (!pkg)
    return (
      <div className="empty">
        <h3>Nothing to validate yet</h3>
        <p>Validation re-checks the market after a build package exists.</p>
      </div>
    );
  const start = () =>
    act(() =>
      api.validate(projectId, { buildPackageId: pkg.id, whatWeBuilt: built, implementationLessons: lessons }),
    );
  const tone = (v: string | null) =>
    v === 'CONTINUE' ? 'badge-ok' : v === 'STOP' ? 'badge-bad' : 'badge-warn';
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Validate</h1>
          <p className="lead">
            Re-check the opportunity after something exists: a fresh bounded search around the critical
            assumptions and competition. New evidence is recorded separately; the original research is never
            overwritten.
          </p>
        </div>
      </div>
      {actionError && (
        <div className="notice notice-error" style={{ marginBottom: 12 }}>
          {actionError}
        </div>
      )}
      {active ? (
        <RunStatus run={active} />
      ) : (
        <div className="card">
          <h3>Re-check opportunity (build package v{pkg.version})</h3>
          <div className="form">
            <div className="field">
              <label>What did we build?</label>
              <textarea value={built} onChange={(e) => setBuilt(e.target.value)} placeholder="optional" />
            </div>
            <div className="field">
              <label>What did implementation teach us?</label>
              <textarea value={lessons} onChange={(e) => setLessons(e.target.value)} placeholder="optional" />
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ marginTop: 10 }}
            onClick={start}
            disabled={snap.project.stage !== 'BUILD_PACKAGE_READY'}
          >
            Re-check opportunity
          </button>
        </div>
      )}
      {reviews.map((v) => (
        <div key={v.id} className="card" style={{ marginTop: 14 }}>
          <div className="row spread">
            <h2>
              Review v{v.version}{' '}
              <span className="muted small">{new Date(v.createdAt).toLocaleString()}</span>
            </h2>
            <div className="row">
              <span className="badge badge-neutral">{v.status}</span>
              {v.verdict && (
                <span className={`rec-badge ${tone(v.verdict)}`}>{v.verdict.replace('_', ' ')}</span>
              )}
            </div>
          </div>
          {v.rationale && <p className="lead">{v.rationale}</p>}
          <div className="grid-2">
            <div>
              <div className="label">What we believed</div>
              <ul>
                {v.originalAssumptions.map((a) => (
                  <li key={a.id}>
                    <span className="chip">{a.id}</span> {a.statement}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="label">Status now</div>
              <ul>
                {v.assumptionStatus.map((s) => (
                  <li key={s.assumptionId}>
                    <span
                      className={`badge ${s.status === 'still_true' ? 'badge-ok' : s.status === 'contradicted' ? 'badge-bad' : 'badge-warn'}`}
                    >
                      {s.status}
                    </span>{' '}
                    {s.note}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="label">What we built</div>
              {v.whatWeBuilt || <span className="muted">not described</span>}
            </div>
            <div>
              <div className="label">Implementation lessons</div>
              {v.implementationLessons || <span className="muted">none recorded</span>}
            </div>
            <div>
              <div className="label">External changes</div>
              <ul>
                {v.externalChanges.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="label">New evidence ({v.newEvidenceIds.length})</div>
              <div className="row">
                {v.newEvidenceIds.map((e) => (
                  <EvidenceChip key={e} id={e} from="validation" />
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
