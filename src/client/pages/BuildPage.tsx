import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useProjectCtx, useSnapshot } from '../lib/useProject';
import { FindingChip, useInspector } from '../components/Inspector';
import type { BuildPackage } from '@domain/types';

const FILES = ['PROJECT-BRIEF.md', 'PRODUCT-DECISION.md', 'BUILD-PACKAGE.md', 'AGENT-HANDOFF.md'];

export function BuildPage() {
  const snap = useSnapshot();
  const { projectId, act, actionError } = useProjectCtx();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const decided = snap.decisions.find((d) => d.userDecision === 'BUILD' || d.userDecision === 'PIVOT');
  const pkgs = snap.buildPackages;
  const generate = async () => {
    if (!decided) return;
    setBusy(true);
    await act(() => api.buildPackage(projectId, decided.id));
    setBusy(false);
  };
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Build package</h1>
          <p className="lead">
            Enough product context for a coding agent to start. Every requirement links back to the decision,
            the assumptions and the findings that motivated it. Nothing here is executed automatically — hand
            it off.
          </p>
        </div>
        <div className="actions">
          {decided && (
            <button className="btn" onClick={generate} disabled={busy}>
              {pkgs.length ? 'Regenerate (new version)' : 'Generate build package'}
            </button>
          )}
          {pkgs.length > 0 && (
            <button className="btn btn-primary" onClick={() => nav(`/projects/${projectId}/validate`)}>
              Re-check opportunity →
            </button>
          )}
        </div>
      </div>
      {actionError && (
        <div className="notice notice-error" style={{ marginBottom: 12 }}>
          {actionError}
        </div>
      )}
      {!decided && (
        <div className="empty">
          <h3>No BUILD or PIVOT decision recorded</h3>
          <p>Record a decision first. The agent’s recommendation alone does not unlock a build package.</p>
        </div>
      )}
      {decided && pkgs.length === 0 && (
        <div className="empty">
          <h3>Ready to generate</h3>
          <p>Decision {decided.userDecision} is recorded. Generate the build package when you are ready.</p>
        </div>
      )}
      {pkgs.map((p, i) => (
        <PackageView key={p.id} pkg={p} latest={i === 0} />
      ))}
    </div>
  );
}

function PackageView({ pkg, latest }: { pkg: BuildPackage; latest: boolean }) {
  const snap = useSnapshot();
  const { projectId } = useProjectCtx();
  const { open } = useInspector();
  const [preview, setPreview] = useState<{ name: string; text: string } | null>(null);
  const s = pkg.sections;
  const decision = snap.decisions.find((d) => d.id === pkg.decisionId);
  const assumptions = new Map(
    (decision?.agentRecommendation.criticalAssumptions ?? []).map((a) => [a.id, a]),
  );
  const list = (xs: string[]) => (
    <ul>
      {xs.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
  const showFile = async (name: string) => {
    const files = await api.exportAll(projectId);
    setPreview({ name, text: files[name] ?? '' });
  };
  return (
    <div className="card" style={{ marginBottom: 16, opacity: latest ? 1 : 0.75 }}>
      <div className="row spread">
        <h2>
          {s.productDefinition.replace(/^\[DEMO\]\s*/, '').slice(0, 90)}
          {s.productDefinition.length > 90 ? '…' : ''} <span className="muted small">v{pkg.version}</span>
        </h2>
        <div className="row">
          {FILES.map((f) => (
            <span key={f} className="row">
              <a className="btn btn-sm" href={api.exportUrl(projectId, f)}>
                ↓ {f}
              </a>
              <button className="btn-link small" onClick={() => showFile(f)}>
                preview
              </button>
            </span>
          ))}
        </div>
      </div>
      {preview && (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="row spread">
            <strong>{preview.name}</strong>
            <button className="btn btn-sm" onClick={() => setPreview(null)}>
              Close
            </button>
          </div>
          <pre className="small" style={{ whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto' }}>
            {preview.text}
          </pre>
        </div>
      )}
      <div className="grid-2" style={{ marginTop: 10 }}>
        <div>
          <div className="label">Product definition</div>
          {s.productDefinition}
        </div>
        <div>
          <div className="label">Value proposition</div>
          {s.valueProposition}
        </div>
        <div>
          <div className="label">Target user</div>
          {s.targetUser}
        </div>
        <div>
          <div className="label">Problem</div>
          {s.problem}
        </div>
        <div className="full" style={{ gridColumn: '1 / -1' }}>
          <div className="label">Evidence-backed rationale</div>
          {s.evidenceBackedRationale}
          {list(s.evidenceBackedAssumptions)}
        </div>
        <div>
          <div className="label">MVP scope</div>
          {list(s.mvpScope)}
        </div>
        <div>
          <div className="label">Non-goals</div>
          {list(s.nonGoals)}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="label">User flows</div>
          {list(s.userFlows)}
        </div>
      </div>
      <h3 style={{ marginTop: 14 }}>Functional requirements</h3>
      <table className="tbl">
        <thead>
          <tr>
            <th>#</th>
            <th>Requirement</th>
            <th>Priority</th>
            <th>Traces to</th>
          </tr>
        </thead>
        <tbody>
          {pkg.requirements.map((r) => (
            <tr key={r.id}>
              <td>{r.number}</td>
              <td>{r.text}</td>
              <td>
                <span className={`badge ${r.priority === 'must' ? 'badge-accent' : 'badge-neutral'}`}>
                  {r.priority}
                </span>
              </td>
              <td>
                <div className="row">
                  <span className="chip" title="decision">
                    {r.decisionId}
                  </span>
                  {r.assumptionIds.map((a) => (
                    <span key={a} className="chip" title={assumptions.get(a)?.statement}>
                      {a}
                    </span>
                  ))}
                  {r.findingIds.map((f) => (
                    <FindingChip
                      key={f}
                      id={f}
                      inference={snap.findings.find((x) => x.id === f)?.kind === 'inference'}
                    />
                  ))}
                </div>
                {r.assumptionIds.map((a) => (
                  <div key={a} className="req-trace">
                    {a}: {assumptions.get(a)?.statement}
                  </div>
                ))}
                {r.findingIds.map((f) => {
                  const fd = snap.findings.find((x) => x.id === f);
                  return fd ? (
                    <div key={f} className="req-trace">
                      <button className="btn-link" onClick={() => open({ kind: 'finding', id: f })}>
                        {f}
                      </button>
                      : {fd.claim}
                    </div>
                  ) : null;
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="label">
            Technical design <span className="inference-tag">PROPOSED — not market evidence</span>
          </div>
          {s.architectureProposal}
        </div>
        <div>
          <div className="label">Interfaces</div>
          {list(s.interfaces)}
        </div>
        <div>
          <div className="label">Data model</div>
          {list(s.dataModel)}
        </div>
        <div>
          <div className="label">Milestones</div>
          <ol>
            {s.milestones.map((m, i) => (
              <li key={i}>
                <strong>{m.title}</strong> — {m.description}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <div className="label">Acceptance criteria</div>
          {list(s.acceptanceCriteria)}
        </div>
        <div>
          <div className="label">Risks</div>
          <ul>
            {s.risks.map((r, i) => (
              <li key={i}>
                <span className="badge badge-neutral">{r.kind}</span> {r.text}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="label">Open questions</div>
          {list(s.openQuestions)}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="label">Validation plan</div>
          {list(s.validationPlan)}
        </div>
      </div>
    </div>
  );
}
