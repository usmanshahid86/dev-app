import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useProjectCtx, useSnapshot } from '../lib/useProject';
import { FindingChip } from '../components/Inspector';
import { Inference } from '../components/Badges';
import type { Decision, DecisionKind } from '@domain/types';

const OPTIONS: Array<{ k: DecisionKind; label: string; hint: string }> = [
  { k: 'BUILD', label: 'Build', hint: 'Generate a build package' },
  { k: 'INVESTIGATE_FURTHER', label: 'Investigate further', hint: 'Run another deep pass' },
  { k: 'PIVOT', label: 'Pivot', hint: 'Build in a changed direction' },
  { k: 'REJECT', label: 'Reject', hint: 'Return to opportunities' },
];

export function DecisionPage() {
  const snap = useSnapshot();
  const decisions = snap.decisions;
  if (decisions.length === 0)
    return (
      <div className="empty">
        <h3>No recommendation yet</h3>
        <p>Finish a deep investigation first.</p>
      </div>
    );
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Decision</h1>
          <p className="lead">
            The agent recommends. You decide. Both are recorded separately — a recommendation is never treated
            as approval.
          </p>
        </div>
      </div>
      {decisions.map((d, i) => (
        <DecisionView key={d.id} d={d} latest={i === 0} />
      ))}
    </div>
  );
}

function DecisionView({ d, latest }: { d: Decision; latest: boolean }) {
  const snap = useSnapshot();
  const { projectId, act, actionError } = useProjectCtx();
  const nav = useNavigate();
  const r = d.agentRecommendation;
  const opp = snap.opportunities.find((o) => o.id === d.opportunityId);
  const [choice, setChoice] = useState<DecisionKind | null>(null);
  const [rationale, setRationale] = useState('');
  const [pivot, setPivot] = useState('');
  const [busy, setBusy] = useState(false);
  const fchip = (id: string) => (
    <FindingChip key={id} id={id} inference={snap.findings.find((f) => f.id === id)?.kind === 'inference'} />
  );
  const canDecide = latest && !d.userDecision && snap.project.stage === 'DECISION_READY';
  const pkg = snap.buildPackages.find((b) => b.decisionId === d.id);

  const submit = async () => {
    if (!choice) return;
    setBusy(true);
    const res = await act(() =>
      api.decide(projectId, d.id, {
        decision: choice,
        rationale,
        pivotDirection: choice === 'PIVOT' ? pivot : undefined,
      }),
    );
    setBusy(false);
    if (res && choice === 'REJECT') {
      await act(() => api.setStage(projectId, 'OPPORTUNITIES_READY'));
      nav(`/projects/${projectId}/discover`);
    }
  };
  const generate = async () => {
    setBusy(true);
    const res = await act(() => api.buildPackage(projectId, d.id));
    setBusy(false);
    if (res) nav(`/projects/${projectId}/build`);
  };
  const again = async () => {
    const res = await act(() => api.investigate(projectId, d.opportunityId));
    if (res) nav(`/projects/${projectId}/research`);
  };
  const recTone =
    r.recommendation === 'BUILD' ? 'badge-ok' : r.recommendation === 'REJECT' ? 'badge-bad' : 'badge-warn';

  return (
    <div className="card" style={{ marginBottom: 16, opacity: latest ? 1 : 0.8 }}>
      <div className="row spread">
        <h2>
          {opp?.title} <span className="muted small">decision v{d.version}</span>
        </h2>
        <div className="row">
          <span className="small muted">Agent recommends</span>
          <span className={`rec-badge ${recTone}`}>{r.recommendation.replace('_', ' ')}</span>
        </div>
      </div>
      <p className="lead">{r.why}</p>
      <div className="grid-2" style={{ marginTop: 10 }}>
        <div>
          <div className="label">Target user</div>
          {r.targetUser}
        </div>
        <div>
          <div className="label">Problem</div>
          {r.problem}
        </div>
        <div>
          <div className="label">Proposed wedge</div>
          <Inference>{r.proposedWedge}</Inference>
        </div>
        <div>
          <div className="label">Why now</div>
          {r.whyNow}
        </div>
        <div>
          <div className="label">Existing alternatives</div>
          {r.existingAlternatives}
        </div>
        <div>
          <div className="label">Distribution hypothesis</div>
          <Inference>{r.distributionHypothesis}</Inference>
        </div>
        <div>
          <div className="label">Monetization hypothesis</div>
          <Inference>{r.monetizationHypothesis}</Inference>
        </div>
        <div>
          <div className="label">Supporting findings</div>
          <div className="row">{r.supportingFindingIds.map(fchip)}</div>
        </div>
      </div>
      <h3 style={{ marginTop: 16 }}>Critical assumptions</h3>
      <div className="stack">
        {r.criticalAssumptions.map((a) => (
          <div key={a.id} className="assumption">
            <div className="row">
              <span className="chip">{a.id}</span>
              <span
                className={`badge ${a.status === 'supported' ? 'badge-ok' : a.status === 'contested' ? 'badge-warn' : 'badge-neutral'}`}
              >
                {a.status}
              </span>
              <strong>{a.statement}</strong>
            </div>
            <div className="grid-2 small" style={{ marginTop: 6 }}>
              <div>
                <span className="label">Evidence for</span>{' '}
                <span className="row">
                  {a.supportingFindingIds.length ? (
                    a.supportingFindingIds.map(fchip)
                  ) : (
                    <span className="muted">none</span>
                  )}
                </span>
              </div>
              <div>
                <span className="label">Evidence against</span>{' '}
                <span className="row">
                  {a.evidenceAgainstFindingIds.length ? (
                    a.evidenceAgainstFindingIds.map(fchip)
                  ) : (
                    <span className="muted">none</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <div>
          <h4>Unknowns</h4>
          <ul>
            {r.unknowns.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>What would change the decision</h4>
          <ul>
            {r.whatWouldChangeTheDecision.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </div>
      </div>

      <h3 style={{ marginTop: 18 }}>Your decision</h3>
      {actionError && (
        <div className="notice notice-error" style={{ marginBottom: 8 }}>
          {actionError}
        </div>
      )}
      {d.userDecision ? (
        <div className="notice notice-ok">
          <strong>{d.userDecision.replace('_', ' ')}</strong> recorded{' '}
          {d.decidedAt && new Date(d.decidedAt).toLocaleString()}
          {d.userDecision !== r.recommendation && (
            <span className="badge badge-warn" style={{ marginLeft: 8 }}>
              differs from agent recommendation
            </span>
          )}
          {d.userRationale && (
            <div className="small" style={{ marginTop: 4 }}>
              Rationale: {d.userRationale}
            </div>
          )}
          {d.userPivotDirection && <div className="small">Pivot direction: {d.userPivotDirection}</div>}
          <div className="row" style={{ marginTop: 8 }}>
            {(d.userDecision === 'BUILD' || d.userDecision === 'PIVOT') && !pkg && latest && (
              <button className="btn btn-primary btn-sm" onClick={generate} disabled={busy}>
                Generate build package
              </button>
            )}
            {pkg && (
              <button className="btn btn-sm" onClick={() => nav(`/projects/${projectId}/build`)}>
                View build package →
              </button>
            )}
            {d.userDecision === 'INVESTIGATE_FURTHER' && latest && (
              <button className="btn btn-sm" onClick={again} disabled={busy}>
                Run another deep investigation
              </button>
            )}
            {latest && (
              <button
                className="btn btn-sm"
                onClick={() =>
                  act(() => api.setStage(projectId, 'OPPORTUNITIES_READY')).then(() =>
                    nav(`/projects/${projectId}/discover`),
                  )
                }
              >
                Back to opportunities
              </button>
            )}
          </div>
        </div>
      ) : canDecide ? (
        <div>
          <div className="decision-opts">
            {OPTIONS.map((o) => (
              <button
                key={o.k}
                type="button"
                className={`decision-opt ${choice === o.k ? 'on' : ''}`}
                onClick={() => setChoice(o.k)}
              >
                <strong>{o.label}</strong>
                <span>{o.hint}</span>
              </button>
            ))}
          </div>
          <div className="form" style={{ marginTop: 10 }}>
            <div className="field full">
              <label>Rationale (optional, recorded with your decision)</label>
              <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} />
            </div>
            {choice === 'PIVOT' && (
              <div className="field full">
                <label>Pivot direction (required)</label>
                <input
                  type="text"
                  value={pivot}
                  onChange={(e) => setPivot(e.target.value)}
                  placeholder="What changes?"
                />
              </div>
            )}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button
              className="btn btn-primary"
              disabled={!choice || busy || (choice === 'PIVOT' && !pivot.trim())}
              onClick={submit}
            >
              Record decision
            </button>
            {choice && choice !== r.recommendation && (
              <span className="small muted">
                You are overriding the agent’s recommendation — that is fine and will be recorded as such.
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="muted small">
          {latest ? 'Not decidable in the current stage.' : 'Superseded by a newer decision.'}
        </div>
      )}
    </div>
  );
}
