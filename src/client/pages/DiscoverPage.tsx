import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useProjectCtx, useSnapshot } from '../lib/useProject';
import { RunStatus } from '../components/RunStatus';
import { Dimensions, StatusBadge, DemoTag, Inference, CorroborationLine } from '../components/Badges';
import { EvidenceChip, SignalChip } from '../components/Inspector';
import { rawSignalsForConsolidated } from '@domain/lineage';
import {
  emptyProfile,
  type DiscoveryProfile,
  type Opportunity,
  type OpportunityStatus,
  type ResearchRun,
} from '@domain/types';

export function DiscoverPage() {
  const snap = useSnapshot();
  const { project } = snap;
  const discoveryRuns = snap.runs.filter((r) => r.kind === 'discovery');
  const active = discoveryRuns.find((r) => r.status === 'running' || r.status === 'queued');
  const latest = discoveryRuns[0];
  const hasOpps = snap.opportunities.length > 0;

  if (active) return <DiscoveringView />;
  if (project.stage === 'DISCOVERY_SETUP' && !hasOpps) return <SetupView lastRun={latest} />;
  return <OpportunitiesBoard />;
}

// ---------------- Setup ----------------

function SetupView({ lastRun }: { lastRun?: ResearchRun }) {
  const snap = useSnapshot();
  const { projectId, act, actionError } = useProjectCtx();
  const [title, setTitle] = useState(snap.project.title);
  const [profile, setProfile] = useState<DiscoveryProfile>({
    ...emptyProfile(),
    ...snap.project.discoveryProfile,
  });
  const [hasDirection, setHasDirection] = useState(Boolean(snap.project.discoveryProfile.directionSeed));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof DiscoveryProfile>(k: K, v: DiscoveryProfile[K]) =>
    setProfile((p) => ({ ...p, [k]: v }));
  const list = (s: string) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

  const start = async (broad: boolean) => {
    setBusy(true);
    const p: DiscoveryProfile = broad
      ? { ...emptyProfile(), directionSeed: undefined }
      : { ...profile, directionSeed: hasDirection ? profile.directionSeed?.trim() || undefined : undefined };
    await act(async () => {
      await api.updateProject(projectId, { title: title.trim() || undefined, profile: p });
      await api.startDiscovery(projectId);
    });
    setBusy(false);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>What might be worth building?</h1>
          <p className="lead">
            You don’t need an idea. The system searches for observable signals — complaints, workarounds,
            pricing pages, shutdowns, changelogs — and turns them into evidence-backed opportunity cards.
            Every field is optional.
          </p>
        </div>
      </div>
      {actionError && (
        <div className="notice notice-error" style={{ marginBottom: 12 }}>
          {actionError}
        </div>
      )}
      {lastRun?.status === 'failed' && (
        <div className="notice notice-error" style={{ marginBottom: 12 }}>
          Last discovery run failed: {lastRun.error}. Nothing was invented to fill the gap; fix the provider
          or adjust the profile and try again.
        </div>
      )}
      <div className="card">
        <div className="row spread" style={{ marginBottom: 12 }}>
          <div className="seg">
            <button className={!hasDirection ? 'on' : ''} onClick={() => setHasDirection(false)}>
              Explore for opportunities
            </button>
            <button className={hasDirection ? 'on' : ''} onClick={() => setHasDirection(true)}>
              I already have a direction
            </button>
          </div>
          <div className="small muted">
            Mode: {snap.project.mode === 'demo' ? 'DEMO (fixture search + fixture agent)' : 'real providers'}
          </div>
        </div>
        <div className="form">
          <div className="field full">
            <label>Project title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled exploration"
            />
          </div>
          {hasDirection && (
            <div className="field full">
              <label>Your direction</label>
              <textarea
                value={profile.directionSeed ?? ''}
                onChange={(e) => set('directionSeed', e.target.value)}
                placeholder="e.g. a tool that keeps project context in sync across AI coding agents"
              />
              <span className="hint">
                Discovery will search for evidence around this direction and seed a card for it only if
                evidence supports it. Unsupported directions produce no card — that is useful information too.
              </span>
            </div>
          )}
          <div className="field">
            <label>Areas / interests</label>
            <input
              type="text"
              defaultValue={profile.areas.join(', ')}
              onBlur={(e) => set('areas', list(e.target.value))}
              placeholder="Anything"
            />
            <span className="hint">Comma-separated. Leave empty to explore broadly.</span>
          </div>
          <div className="field">
            <label>My strengths</label>
            <input
              type="text"
              defaultValue={profile.strengths.join(', ')}
              onBlur={(e) => set('strengths', list(e.target.value))}
              placeholder="optional, e.g. TypeScript, infra, mobile"
            />
          </div>
          <Seg
            label="Team"
            value={profile.teamSize}
            options={[
              ['solo', 'Solo'],
              ['2-5', '2–5'],
              ['6+', '6+'],
              ['unspecified', 'Unspecified'],
            ]}
            onChange={(v) => set('teamSize', v as any)}
          />
          <Seg
            label="Time to MVP"
            value={profile.timeToMvp}
            options={[
              ['days', 'Days'],
              ['weeks', 'Weeks'],
              ['months', 'Months'],
              ['flexible', 'Flexible'],
            ]}
            onChange={(v) => set('timeToMvp', v as any)}
          />
          <Seg
            label="Resources"
            value={profile.resources}
            options={[
              ['low', 'Low'],
              ['moderate', 'Moderate'],
              ['flexible', 'Flexible'],
            ]}
            onChange={(v) => set('resources', v as any)}
          />
          <Seg
            label="Customer"
            value={profile.customerType}
            options={[
              ['developers', 'Developers'],
              ['businesses', 'Businesses'],
              ['consumers', 'Consumers'],
              ['any', 'Any'],
            ]}
            onChange={(v) => set('customerType', v as any)}
          />
          <div className="field">
            <label>Preferred business model</label>
            <input
              type="text"
              defaultValue={profile.businessModel ?? ''}
              onBlur={(e) => set('businessModel', e.target.value || undefined)}
              placeholder="optional"
            />
          </div>
          <div className="field">
            <label>Geography</label>
            <input
              type="text"
              defaultValue={profile.geography ?? ''}
              onBlur={(e) => set('geography', e.target.value || undefined)}
              placeholder="optional"
            />
          </div>
          <div className="field">
            <label>Things to avoid</label>
            <input
              type="text"
              defaultValue={profile.avoid.join(', ')}
              onBlur={(e) => set('avoid', list(e.target.value))}
              placeholder="optional, comma-separated"
            />
          </div>
          <div className="field">
            <label>Other constraints</label>
            <input
              type="text"
              defaultValue={profile.constraints ?? ''}
              onBlur={(e) => set('constraints', e.target.value || undefined)}
              placeholder="optional free text"
            />
          </div>
        </div>
        <div className="row spread" style={{ marginTop: 16 }}>
          <button className="btn" onClick={() => start(true)} disabled={busy}>
            Explore broadly (ignore all fields)
          </button>
          <button
            className="btn btn-primary"
            onClick={() => start(false)}
            disabled={busy || (hasDirection && !profile.directionSeed?.trim())}
          >
            {hasDirection ? 'Research my direction' : 'Find opportunities'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Seg({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="seg">
        {options.map(([v, l]) => (
          <button key={v} type="button" className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------- Running ----------------

function DiscoveringView() {
  const snap = useSnapshot();
  const run = snap.runs.find(
    (r) => r.kind === 'discovery' && (r.status === 'running' || r.status === 'queued'),
  )!;
  const queries = snap.queries.filter((q) => q.runId === run.id);
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Discovering</h1>
          <p className="lead">
            Searching for observable signals, then extracting, clustering and building opportunity cards.
            Partial results are kept if something fails.
          </p>
        </div>
      </div>
      <RunStatus run={run} />
      {queries.length > 0 && (
        <table className="tbl" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Query</th>
              <th>Family</th>
              <th>Purpose</th>
              <th>Status</th>
              <th>Results</th>
            </tr>
          </thead>
          <tbody>
            {queries.map((q) => (
              <tr key={q.id}>
                <td>“{q.query}”</td>
                <td>
                  <span className="badge badge-neutral">{q.family}</span>
                </td>
                <td className="small muted">{q.purpose}</td>
                <td>
                  {q.status}
                  {q.error && (
                    <div className="small" style={{ color: 'var(--danger)' }}>
                      {q.error}
                    </div>
                  )}
                </td>
                <td>{q.resultCount ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------- Opportunities board ----------------

type SortKey =
  | 'evidenceStrength'
  | 'competition'
  | 'buildability'
  | 'monetizationEvidence'
  | 'distributionAccessibility'
  | 'developerFit';
const RANK: Record<string, number> = {
  strong: 0,
  high: 0,
  easy: 0,
  low: 0,
  medium: 1,
  moderate: 1,
  weak: 2,
  hard: 2,
  unknown: 3,
  unspecified: 3,
};
const RANK_COMP: Record<string, number> = { low: 0, medium: 1, high: 2, unknown: 3 };

function OpportunitiesBoard() {
  const snap = useSnapshot();
  const { projectId, act, actionError } = useProjectCtx();
  const nav = useNavigate();
  const [sort, setSort] = useState<SortKey>('evidenceStrength');
  const [minEvidence, setMinEvidence] = useState<'any' | 'medium' | 'strong'>('any');
  const [showHidden, setShowHidden] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const latest = snap.runs.find((r) => r.kind === 'discovery');
  const stageBlocked = !['OPPORTUNITIES_READY', 'DISCOVERY_SETUP'].includes(snap.project.stage);

  const visible = useMemo(() => {
    const rank = (o: Opportunity) =>
      (sort === 'competition' ? RANK_COMP[o.dimensions.competition] : RANK[o.dimensions[sort]]) ?? 9;
    return snap.opportunities
      .filter((o) => showHidden || (o.status !== 'hidden' && o.status !== 'rejected'))
      .filter(
        (o) =>
          minEvidence === 'any' ||
          (minEvidence === 'medium'
            ? o.dimensions.evidenceStrength !== 'weak'
            : o.dimensions.evidenceStrength === 'strong'),
      )
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          RANK[a.dimensions.evidenceStrength]! - RANK[b.dimensions.evidenceStrength]! ||
          a.title.localeCompare(b.title),
      );
  }, [snap.opportunities, sort, minEvidence, showHidden]);

  const setStatus = (o: Opportunity, status: OpportunityStatus) =>
    act(() => api.setOpportunityStatus(projectId, o.id, status));
  const toggleCompare = (id: string) =>
    setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 3 ? c : [...c, id]));
  const investigate = async (id: string) => {
    const r = await act(() => api.investigate(projectId, id));
    if (r) nav(`/projects/${projectId}/research`);
  };
  const runCompare = async () => {
    const r = await act(() => api.compare(projectId, compare));
    if (r) nav(`/projects/${projectId}/research`);
  };
  const rerun = () => act(() => api.startDiscovery(projectId));
  const hiddenCount = snap.opportunities.filter(
    (o) => o.status === 'hidden' || o.status === 'rejected',
  ).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Opportunities</h1>
          <p className="lead">
            {snap.opportunities.length} evidence-backed hypotheses from {snap.evidence.length} pieces of
            evidence and {snap.signals.length} signals. Dimensions are shown separately on purpose — there is
            no combined score. Click a card to see why it exists.
          </p>
        </div>
        <div className="actions">
          <button className="btn" onClick={rerun} disabled={stageBlocked}>
            Run discovery again
          </button>
        </div>
      </div>
      {actionError && (
        <div className="notice notice-error" style={{ marginBottom: 12 }}>
          {actionError}
        </div>
      )}
      {latest && latest.status !== 'completed' && (
        <div style={{ marginBottom: 12 }}>
          <RunStatus run={latest} />
        </div>
      )}
      {stageBlocked && (
        <div className="notice notice-info" style={{ marginBottom: 12 }}>
          This project has moved past discovery (stage {snap.project.stage}). To pick a different opportunity,
          go back from the Decision or Build page.
        </div>
      )}

      {snap.opportunities.length === 0 ? (
        <div className="empty">
          <h3>No well-supported opportunities found</h3>
          <p>
            Discovery collected {snap.evidence.length} evidence items and {snap.signals.length} signals, but
            nothing was supported well enough to become a card. The system does not fill a quota with weak
            ideas.
          </p>
          <p className="small">
            Try broadening the profile, removing “avoid” terms, or running discovery again.
          </p>
          <button className="btn" onClick={() => act(() => api.setStage(projectId, 'DISCOVERY_SETUP'))}>
            Adjust profile
          </button>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <label>
              Sort by{' '}
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="evidenceStrength">Evidence strength</option>
                <option value="competition">Competition (low first)</option>
                <option value="buildability">Buildability</option>
                <option value="monetizationEvidence">Monetization evidence</option>
                <option value="distributionAccessibility">Distribution</option>
                <option value="developerFit">Developer fit</option>
              </select>
            </label>
            <label>
              Evidence{' '}
              <select value={minEvidence} onChange={(e) => setMinEvidence(e.target.value as any)}>
                <option value="any">any</option>
                <option value="medium">medium+</option>
                <option value="strong">strong only</option>
              </select>
            </label>
            <label className="row">
              <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />{' '}
              show hidden/rejected ({hiddenCount})
            </label>
            <span className="muted small" style={{ marginLeft: 'auto' }}>
              {visible.length} shown
            </span>
          </div>
          <div className="opp-grid">
            {visible.map((o) => (
              <OpportunityCard
                key={o.id}
                o={o}
                expanded={expanded === o.id}
                onToggle={() => setExpanded(expanded === o.id ? null : o.id)}
                compared={compare.includes(o.id)}
                onCompare={() => toggleCompare(o.id)}
                onStatus={(s) => setStatus(o, s)}
                onInvestigate={() => investigate(o.id)}
                disabled={stageBlocked}
              />
            ))}
          </div>
          {compare.length > 0 && !stageBlocked && (
            <div className="select-bar">
              <div>
                {compare.length} selected for comparison{' '}
                {compare.length < 2 && <span className="muted">(select 2–3)</span>}
              </div>
              <div className="row">
                <button className="btn" onClick={() => setCompare([])}>
                  Clear
                </button>
                <button className="btn btn-primary" disabled={compare.length < 2} onClick={runCompare}>
                  Compare {compare.length} opportunities
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OpportunityCard({
  o,
  expanded,
  onToggle,
  compared,
  onCompare,
  onStatus,
  onInvestigate,
  disabled,
}: {
  o: Opportunity;
  expanded: boolean;
  onToggle: () => void;
  compared: boolean;
  onCompare: () => void;
  onStatus: (s: OpportunityStatus) => void;
  onInvestigate: () => void;
  disabled: boolean;
}) {
  const snap = useSnapshot();
  const signals = snap.signals.filter((s) => o.signalIds.includes(s.id));
  const evidenceIds = [...new Set(signals.flatMap((s) => s.evidenceIds))];
  const demo = snap.evidence.some((e) => evidenceIds.includes(e.id) && e.isDemo);
  const dimmed = o.status === 'hidden' || o.status === 'rejected';
  return (
    <div className={`card opp-card ${compared ? 'selected' : ''} ${dimmed ? 'dim' : ''}`} onClick={onToggle}>
      <div className="row spread">
        <div className="row">
          <StatusBadge status={o.status} />
          <DemoTag show={demo} />
          {o.seeded && <span className="badge badge-accent">your direction</span>}
        </div>
        <label className="small row" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={compared} onChange={onCompare} disabled={disabled} /> compare
        </label>
      </div>
      <h3>{o.title}</h3>
      <div className="opp-thesis">{o.thesis}</div>
      <Dimensions d={o.dimensions} />
      <CorroborationLine c={o.corroboration} compact />
      <div className="small muted">
        {signals.length} consolidated signal{signals.length === 1 ? '' : 's'} · {evidenceIds.length} sources ·{' '}
        {o.majorUncertainties.length} major unknown{o.majorUncertainties.length === 1 ? '' : 's'}
      </div>
      {expanded && (
        <div className="opp-detail" onClick={(e) => e.stopPropagation()}>
          <div className="full">
            <div className="label">Problem</div>
            {o.problem}
          </div>
          <div>
            <div className="label">Who</div>
            {o.targetUser}
          </div>
          <div>
            <div className="label">Why now</div>
            {o.whyNow}
          </div>
          <div className="full">
            <div className="label">Why this opportunity exists</div>
            {o.evidenceSummary}
            <div style={{ marginTop: 6 }}>
              <CorroborationLine c={o.corroboration} />
            </div>
            <div style={{ marginTop: 6 }} className="stack">
              {signals.map((s) => {
                const raws = rawSignalsForConsolidated(s, snap.signals);
                return (
                  <div key={s.id} className="small">
                    <SignalChip id={s.id} /> <span className="badge badge-neutral">{s.type}</span>{' '}
                    {s.observation}
                    {raws.length > 1 && (
                      <span className="muted"> — consolidated from {raws.length} raw signals</span>
                    )}
                    {s.stats && <div className="muted">{s.stats.summary}</div>}
                    <div className="row" style={{ marginTop: 2 }}>
                      {s.evidenceIds.map((e) => (
                        <EvidenceChip key={e} id={e} from="opportunity-card" />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div className="label">Current alternatives</div>
            {o.currentAlternatives}
          </div>
          <div>
            <div className="label">Potential wedge</div>
            <Inference>{o.potentialWedge.replace(/^Inference:\s*/i, '')}</Inference>
          </div>
          <div>
            <div className="label">Monetization</div>
            {o.monetizationNotes}
          </div>
          <div>
            <div className="label">Competition</div>
            {o.competitionNotes}
          </div>
          <div>
            <div className="label">Buildability</div>
            {o.buildabilityNotes}
          </div>
          <div>
            <div className="label">Distribution</div>
            {o.distributionNotes}
          </div>
          <div className="full">
            <div className="label">Major uncertainties</div>
            <ul>
              {o.majorUncertainties.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
          </div>
          <div className="full">
            <div className="label">Open questions before building</div>
            <ul>
              {o.openQuestions.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="opp-foot" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <button
            className="btn btn-sm"
            onClick={() => onStatus(o.status === 'interesting' ? 'candidate' : 'interesting')}
            disabled={disabled}
          >
            {o.status === 'interesting' ? '★ Interesting' : '☆ Mark interesting'}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => onStatus(o.status === 'hidden' ? 'candidate' : 'hidden')}
            disabled={disabled}
          >
            {o.status === 'hidden' ? 'Unhide' : 'Hide'}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => onStatus(o.status === 'rejected' ? 'candidate' : 'rejected')}
            disabled={disabled}
          >
            {o.status === 'rejected' ? 'Un-reject' : 'Reject'}
          </button>
        </div>
        <button className="btn btn-sm btn-primary" onClick={onInvestigate} disabled={disabled}>
          Investigate deeply
        </button>
      </div>
    </div>
  );
}
