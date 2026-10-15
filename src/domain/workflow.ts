import { WorkflowStage } from './types';

/**
 * Explicit workflow state machine. Forward transitions are driven by workflow completion;
 * backward transitions are allowed to any earlier stage whose artifacts exist (nothing is deleted).
 */
export const STAGE_ORDER: WorkflowStage[] = [
  'DISCOVERY_SETUP',
  'DISCOVERING',
  'OPPORTUNITIES_READY',
  'COMPARING',
  'INVESTIGATING',
  'DECISION_READY',
  'DECIDED',
  'BUILD_PACKAGE_READY',
  'VALIDATING',
];

const FORWARD: Record<WorkflowStage, WorkflowStage[]> = {
  DISCOVERY_SETUP: ['DISCOVERING', 'OPPORTUNITIES_READY'],
  DISCOVERING: ['OPPORTUNITIES_READY', 'DISCOVERY_SETUP'],
  OPPORTUNITIES_READY: ['COMPARING', 'INVESTIGATING', 'DISCOVERING', 'DISCOVERY_SETUP'],
  COMPARING: ['INVESTIGATING', 'OPPORTUNITIES_READY'],
  INVESTIGATING: ['DECISION_READY', 'OPPORTUNITIES_READY', 'COMPARING'],
  DECISION_READY: ['DECIDED', 'INVESTIGATING', 'OPPORTUNITIES_READY'],
  DECIDED: ['BUILD_PACKAGE_READY', 'INVESTIGATING', 'OPPORTUNITIES_READY', 'DECISION_READY'],
  BUILD_PACKAGE_READY: ['VALIDATING', 'DECIDED', 'OPPORTUNITIES_READY'],
  VALIDATING: ['BUILD_PACKAGE_READY', 'OPPORTUNITIES_READY', 'DECIDED'],
};

export function canTransition(from: WorkflowStage, to: WorkflowStage): boolean {
  if (from === to) return true;
  return FORWARD[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: WorkflowStage,
    public readonly to: WorkflowStage,
  ) {
    super(`Cannot move workflow from ${from} to ${to}`);
  }
}

export function assertTransition(from: WorkflowStage, to: WorkflowStage): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export function stageIndex(stage: WorkflowStage): number {
  return STAGE_ORDER.indexOf(stage);
}

export const STAGE_LABELS: Record<WorkflowStage, string> = {
  DISCOVERY_SETUP: 'Discovery setup',
  DISCOVERING: 'Discovering',
  OPPORTUNITIES_READY: 'Opportunities ready',
  COMPARING: 'Comparing',
  INVESTIGATING: 'Investigating',
  DECISION_READY: 'Decision ready',
  DECIDED: 'Decided',
  BUILD_PACKAGE_READY: 'Build package ready',
  VALIDATING: 'Validating',
};

/** Which top-level nav area a stage belongs to. */
export type NavArea = 'discover' | 'research' | 'decision' | 'build' | 'validate';
export const STAGE_AREA: Record<WorkflowStage, NavArea> = {
  DISCOVERY_SETUP: 'discover',
  DISCOVERING: 'discover',
  OPPORTUNITIES_READY: 'discover',
  COMPARING: 'research',
  INVESTIGATING: 'research',
  DECISION_READY: 'decision',
  DECIDED: 'decision',
  BUILD_PACKAGE_READY: 'build',
  VALIDATING: 'validate',
};
