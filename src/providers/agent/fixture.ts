/**
 * FixtureAgentProvider — deterministic "reasoning" over the demo corpus.
 * It never calls a model. It maps evidence URLs → canned signals/findings so that the lineage the
 * workflow persists is real, while the content is obviously DEMO.
 */
import type { AgentOperation, AgentProvider, AgentRunResult } from './AgentProvider';
import { AgentProviderError } from './AgentProvider';
import { findDemoPageByUrl, type DemoThemeId } from '../../../fixtures/demo/corpus';
import {
  DEMO_SIGNALS,
  DEMO_OPPORTUNITIES,
  DEMO_DISCOVERY_QUERIES,
  findInvestigation,
  type DemoInvestigation,
} from '../../../fixtures/demo/themes';
import type { DiscoveryProfile, Assumption } from '@domain/types';
import type {
  EvidenceForAgent,
  OpportunityForAgent,
  DiscoveryPlanOutput,
  SignalExtractionOutput,
  ClusterOutput,
  OpportunityOutput,
  InvestigationPlanOutput,
  ComparisonOutput,
  BriefOutput,
  RecommendationOutput,
  BuildPackageOutput,
  ValidationReviewOutput,
} from './ops';
import { BRIEF_SECTIONS } from './ops';

const DEMO_TAG = '[DEMO] ';

export class FixtureAgentProvider implements AgentProvider {
  readonly name = 'fixture';
  readonly isDemo = true;

  async run<I, O>(op: AgentOperation<I, O>, input: I): Promise<AgentRunResult<O>> {
    const handler = (HANDLERS as Record<string, (i: any) => unknown>)[op.name];
    if (!handler)
      throw new AgentProviderError(
        `fixture agent has no handler for ${op.name}`,
        this.name,
        'unknown',
        false,
      );
    const raw = handler(input);
    const parsed = op.output.safeParse(raw);
    if (!parsed.success) {
      throw new AgentProviderError(
        `fixture output invalid for ${op.name}: ${parsed.error.issues[0]?.message}`,
        this.name,
        'malformed_output',
        false,
        parsed.error.issues,
      );
    }
    return { output: parsed.data, provider: this.name, meta: { demo: true } };
  }

  async healthCheck() {
    return { ok: true, message: 'fixture agent (deterministic demo reasoning)' };
  }
}

// ---------- helpers ----------

function themeOfOpportunity(opp: OpportunityForAgent): DemoThemeId | null {
  const t = DEMO_OPPORTUNITIES.find((o) => opp.title.includes(o.title) || opp.thesis === o.thesis);
  return t?.theme ?? null;
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

function resolveUrls(urls: string[], evidence: EvidenceForAgent[]): string[] {
  const ids: string[] = [];
  for (const u of urls) {
    const e = evidence.find((x) => x.url === u);
    if (e) ids.push(e.id);
  }
  return ids;
}

// ---------- handlers ----------

const HANDLERS = {
  planDiscovery(i: { profile: DiscoveryProfile; maxQueries: number }): DiscoveryPlanOutput {
    const p = i.profile;
    let qs = DEMO_DISCOVERY_QUERIES.map((q) => ({ ...q, family: q.family as any }));
    if (p.directionSeed) {
      const seedTokens = new Set(tokens(p.directionSeed));
      const scored = qs.map((q) => ({ q, s: tokens(q.query).filter((t) => seedTokens.has(t)).length }));
      const related = scored
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.q);
      qs = [
        {
          query: p.directionSeed,
          family: 'direction_seed' as any,
          purpose: 'Test the stated direction against evidence',
        },
        ...related,
      ];
    } else if (p.areas.length) {
      const areaTokens = new Set(p.areas.flatMap(tokens));
      const scored = qs.map((q) => ({
        q,
        s: tokens(`${q.query} ${q.purpose}`).filter((t) => areaTokens.has(t)).length,
      }));
      const related = scored.filter((x) => x.s > 0).map((x) => x.q);
      if (related.length >= 3) qs = related;
    }
    if (p.avoid.length) {
      const avoidTokens = new Set(p.avoid.flatMap(tokens));
      qs = qs.filter((q) => !tokens(q.query).some((t) => avoidTokens.has(t)));
    }
    return { queries: qs.slice(0, i.maxQueries).map((q) => ({ ...q, purpose: DEMO_TAG + q.purpose })) };
  },

  extractSignals(i: { evidence: EvidenceForAgent[] }): SignalExtractionOutput {
    const byKey = new Map<string, string[]>();
    for (const e of i.evidence) {
      const page = findDemoPageByUrl(e.url);
      if (!page?.signalKey) continue;
      const list = byKey.get(page.signalKey) ?? [];
      if (!list.includes(e.id)) list.push(e.id);
      byKey.set(page.signalKey, list);
    }
    const signals = [...byKey.entries()]
      .map(([key, evidenceIds]) => {
        const s = DEMO_SIGNALS.find((x) => x.key === key);
        if (!s) return null;
        return {
          type: s.type,
          observation: DEMO_TAG + s.observation,
          inference: s.inference,
          affectedUser: s.affectedUser,
          uncertainty: s.uncertainty,
          confidence: s.confidence,
          evidenceIds,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return { signals };
  },

  clusterSignals(i: { signals: Array<{ id: string; observation: string }> }): ClusterOutput {
    const byTheme = new Map<DemoThemeId, string[]>();
    for (const s of i.signals) {
      const demo = DEMO_SIGNALS.find((d) => s.observation.includes(d.observation));
      if (!demo) continue;
      const list = byTheme.get(demo.theme) ?? [];
      list.push(s.id);
      byTheme.set(demo.theme, list);
    }
    const clusters = [...byTheme.entries()]
      .filter(([, ids]) => ids.length >= 2)
      .map(([theme, signalIds]) => {
        const t = DEMO_OPPORTUNITIES.find((o) => o.theme === theme);
        return {
          label: DEMO_TAG + (t?.clusterLabel ?? theme),
          description: t?.clusterDescription ?? `Signals about ${theme}`,
          rationale: t?.clusterRationale ?? 'Signals share a theme in the demo corpus.',
          signalIds,
        };
      });
    return { clusters };
  },

  generateOpportunities(i: {
    profile: DiscoveryProfile;
    clusters: Array<{ id: string; label: string; signals: Array<{ id: string; observation: string }> }>;
  }): OpportunityOutput {
    const opportunities: OpportunityOutput['opportunities'] = [];
    for (const c of i.clusters) {
      const first = c.signals[0];
      const demo = first && DEMO_SIGNALS.find((d) => first.observation.includes(d.observation));
      const theme = demo?.theme;
      const t = DEMO_OPPORTUNITIES.find((o) => o.theme === theme);
      if (!t || c.signals.length < t.minSignals) continue;
      const seeded = Boolean(
        i.profile.directionSeed && tokens(i.profile.directionSeed).some((w) => tokens(t.title).includes(w)),
      );
      const dims = { ...t.dimensions };
      if (i.profile.customerType === 'developers' && ['agent-context', 'llm-cost'].includes(t.theme))
        dims.developerFit = 'high';
      else if (i.profile.customerType !== 'any' || i.profile.strengths.length) dims.developerFit = 'medium';
      opportunities.push({
        clusterId: c.id,
        title: DEMO_TAG + t.title,
        thesis: t.thesis,
        problem: t.problem,
        targetUser: t.targetUser,
        evidenceSummary: t.evidenceSummary,
        signalIds: c.signals.map((s) => s.id),
        whyNow: t.whyNow,
        currentAlternatives: t.currentAlternatives,
        potentialWedge: t.potentialWedge,
        monetizationNotes: t.monetizationNotes,
        competitionNotes: t.competitionNotes,
        buildabilityNotes: t.buildabilityNotes,
        distributionNotes: t.distributionNotes,
        majorUncertainties: t.majorUncertainties,
        openQuestions: t.openQuestions,
        dimensions: dims,
        seeded,
      });
    }
    return { opportunities };
  },

  planInvestigation(i: { opportunity: OpportunityForAgent; maxQueries: number }): InvestigationPlanOutput {
    const inv = findInvestigation(themeOfOpportunity(i.opportunity));
    const base = inv?.investigationQueries ?? [
      {
        query: i.opportunity.title.replace(DEMO_TAG, ''),
        purpose: 'Generic re-search of the opportunity title',
      },
    ];
    return { queries: base.slice(0, i.maxQueries).map((q) => ({ ...q, purpose: DEMO_TAG + q.purpose })) };
  },

  compareOpportunities(i: {
    candidates: Array<{ opportunity: OpportunityForAgent; evidence: EvidenceForAgent[] }>;
  }): ComparisonOutput {
    const findings: ComparisonOutput['findings'] = [];
    const rows: ComparisonOutput['rows'] = [];
    for (const [idx, c] of i.candidates.entries()) {
      const inv = findInvestigation(themeOfOpportunity(c.opportunity));
      const keys: string[] = [];
      for (const f of inv?.findings ?? []) {
        const key = `C${idx + 1}-${f.key}`;
        keys.push(key);
        findings.push({
          key,
          section: f.section,
          claim: DEMO_TAG + f.claim,
          kind: f.kind,
          supportStrength: f.supportStrength,
          evidenceIds: resolveUrls(f.urls, c.evidence),
        });
      }
      const row = inv?.comparisonRow;
      rows.push({
        opportunityId: c.opportunity.id,
        problemEvidenceStrength: row?.problemEvidenceStrength ?? 'weak',
        targetUser: c.opportunity.targetUser,
        alternatives: row?.alternatives ?? c.opportunity.currentAlternatives,
        marketCrowding: row?.marketCrowding ?? 'unknown',
        monetizationEvidence: row?.monetizationEvidence ?? 'unknown',
        distributionAccessibility: row?.distributionAccessibility ?? 'unknown',
        technicalFeasibility: row?.technicalFeasibility ?? 'unknown',
        majorConstraints: row?.majorConstraints ?? 'Not investigated in demo',
        biggestUnknown: row?.biggestUnknown ?? c.opportunity.openQuestions[0] ?? 'Unknown',
        findingKeys: keys,
      });
    }
    return {
      findings,
      rows,
      summary:
        DEMO_TAG +
        'Trade-offs: the strongest problem evidence sits with the candidates that also have the clearest distribution surface; monetization evidence differs most. No winner is declared here — the comparison is meant to inform the human choice.',
    };
  },

  synthesizeBrief(i: { opportunity: OpportunityForAgent; evidence: EvidenceForAgent[] }): BriefOutput {
    const inv = findInvestigation(themeOfOpportunity(i.opportunity));
    if (!inv) return genericBrief(i.opportunity, i.evidence);
    return {
      findings: inv.findings.map((f) => ({
        key: f.key,
        section: f.section,
        claim: DEMO_TAG + f.claim,
        kind: f.kind,
        supportStrength: f.supportStrength,
        evidenceIds: resolveUrls(f.urls, i.evidence),
      })),
      sections: BRIEF_SECTIONS.map((s) => {
        const sec = inv.sections[s.key];
        return { key: s.key, body: sec?.body ?? '(no content in demo)', findingKeys: sec?.findingKeys ?? [] };
      }),
    };
  },

  recommendDecision(i: {
    opportunity: OpportunityForAgent;
    findings: Array<{ id: string; claim: string }>;
  }): RecommendationOutput {
    const inv = findInvestigation(themeOfOpportunity(i.opportunity));
    const keyToId = mapFindingKeys(inv, i.findings);
    const r = inv?.recommendation;
    return {
      recommendation: r?.recommendation ?? 'INVESTIGATE_FURTHER',
      why: DEMO_TAG + (r?.why ?? 'Evidence in the demo corpus is too thin for a confident recommendation.'),
      targetUser: i.opportunity.targetUser,
      problem: i.opportunity.problem,
      proposedWedge: r?.proposedWedge ?? i.opportunity.potentialWedge,
      whyNow: i.opportunity.whyNow,
      existingAlternatives: i.opportunity.currentAlternatives,
      distributionHypothesis: r?.distributionHypothesis ?? 'Unknown',
      monetizationHypothesis: r?.monetizationHypothesis ?? 'Unknown',
      criticalAssumptions: (r?.assumptions ?? []).map((a) => ({
        statement: a.statement,
        supportingFindingIds: a.supportKeys.map((k) => keyToId.get(k)).filter((x): x is string => Boolean(x)),
        evidenceAgainstFindingIds: a.againstKeys
          .map((k) => keyToId.get(k))
          .filter((x): x is string => Boolean(x)),
        status: a.status,
      })),
      unknowns: r?.unknowns ?? i.opportunity.openQuestions,
      whatWouldChangeTheDecision: r?.whatWouldChange ?? [],
      supportingFindingIds: i.findings.map((f) => f.id),
    };
  },

  generateBuildPackage(i: {
    opportunity: OpportunityForAgent;
    decision: { kind: string; pivotDirection: string | null };
    assumptions: Assumption[];
    findings: Array<{ id: string; claim: string }>;
  }): BuildPackageOutput {
    const inv = findInvestigation(themeOfOpportunity(i.opportunity));
    const keyToId = mapFindingKeys(inv, i.findings);
    const bp = inv?.buildPackage;
    const title = i.opportunity.title.replace(DEMO_TAG, '');
    return {
      productDefinition: DEMO_TAG + (bp?.productDefinition ?? `A minimal product for: ${title}`),
      targetUser: i.opportunity.targetUser,
      problem: i.opportunity.problem,
      valueProposition: bp?.valueProposition ?? i.opportunity.thesis,
      evidenceBackedRationale: `Chosen because: ${i.opportunity.evidenceSummary}${i.decision.pivotDirection ? ` Pivot direction: ${i.decision.pivotDirection}.` : ''}`,
      mvpScope: bp?.mvpScope ?? ['Smallest coherent slice of the thesis'],
      nonGoals: bp?.nonGoals ?? ['Everything outside the MVP scope'],
      userFlows: bp?.userFlows ?? ['Primary flow to be defined'],
      requirements: (
        bp?.requirements ?? [
          {
            text: `Implement the core of ${title}.`,
            priority: 'must' as const,
            assumptionIdx: [],
            findingKeys: [],
          },
        ]
      ).map((r) => ({
        text: r.text,
        priority: r.priority,
        assumptionIds: r.assumptionIdx
          .map((n) => i.assumptions[n]?.id)
          .filter((x): x is string => Boolean(x)),
        findingIds: r.findingKeys.map((k) => keyToId.get(k)).filter((x): x is string => Boolean(x)),
      })),
      architectureProposal: bp?.architectureProposal ?? 'PROPOSAL: single service, SQLite, minimal UI.',
      interfaces: bp?.interfaces ?? [],
      dataModel: bp?.dataModel ?? [],
      milestones: bp?.milestones ?? [{ title: 'M1', description: 'Build the MVP.' }],
      acceptanceCriteria: bp?.acceptanceCriteria ?? ['MVP runs end to end'],
      risks: bp?.risks ?? [],
      openQuestions: bp?.openQuestions ?? i.opportunity.openQuestions,
      validationPlan: bp?.validationPlan ?? ['Re-check assumptions after launch'],
      evidenceBackedAssumptions: i.assumptions.map((a) => `${a.statement} [${a.status}]`),
    };
  },

  planValidation(i: { opportunity: OpportunityForAgent; maxQueries: number }): InvestigationPlanOutput {
    const inv = findInvestigation(themeOfOpportunity(i.opportunity));
    const base = inv?.validationQueries ?? [
      { query: i.opportunity.title.replace(DEMO_TAG, ''), purpose: 'Re-check the opportunity' },
    ];
    return { queries: base.slice(0, i.maxQueries).map((q) => ({ ...q, purpose: DEMO_TAG + q.purpose })) };
  },

  reviewValidation(i: {
    assumptions: Assumption[];
    newEvidence: EvidenceForAgent[];
  }): ValidationReviewOutput {
    const findings = i.newEvidence.slice(0, 3).map((e, idx) => ({
      key: `V${idx + 1}`,
      section: 'validation',
      claim:
        DEMO_TAG +
        `Fresh search still returns "${e.title.replace(DEMO_TAG, '')}" — the original signal is still observable.`,
      kind: 'sourced_fact' as const,
      supportStrength: 'medium' as const,
      evidenceIds: [e.id],
    }));
    return {
      findings,
      assumptionStatus: i.assumptions.map((a, idx) => ({
        assumptionId: a.id,
        status: idx === 0 ? 'still_true' : a.status === 'unknown' ? 'unknown' : 'weakened',
        note:
          DEMO_TAG +
          (idx === 0
            ? 'Re-search surfaced the same evidence.'
            : 'No new evidence either way in the demo corpus.'),
      })),
      externalChanges: [DEMO_TAG + 'No external changes detected in the demo corpus (it is static).'],
      verdict: i.newEvidence.length ? 'CONTINUE' : 'CHANGE_WEDGE',
      rationale:
        DEMO_TAG +
        (i.newEvidence.length
          ? 'The original signals are still observable and no contradicting evidence was found.'
          : 'The re-check found no evidence; reconsider the wedge.'),
    };
  },
};

function mapFindingKeys(
  inv: DemoInvestigation | undefined,
  findings: Array<{ id: string; claim: string }>,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of inv?.findings ?? []) {
    const match = findings.find((x) => x.claim.includes(f.claim));
    if (match) m.set(f.key, match.id);
  }
  return m;
}

function genericBrief(opp: OpportunityForAgent, evidence: EvidenceForAgent[]): BriefOutput {
  const findings = evidence.slice(0, 4).map((e, idx) => ({
    key: `F${idx + 1}`,
    section: 'observations',
    claim: DEMO_TAG + `Source says: ${e.snippet}`,
    kind: 'sourced_fact' as const,
    supportStrength: 'weak' as const,
    evidenceIds: [e.id],
  }));
  if (!findings.length) {
    findings.push({
      key: 'F1',
      section: 'observations',
      claim: DEMO_TAG + 'No evidence was available for this opportunity in the demo corpus.',
      kind: 'sourced_fact',
      supportStrength: 'weak',
      evidenceIds: [],
    });
  }
  const keys = findings.map((f) => f.key);
  return {
    findings,
    sections: BRIEF_SECTIONS.map((s) => ({
      key: s.key,
      body:
        s.key === 'executive_summary'
          ? `${DEMO_TAG}Generic demo brief for "${opp.title}". ${keys.map((k) => `[F:${k}]`).join(' ')}`
          : `(demo) No themed content for ${s.title.toLowerCase()}.`,
      findingKeys: s.key === 'executive_summary' ? keys : [],
    })),
  };
}
