import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, NavLink, Link, useParams, useLocation } from 'react-router-dom';
import { api, type Health } from './lib/api';
import { ProjectProvider, useProjectCtx } from './lib/useProject';
import { InspectorProvider, Inspector } from './components/Inspector';
import { ProjectsPage } from './pages/ProjectsPage';
import { DiscoverPage } from './pages/DiscoverPage';
import { ResearchPage } from './pages/ResearchPage';
import { DecisionPage } from './pages/DecisionPage';
import { BuildPage } from './pages/BuildPage';
import { ValidatePage } from './pages/ValidatePage';
import { LogPage } from './pages/LogPage';
import { STAGE_AREA, STAGE_LABELS, type NavArea } from '@domain/workflow';

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);
  return (
    <InspectorProvider>
      <div className="app">
        <header className="topbar">
          <Link to="/" className="brand">
            dev-app <span className="brand-sub">what might be worth building?</span>
          </Link>
          <div className="topbar-right">
            {health ? (
              <span
                className={`mode-pill mode-${health.mode}`}
                title={`search: ${health.providers.search.name} · agent: ${health.providers.agent.name}`}
              >
                {health.mode === 'demo' ? 'DEMO MODE' : 'REAL MODE'} · search {health.providers.search.name} ·
                agent {health.providers.agent.name}
              </span>
            ) : (
              <span className="mode-pill mode-unknown">server unreachable</span>
            )}
          </div>
        </header>
        {health?.mode === 'demo' && (
          <div className="demo-banner">
            Demo mode: evidence comes from fixture pages under <code>demo.invalid</code>, not the web, and
            reasoning is canned. Nothing shown here is real market evidence.
          </div>
        )}
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/:id/*" element={<ProjectShell />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </InspectorProvider>
  );
}

function ProjectShell() {
  const { id } = useParams();
  return (
    <ProjectProvider projectId={id!}>
      <ProjectLayout />
    </ProjectProvider>
  );
}

const AREAS: Array<{ key: NavArea; label: string; hint: string }> = [
  { key: 'discover', label: 'Discover', hint: 'Find evidence-backed opportunities' },
  { key: 'research', label: 'Research', hint: 'Compare and investigate' },
  { key: 'decision', label: 'Decision', hint: 'Recommendation → your call' },
  { key: 'build', label: 'Build', hint: 'Build package and handoff' },
  { key: 'validate', label: 'Validate', hint: 'Re-check after building' },
];

function ProjectLayout() {
  const { snapshot, error } = useProjectCtx();
  const location = useLocation();
  if (error)
    return (
      <main className="main">
        <div className="empty">Could not load project: {error}</div>
      </main>
    );
  if (!snapshot)
    return (
      <main className="main">
        <div className="empty">Loading…</div>
      </main>
    );
  const { project } = snapshot;
  const currentArea = STAGE_AREA[project.stage];
  const available: Record<NavArea, boolean> = {
    discover: true,
    research: snapshot.investigations.length > 0 || ['COMPARING', 'INVESTIGATING'].includes(project.stage),
    decision: snapshot.decisions.length > 0,
    build:
      snapshot.buildPackages.length > 0 ||
      snapshot.decisions.some((d) => d.userDecision === 'BUILD' || d.userDecision === 'PIVOT'),
    validate: snapshot.buildPackages.length > 0,
  };
  const base = `/projects/${project.id}`;
  const activeRun = snapshot.runs.find((r) => r.status === 'running' || r.status === 'queued');
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-project">
          <Link to="/" className="muted small">
            ← Projects
          </Link>
          <h2 className="sidebar-title">{project.title}</h2>
          <div className="small muted">
            Stage: <strong>{STAGE_LABELS[project.stage]}</strong>
            {activeRun && <span className="spinner" title={`${activeRun.kind} running`} />}
          </div>
        </div>
        <nav className="stage-nav">
          {AREAS.map((a) => (
            <NavLink
              key={a.key}
              to={`${base}/${a.key}`}
              className={({ isActive }) =>
                `stage-link ${isActive ? 'active' : ''} ${a.key === currentArea ? 'current' : ''} ${available[a.key] ? '' : 'disabled'}`
              }
              onClick={(e) => !available[a.key] && e.preventDefault()}
            >
              <span className="stage-label">{a.label}</span>
              <span className="stage-hint">{a.hint}</span>
            </NavLink>
          ))}
          <NavLink
            to={`${base}/log`}
            className={({ isActive }) => `stage-link log ${isActive ? 'active' : ''}`}
          >
            <span className="stage-label">Research log</span>
            <span className="stage-hint">What the system did, in order</span>
          </NavLink>
        </nav>
        <div className="sidebar-foot small muted">
          <div>
            {snapshot.evidence.length} evidence · {snapshot.signals.length} signals ·{' '}
            {snapshot.opportunities.length} opportunities
          </div>
          <div>
            {snapshot.findings.length} findings · {snapshot.decisions.length} decisions ·{' '}
            {snapshot.buildPackages.length} build packages
          </div>
        </div>
      </aside>
      <Inspector />
      <main className="main" key={location.pathname}>
        <Routes>
          <Route index element={<Navigate to={currentArea} replace />} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="research" element={<ResearchPage />} />
          <Route path="decision" element={<DecisionPage />} />
          <Route path="build" element={<BuildPage />} />
          <Route path="validate" element={<ValidatePage />} />
          <Route path="log" element={<LogPage />} />
          <Route path="*" element={<Navigate to={currentArea} replace />} />
        </Routes>
      </main>
    </div>
  );
}
