import type { Evidence, Finding, Opportunity, Signal, Requirement, Decision } from './types';

/** Pure lineage helpers used by the UI, exports and tests. */

export function evidenceForSignal(signal: Signal, evidence: Evidence[]): Evidence[] {
  const set = new Set(signal.evidenceIds);
  return evidence.filter((e) => set.has(e.id));
}

export function signalsForOpportunity(opp: Opportunity, signals: Signal[]): Signal[] {
  const set = new Set(opp.signalIds);
  return signals.filter((s) => set.has(s.id));
}

export function evidenceForOpportunity(
  opp: Opportunity,
  signals: Signal[],
  evidence: Evidence[],
): Evidence[] {
  const ids = new Set(signalsForOpportunity(opp, signals).flatMap((s) => s.evidenceIds));
  return evidence.filter((e) => ids.has(e.id));
}

export function opportunitiesForEvidence(
  evidenceId: string,
  signals: Signal[],
  opps: Opportunity[],
): Opportunity[] {
  const sigIds = new Set(signals.filter((s) => s.evidenceIds.includes(evidenceId)).map((s) => s.id));
  return opps.filter((o) => o.signalIds.some((id) => sigIds.has(id)));
}

export function evidenceForFinding(finding: Finding, evidence: Evidence[]): Evidence[] {
  const set = new Set(finding.evidenceIds);
  return evidence.filter((e) => set.has(e.id));
}

export function findingsForRequirement(req: Requirement, decision: Decision, findings: Finding[]): Finding[] {
  const direct = new Set(req.findingIds);
  const viaAssumption = new Set(
    decision.agentRecommendation.criticalAssumptions
      .filter((a) => req.assumptionIds.includes(a.id))
      .flatMap((a) => a.supportingFindingIds),
  );
  return findings.filter((f) => direct.has(f.id) || viaAssumption.has(f.id));
}

/** Validate that every referenced id exists. Returns a list of dangling references. */
export function danglingReferences(input: {
  evidence: Evidence[];
  signals: Signal[];
  opportunities: Opportunity[];
}): string[] {
  const problems: string[] = [];
  const evIds = new Set(input.evidence.map((e) => e.id));
  const sigIds = new Set(input.signals.map((s) => s.id));
  for (const s of input.signals) {
    for (const id of s.evidenceIds)
      if (!evIds.has(id)) problems.push(`signal ${s.id} → missing evidence ${id}`);
  }
  for (const o of input.opportunities) {
    for (const id of o.signalIds)
      if (!sigIds.has(id)) problems.push(`opportunity ${o.id} → missing signal ${id}`);
  }
  return problems;
}
