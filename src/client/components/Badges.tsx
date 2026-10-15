import type {
  OpportunityDimensions,
  Opportunity,
  RunStatus,
  SupportLevel,
  FetchStatus,
  Corroboration,
} from '@domain/types';
import { SUPPORT_LEVEL_LABEL } from '@domain/findings';

const tone = (v: string): string => {
  switch (v) {
    case 'strong':
    case 'easy':
    case 'high_fit':
    case 'low_comp':
      return 'badge-ok';
    case 'medium':
    case 'moderate':
    case 'medium_fit':
    case 'medium_comp':
      return 'badge-warn';
    case 'weak':
    case 'hard':
    case 'low_fit':
    case 'high_comp':
      return 'badge-bad';
    default:
      return 'badge-neutral';
  }
};

export function DimBadge({ label, value, kind }: { label: string; value: string; kind?: 'fit' | 'comp' }) {
  const key = kind ? `${value}_${kind}` : value;
  return (
    <span className={`badge ${tone(key)}`} title={`${label}: ${value}`}>
      <span className="dim-label">{label}</span> {value}
    </span>
  );
}

export function Dimensions({ d, compact }: { d: OpportunityDimensions; compact?: boolean }) {
  return (
    <div className="dims">
      <span className={`badge badge-lg ${tone(d.evidenceStrength)}`}>Evidence {d.evidenceStrength}</span>
      {!compact && (
        <>
          <DimBadge label="Competition" value={d.competition} kind="comp" />
          <DimBadge label="Buildability" value={d.buildability} />
          <DimBadge label="Monetization" value={d.monetizationEvidence} />
          <DimBadge label="Distribution" value={d.distributionAccessibility} />
          <DimBadge label="Fit" value={d.developerFit} kind="fit" />
        </>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: Opportunity['status'] }) {
  const map: Record<Opportunity['status'], string> = {
    candidate: 'badge-neutral',
    interesting: 'badge-accent',
    hidden: 'badge-neutral',
    rejected: 'badge-bad',
    comparing: 'badge-warn',
    selected: 'badge-ok',
  };
  return <span className={`badge ${map[status]}`}>{status}</span>;
}

export function RunBadge({ status }: { status: RunStatus }) {
  const map: Record<RunStatus, string> = {
    queued: 'badge-neutral',
    running: 'badge-accent',
    completed: 'badge-ok',
    partial: 'badge-warn',
    failed: 'badge-bad',
  };
  return <span className={`badge ${map[status]}`}>{status}</span>;
}

export function DemoTag({ show }: { show: boolean }) {
  return show ? <span className="badge badge-demo">DEMO</span> : null;
}

export function Inference({ children }: { children: React.ReactNode }) {
  return (
    <span>
      <span className="inference-tag">INFERENCE · </span>
      {children}
    </span>
  );
}

export function SupportBadge({ level }: { level: SupportLevel }) {
  const tone =
    level === 'full_page_excerpt_verified'
      ? 'badge-ok'
      : level === 'full_page'
        ? 'badge-accent'
        : level === 'snippet_only'
          ? 'badge-warn'
          : 'badge-demo';
  return (
    <span className={`badge ${tone}`} title={SUPPORT_LEVEL_LABEL[level]}>
      {SUPPORT_LEVEL_LABEL[level]}
    </span>
  );
}

export function FetchBadge({ status }: { status: FetchStatus }) {
  const map: Record<FetchStatus, [string, string]> = {
    snippet_only: ['badge-neutral', 'snippet only'],
    fetch_pending: ['badge-neutral', 'fetch pending'],
    fetched: ['badge-ok', 'page read'],
    fetch_failed: ['badge-bad', 'fetch failed'],
    unavailable: ['badge-bad', 'unavailable'],
  };
  const [tone, label] = map[status];
  return <span className={`badge ${tone}`}>{label}</span>;
}

export function CategoryBadge({ category, confidence }: { category: string; confidence?: string }) {
  return (
    <span
      className="badge badge-neutral"
      title={confidence ? `classification confidence: ${confidence}` : undefined}
    >
      {category.replace(/_/g, ' ')}
    </span>
  );
}

/** Transparent corroboration line: counts the user can verify, no composite score. */
export function CorroborationLine({ c, compact }: { c: Corroboration | null; compact?: boolean }) {
  if (!c) return null;
  const mix = Object.entries(c.categoryMix)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`)
    .join(', ');
  return (
    <div className="small" style={{ color: 'var(--text-2)' }}>
      <strong>Corroboration:</strong> {c.canonicalSources} source{c.canonicalSources === 1 ? '' : 's'} ·{' '}
      {c.domains} domain{c.domains === 1 ? '' : 's'} · {c.distinctSourceTypes} source type
      {c.distinctSourceTypes === 1 ? '' : 's'}
      {c.discoveries > c.evidenceCount ? ` · ${c.discoveries} discoveries` : ''}
      {c.fetchedPages ? ` · ${c.fetchedPages} read in full` : ''}
      {!compact && (
        <div className="muted">
          {mix}. {c.summary}
        </div>
      )}
    </div>
  );
}
