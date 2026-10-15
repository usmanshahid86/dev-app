import { describe, it, expect } from 'vitest';
import { danglingReferences, evidenceForOpportunity, opportunitiesForEvidence } from '@domain/lineage';
import type { Evidence, Opportunity, Signal } from '@domain/types';

const ev = (id: string): Evidence => ({
  id,
  projectId: 'p',
  queryId: 'q',
  url: `https://demo.invalid/${id}`,
  title: id,
  snippet: 'x'.repeat(30),
  position: 0,
  providerMeta: null,
  provider: 'fixture',
  retrievedAt: 'now',
  fullText: null,
  isDemo: true,
});
const sig = (id: string, evidenceIds: string[]): Signal => ({
  id,
  projectId: 'p',
  runId: 'r',
  type: 'other',
  observation: id,
  inference: '',
  affectedUser: null,
  uncertainty: '',
  confidence: 'low',
  evidenceIds,
  createdAt: 'now',
});
const opp = (id: string, signalIds: string[]): Opportunity => ({
  id,
  projectId: 'p',
  runId: 'r',
  clusterId: null,
  title: id,
  thesis: '',
  problem: '',
  targetUser: '',
  evidenceSummary: '',
  signalIds,
  whyNow: '',
  currentAlternatives: '',
  potentialWedge: '',
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
    evidenceStrength: 'weak',
    competition: 'unknown',
    buildability: 'unknown',
    monetizationEvidence: 'unknown',
    distributionAccessibility: 'unknown',
    developerFit: 'unspecified',
  },
});

describe('lineage helpers', () => {
  const evidence = [ev('e1'), ev('e2'), ev('e3')];
  const signals = [sig('s1', ['e1', 'e2']), sig('s2', ['e3'])];
  const opps = [opp('o1', ['s1']), opp('o2', ['s1', 's2'])];
  it('walks opportunity → signals → evidence', () => {
    expect(evidenceForOpportunity(opps[0]!, signals, evidence).map((e) => e.id)).toEqual(['e1', 'e2']);
  });
  it('walks evidence → opportunities', () => {
    expect(opportunitiesForEvidence('e3', signals, opps).map((o) => o.id)).toEqual(['o2']);
  });
  it('detects dangling references', () => {
    expect(danglingReferences({ evidence, signals, opportunities: opps })).toEqual([]);
    expect(
      danglingReferences({
        evidence,
        signals: [sig('s9', ['nope'])],
        opportunities: [opp('o9', ['s9', 'missing'])],
      }),
    ).toHaveLength(2);
  });
});
