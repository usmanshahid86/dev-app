import type { ResearchRun, RunStageLabel } from '@domain/types';
import { RunBadge } from './Badges';

const DISCOVERY_STEPS: Array<{ key: RunStageLabel; label: string }> = [
  { key: 'planning', label: 'Planning' },
  { key: 'searching', label: 'Searching' },
  { key: 'extracting_signals', label: 'Extracting signals' },
  { key: 'clustering', label: 'Clustering' },
  { key: 'building_opportunities', label: 'Building opportunities' },
];
const INVESTIGATION_STEPS: Array<{ key: RunStageLabel; label: string }> = [
  { key: 'planning', label: 'Planning' },
  { key: 'searching', label: 'Searching' },
  { key: 'synthesizing', label: 'Synthesizing brief' },
  { key: 'recommending', label: 'Recommending' },
];
const COMPARISON_STEPS: Array<{ key: RunStageLabel; label: string }> = [
  { key: 'planning', label: 'Planning' },
  { key: 'searching', label: 'Searching' },
  { key: 'comparing', label: 'Comparing' },
];
const VALIDATION_STEPS: Array<{ key: RunStageLabel; label: string }> = [
  { key: 'planning', label: 'Planning' },
  { key: 'searching', label: 'Searching' },
  { key: 'reviewing', label: 'Reviewing' },
];

export function RunStatus({ run }: { run: ResearchRun }) {
  const steps =
    run.kind === 'discovery'
      ? DISCOVERY_STEPS
      : run.kind === 'investigation'
        ? INVESTIGATION_STEPS
        : run.kind === 'comparison'
          ? COMPARISON_STEPS
          : VALIDATION_STEPS;
  const idx = run.stage === 'done' ? steps.length : steps.findIndex((s) => s.key === run.stage);
  const p = run.progress;
  return (
    <div className="card">
      <div className="row spread">
        <div className="row">
          <strong style={{ textTransform: 'capitalize' }}>{run.kind}</strong>
          <RunBadge status={run.status} />
          {(run.status === 'running' || run.status === 'queued') && <span className="spinner" />}
        </div>
        <div className="small muted">
          budget {run.budget.maxQueries} queries × {run.budget.maxResultsPerQuery} results · search{' '}
          {run.searchProvider} · agent {run.agentProvider}
        </div>
      </div>
      <div className="progress" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
        {steps.map((s, i) => (
          <div
            key={s.key}
            className={`step ${i < idx ? 'done' : i === idx && run.status === 'running' ? 'now' : ''}`}
          >
            {s.label}
          </div>
        ))}
      </div>
      <div className="small muted">
        {p.queriesCompleted}/{p.queriesPlanned} queries done
        {p.queriesFailed ? `, ${p.queriesFailed} failed` : ''} · {p.evidenceCount} evidence
        {run.kind === 'discovery' ? ` · ${p.signalCount} signals` : ''}
      </div>
      {run.error && (
        <div
          className={`notice ${run.status === 'failed' ? 'notice-error' : 'notice-warn'}`}
          style={{ marginTop: 8 }}
        >
          {run.error}
        </div>
      )}
    </div>
  );
}
