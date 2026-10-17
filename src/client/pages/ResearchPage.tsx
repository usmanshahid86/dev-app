import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useProjectCtx, useSnapshot } from '../lib/useProject';
import { RunStatus } from '../components/RunStatus';
import { Markdown } from '../components/Markdown';
import { DimBadge, DemoTag, SupportBadge, FetchBadge, CategoryBadge } from '../components/Badges';
import { FindingChip, EvidenceChip, useInspector } from '../components/Inspector';
import { RetrievalStrip, OriginTag } from '../components/RetrievalStrip';
import type { Investigation, ProductBrief } from '@domain/types';

export function ResearchPage() {
  const snap = useSnapshot();
  const active = snap.runs.find(
    (r) =>
      (r.kind === 'comparison' || r.kind === 'investigation') &&
      (r.status === 'running' || r.status === 'queued'),
  );
  const comparisons = snap.investigations.filter((i) => i.kind === 'comparative');
  const deep = snap.investigations.filter((i) => i.kind === 'deep');
  const brief = snap.briefs[0];
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Research</h1>
          <p className="lead">
            Comparative passes narrow the field; a deep investigation produces a sourced Product Brief whose
            claims are separate findings you can trace back to the query that found them.
          </p>
        </div>
      </div>
      {active && (
        <div style={{ marginBottom: 14 }}>
          <RunStatus run={active} />
        </div>
      )}
      {!active && comparisons.length === 0 && deep.length === 0 && (
        <div className="empty">
          <h3>Nothing investigated yet</h3>
          <p>Select one opportunity to investigate deeply, or 2–3 to compare, from the Discover page.</p>
        </div>
      )}
      {comparisons.map((inv) => (
        <ComparisonView key={inv.id} inv={inv} />
      ))}
      {brief && !active && <BriefView brief={brief} />}
      {deep.some((i) => i.status === 'failed') && !brief && (
        <div className="notice notice-error">
          The deep investigation failed. Partial evidence is kept; choose the opportunity again to retry.
        </div>
      )}
    </div>
  );
}

function ComparisonView({ inv }: { inv: Investigation }) {
  const snap = useSnapshot();
  const { projectId, act } = useProjectCtx();
  const nav = useNavigate();
  const opps = inv.opportunityIds
    .map((id) => snap.opportunities.find((o) => o.id === id))
    .filter(Boolean) as typeof snap.opportunities;
  const canAct = snap.project.stage === 'COMPARING' || snap.project.stage === 'OPPORTUNITIES_READY';
  if ((inv.status !== 'completed' && inv.status !== 'partial') || !inv.comparison)
    return inv.status === 'failed' ? (
      <div className="notice notice-error" style={{ marginBottom: 12 }}>
        Comparison failed.
      </div>
    ) : null;
  const rows = inv.comparison;
  const cell = (fn: (r: (typeof rows)[number]) => React.ReactNode) =>
    opps.map((o) => (
      <td key={o.id}>
        {(() => {
          const r = rows.find((x) => x.opportunityId === o.id);
          return r ? fn(r) : '—';
        })()}
      </td>
    ));
  const investigate = async (id: string) => {
    const r = await act(() => api.investigate(projectId, id));
    if (r) nav(`/projects/${projectId}/research`);
  };
  const rejectAll = async () => {
    await act(async () => {
      for (const o of opps) await api.setOpportunityStatus(projectId, o.id, 'rejected');
      await api.setStage(projectId, 'OPPORTUNITIES_READY');
    });
    nav(`/projects/${projectId}/discover`);
  };
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row spread">
        <h2>
          Comparison <span className="muted small">{new Date(inv.createdAt).toLocaleString()}</span>
        </h2>
      </div>
      <RetrievalStrip
        inv={inv}
        kind="comparison"
        candidates={opps.map((o) => ({ id: o.id, title: o.title }))}
        run={snap.runs.find((r) => r.id === inv.runId) ?? null}
        findings={snap.findings.filter((f) => f.investigationId === inv.id)}
      />
      <table className="tbl compare">
        <thead>
          <tr>
            <th />{' '}
            {opps.map((o) => (
              <th key={o.id}>
                {o.title}
                {inv.candidateRetrieval && (inv.candidateRetrieval[o.id]?.succeeded ?? 0) === 0 && (
                  <div
                    className="small"
                    style={{ fontWeight: 400, color: 'var(--warn)', textTransform: 'none', letterSpacing: 0 }}
                  >
                    provisional — no fresh search
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Problem evidence</th>
            {cell((r) => (
              <DimBadge label="" value={r.problemEvidenceStrength} />
            ))}
          </tr>
          <tr>
            <th>Target user</th>
            {cell((r) => r.targetUser)}
          </tr>
          <tr>
            <th>Alternatives</th>
            {cell((r) => r.alternatives)}
          </tr>
          <tr>
            <th>Market crowding</th>
            {cell((r) => (
              <DimBadge label="" value={r.marketCrowding} kind="comp" />
            ))}
          </tr>
          <tr>
            <th>Monetization evidence</th>
            {cell((r) => (
              <DimBadge label="" value={r.monetizationEvidence} />
            ))}
          </tr>
          <tr>
            <th>Distribution</th>
            {cell((r) => (
              <DimBadge label="" value={r.distributionAccessibility} />
            ))}
          </tr>
          <tr>
            <th>Technical feasibility</th>
            {cell((r) => (
              <DimBadge label="" value={r.technicalFeasibility} />
            ))}
          </tr>
          <tr>
            <th>Major constraints</th>
            {cell((r) => r.majorConstraints)}
          </tr>
          <tr>
            <th>Biggest unknown</th>
            {cell((r) => r.biggestUnknown)}
          </tr>
          <tr>
            <th>Findings</th>
            {cell((r) => (
              <div className="row">
                {r.findingIds.map((f) => (
                  <FindingChip
                    key={f}
                    id={f}
                    inference={snap.findings.find((x) => x.id === f)?.kind === 'inference'}
                  />
                ))}
              </div>
            ))}
          </tr>
          <tr>
            <th />{' '}
            {opps.map((o) => (
              <td key={o.id}>
                <button
                  className="btn btn-sm btn-primary"
                  disabled={!canAct}
                  onClick={() => investigate(o.id)}
                >
                  Investigate deeply
                </button>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      {inv.comparisonSummary && (
        <p style={{ marginTop: 10 }} className="lead">
          {inv.comparisonSummary}
        </p>
      )}
      {canAct && (
        <button className="btn btn-sm" onClick={rejectAll}>
          Reject all and return to discovery
        </button>
      )}
    </div>
  );
}

function BriefView({ brief }: { brief: ProductBrief }) {
  const snap = useSnapshot();
  const { projectId } = useProjectCtx();
  const nav = useNavigate();
  const { open } = useInspector();
  const [filter, setFilter] = useState<'all' | 'sourced' | 'inference'>('all');
  const opp = snap.opportunities.find((o) => o.id === brief.opportunityId);
  const findings = snap.findings.filter((f) => f.investigationId === brief.investigationId);
  const cited = [...new Set(findings.flatMap((f) => f.evidenceIds))];
  const decision = snap.decisions.find((d) => d.briefId === brief.id);
  const deepInv = snap.investigations.find((i) => i.id === brief.investigationId);
  const shown = findings.filter(
    (f) => filter === 'all' || (filter === 'sourced' ? f.kind === 'sourced_fact' : f.kind === 'inference'),
  );
  return (
    <div className="research-grid">
      <div className="brief">
        <div className="row spread" style={{ marginBottom: 6 }}>
          <div className="row">
            <span className="badge badge-accent">Product Brief v{brief.version}</span>
            <DemoTag show={snap.evidence.some((e) => cited.includes(e.id) && e.isDemo)} />
          </div>
          <div className="row">
            <a className="btn btn-sm" href={api.exportUrl(projectId, 'PROJECT-BRIEF.md')}>
              Download PROJECT-BRIEF.md
            </a>
            {decision && (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => nav(`/projects/${projectId}/decision`)}
              >
                Go to decision →
              </button>
            )}
          </div>
        </div>
        {deepInv && (
          <RetrievalStrip
            inv={deepInv}
            kind="brief"
            run={snap.runs.find((r) => r.id === deepInv.runId) ?? null}
            findings={findings}
          />
        )}
        <h1>{opp?.title}</h1>
        <p className="lead">{opp?.thesis}</p>
        {brief.sections.map((s, i) => (
          <section key={s.key}>
            <h2>
              {i + 1}. {s.title}
            </h2>
            <Markdown text={s.body} findings={findings} />
          </section>
        ))}
        <h2>
          {brief.sections.length + 1}. Sources ({cited.length})
        </h2>
        <div className="small muted" style={{ marginBottom: 6 }}>
          {findings.filter((f) => f.supportLevel.startsWith('full_page')).length} of {findings.length}{' '}
          findings rest on a fetched source page; the rest rest on search snippets or are inferences.
        </div>
        <ul>
          {cited.map((id) => {
            const e = snap.evidence.find((x) => x.id === id);
            return e ? (
              <li key={id}>
                <EvidenceChip id={id} from="brief-sources" /> <CategoryBadge category={e.category} />{' '}
                <FetchBadge status={e.fetchStatus} /> {e.pageTitle || e.title}{' '}
                <span className="url muted">{e.canonicalUrl || e.url}</span>
              </li>
            ) : null;
          })}
        </ul>
      </div>
      <aside className="card findings-panel">
        <div className="row spread">
          <h3>Findings ({findings.length})</h3>
          <div className="seg">
            <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
              all
            </button>
            <button className={filter === 'sourced' ? 'on' : ''} onClick={() => setFilter('sourced')}>
              sourced
            </button>
            <button className={filter === 'inference' ? 'on' : ''} onClick={() => setFilter('inference')}>
              inference
            </button>
          </div>
        </div>
        <div className="small muted" style={{ marginBottom: 6 }}>
          Click a finding to open the Research Inspector: finding → evidence → source → query.
        </div>
        {shown.map((f) => (
          <div
            key={f.id}
            className="finding"
            style={{ cursor: 'pointer' }}
            onClick={() => open({ kind: 'finding', id: f.id })}
          >
            <div className="row">
              <FindingChip id={f.id} inference={f.kind === 'inference'} />
              <SupportBadge level={f.supportLevel} />
              <OriginTag origin={f.retrievalOrigin} />
              <span className="badge badge-neutral">{f.supportStrength}</span>
              <span className="muted small">{f.section}</span>
            </div>
            <div>{f.claim}</div>
            <div className="row">
              {f.evidenceIds.map((e) => (
                <EvidenceChip key={e} id={e} from="findings-panel" />
              ))}
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
