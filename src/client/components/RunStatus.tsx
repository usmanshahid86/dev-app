import type { ResearchRun, RunStageLabel } from '@domain/types';
import { RunBadge } from './Badges';

const DISCOVERY_STEPS: Array<{ key: RunStageLabel; label: string }> = [
  { key: 'planning', label: 'Planning' },
  { key: 'searching', label: 'Searching' },
  { key: 'extracting_signals', label: 'Extracting signals' },
  { key: 'consolidating_signals', label: 'Consolidating' },
  { key: 'clustering', label: 'Clustering' },
  { key: 'building_opportunities', label: 'Building opportunities' },
];
const INVESTIGATION_STEPS: Array<{ key: RunStageLabel; label: string }> = [
  { key: 'planning', label: 'Planning' },
  { key: 'searching', label: 'Searching' },
  { key: 'fetching_pages', label: 'Reading pages' },
  { key: 'synthesizing', label: 'Synthesizing brief' },
  { key: 'recommending', label: 'Recommending' },
];
const COMPARISON_STEPS: Array<{ key: RunStageLabel; label: string }> = [
  { key: 'planning', label: 'Planning' },
  { key: 'searching', label: 'Searching' },
  { key: 'fetching_pages', label: 'Reading pages' },
  { key: 'comparing', label: 'Comparing' },
];
const VALIDATION_STEPS: Array<{ key: RunStageLabel; label: string }> = [
  { key: 'planning', label: 'Planning' },
  { key: 'searching', label: 'Searching' },
  { key: 'fetching_pages', label: 'Reading pages' },
  { key: 'reviewing', label: 'Reviewing' },
];

/** Three cost categories, never summed into one figure. */
export function describeAgentCost(c: ResearchRun['progress']['agentCost']): string {
  if (!c) return 'agent cost: unknown (run predates cost accounting)';
  const parts: string[] = [];
  if (c.cliReportedUsd !== null)
    parts.push(
      `CLI-reported API-equivalent $${c.cliReportedUsd.toFixed(3)} (${c.cliReportedCalls} call${c.cliReportedCalls === 1 ? '' : 's'}; not billed expenditure under a subscription)`,
    );
  if (c.estimatedUsd !== null)
    parts.push(
      `estimated $${c.estimatedUsd.toFixed(3)} from tokens (${c.estimatedCalls} call${c.estimatedCalls === 1 ? '' : 's'}, price table ${c.pricingVersion})`,
    );
  if (c.unknownCalls)
    parts.push(`${c.unknownCalls} call${c.unknownCalls === 1 ? '' : 's'} with unknown cost`);
  return `agent cost: ${parts.join(' · ') || `${c.calls} calls, no cost data`}`;
}

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
        {run.kind === 'discovery'
          ? ` · ${p.signalCount} raw signals → ${p.consolidatedSignalCount} consolidated`
          : ''}
        {run.budget.maxPageFetches > 0
          ? ` · pages ${p.pageFetchesCompleted} read / ${p.pageFetchesSelected} selected${p.pageFetchesFailed ? ` / ${p.pageFetchesFailed} failed` : ''}`
          : ''}
        {p.agentRetries ? ` · ${p.agentRetries} agent retr${p.agentRetries === 1 ? 'y' : 'ies'}` : ''}
        {p.retrieval ? ` · retrieval ${p.retrieval}${p.retrievalNote ? ` (${p.retrievalNote})` : ''}` : ''}
        {p.pageFetchesSuppressed
          ? ` · ${p.pageFetchesSuppressed} fetch candidate${p.pageFetchesSuppressed === 1 ? '' : 's'} excluded by fetch policy`
          : ''}
      </div>
      <div className="small muted" data-testid="agent-cost">
        {describeAgentCost(p.agentCost)}
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
