import type { OpportunityDimensions, Opportunity, RunStatus } from '@domain/types';

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
