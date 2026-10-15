import { describe, it, expect } from 'vitest';
import { canTransition, assertTransition, InvalidTransitionError, STAGE_ORDER } from '@domain/workflow';
import { DiscoveryProfile, Opportunity, Signal } from '@domain/types';

describe('workflow state machine', () => {
  it('allows the happy path forward', () => {
    const path = [
      'DISCOVERY_SETUP',
      'DISCOVERING',
      'OPPORTUNITIES_READY',
      'COMPARING',
      'INVESTIGATING',
      'DECISION_READY',
      'DECIDED',
      'BUILD_PACKAGE_READY',
      'VALIDATING',
    ] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
  });
  it('allows skipping comparison', () => {
    expect(canTransition('OPPORTUNITIES_READY', 'INVESTIGATING')).toBe(true);
  });
  it('allows sensible backward navigation', () => {
    expect(canTransition('DECIDED', 'OPPORTUNITIES_READY')).toBe(true);
    expect(canTransition('BUILD_PACKAGE_READY', 'DECIDED')).toBe(true);
  });
  it('rejects jumping to a build package from discovery', () => {
    expect(canTransition('DISCOVERY_SETUP', 'BUILD_PACKAGE_READY')).toBe(false);
    expect(() => assertTransition('DISCOVERY_SETUP', 'BUILD_PACKAGE_READY')).toThrow(InvalidTransitionError);
  });
  it('orders every stage', () => {
    expect(STAGE_ORDER).toHaveLength(9);
  });
});

describe('domain validation', () => {
  it('discovery profile is fully optional', () => {
    const p = DiscoveryProfile.parse({});
    expect(p.areas).toEqual([]);
    expect(p.teamSize).toBe('unspecified');
  });
  it('signal requires at least one evidence id', () => {
    const base = {
      id: 's',
      projectId: 'p',
      runId: 'r',
      type: 'repeated_pain',
      observation: 'o',
      inference: '',
      affectedUser: null,
      uncertainty: 'u',
      confidence: 'low',
      createdAt: 'now',
    };
    expect(() => Signal.parse({ ...base, evidenceIds: [] })).toThrow();
    expect(Signal.parse({ ...base, evidenceIds: ['e1'] }).evidenceIds).toEqual(['e1']);
  });
  it('opportunity requires at least one signal and transparent dimensions (no numeric score)', () => {
    const o = {
      id: 'o',
      projectId: 'p',
      runId: 'r',
      clusterId: null,
      title: 't',
      thesis: 't',
      problem: 'p',
      targetUser: 'u',
      evidenceSummary: 'e',
      signalIds: ['s1'],
      whyNow: 'w',
      currentAlternatives: 'a',
      potentialWedge: 'w',
      monetizationNotes: '',
      competitionNotes: '',
      buildabilityNotes: '',
      distributionNotes: '',
      majorUncertainties: [],
      openQuestions: [],
      status: 'candidate',
      seeded: false,
      createdAt: 'now',
      dimensions: {
        evidenceStrength: 'strong',
        competition: 'low',
        buildability: 'easy',
        monetizationEvidence: 'unknown',
        distributionAccessibility: 'unknown',
        developerFit: 'unspecified',
      },
    };
    expect(Opportunity.parse(o).dimensions.evidenceStrength).toBe('strong');
    expect(() => Opportunity.parse({ ...o, signalIds: [] })).toThrow();
    expect(() =>
      Opportunity.parse({ ...o, dimensions: { ...o.dimensions, evidenceStrength: 87 } }),
    ).toThrow();
  });
});
