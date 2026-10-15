/**
 * Agent operations: the structured reasoning steps the workflow engine asks an agent to perform.
 * Each op has an explicit Zod output schema; providers must return exactly that shape.
 *
 * Prompts consistently require the agent to separate what sources SAY (observation / sourced_fact)
 * from what it INFERS (inference), and to cite evidence ids it was given — never to invent ids.
 */
import { z } from 'zod';
import { defineOperation } from '../AgentProvider';
import {
  DiscoveryProfile,
  QueryFamily,
  SignalType,
  OpportunityDimensions,
  EvidenceStrength,
  CompetitionLevel,
  MonetizationEvidence,
  DistributionAccessibility,
  Buildability,
  DecisionKind,
  ValidationVerdict,
  SupportStrength,
  FindingKind,
  type Assumption,
} from '@domain/types';

const SYSTEM_BASE = `You are a research agent inside a developer tool that helps a developer discover what might be worth building.
Core rules:
- Distinguish strictly between what a source SAYS (observation / sourced fact) and what you INFER.
- Only reference evidence ids that appear in the input. Never invent ids, URLs, statistics or quotes.
- If evidence is thin, say so explicitly rather than filling gaps with plausible-sounding claims.
- Be concrete and compact. No marketing language.
- Return only the structured output requested.`;

const profileText = (p: DiscoveryProfile) => {
  const lines: string[] = [];
  if (p.directionSeed) lines.push(`Developer's stated direction: ${p.directionSeed}`);
  if (p.areas.length) lines.push(`Areas of interest: ${p.areas.join(', ')}`);
  if (p.strengths.length) lines.push(`Strengths/skills: ${p.strengths.join(', ')}`);
  if (p.teamSize !== 'unspecified') lines.push(`Team size: ${p.teamSize}`);
  if (p.timeToMvp !== 'flexible') lines.push(`Time to MVP: ${p.timeToMvp}`);
  if (p.resources !== 'flexible') lines.push(`Resources: ${p.resources}`);
  if (p.customerType !== 'any') lines.push(`Target customer type: ${p.customerType}`);
  if (p.businessModel) lines.push(`Preferred business model: ${p.businessModel}`);
  if (p.geography) lines.push(`Geography: ${p.geography}`);
  if (p.avoid.length) lines.push(`Avoid: ${p.avoid.join(', ')}`);
  if (p.constraints) lines.push(`Other constraints: ${p.constraints}`);
  return lines.length ? lines.join('\n') : '(no constraints given — explore broadly)';
};

// ---------------- planDiscovery ----------------
export const PlannedQuery = z.object({
  query: z.string().min(3),
  family: QueryFamily,
  purpose: z.string(),
});
export const DiscoveryPlanOutput = z.object({ queries: z.array(PlannedQuery).min(1) });
export type DiscoveryPlanOutput = z.infer<typeof DiscoveryPlanOutput>;

export const planDiscovery = defineOperation<
  { profile: DiscoveryProfile; maxQueries: number },
  DiscoveryPlanOutput
>({
  name: 'planDiscovery',
  description: 'Plan web searches that look for observable signals (not ideas).',
  output: DiscoveryPlanOutput,
  effort: 'medium',
  buildPrompt: ({ profile, maxQueries }) => ({
    system: SYSTEM_BASE,
    user: `Plan at most ${maxQueries} web search queries to discover OBSERVABLE SIGNALS that might indicate something worth building.
Do NOT search for "startup ideas". Search for things people actually write on the web: complaints, workarounds, feature requests, pricing pages, shutdown notices, changelogs, surveys, marketplaces, policy changes.

Signal families (choose the ones that fit the profile; don't force all of them):
- pain_workaround: recurring complaints, manual workflows, hacks, tool-stitching, requested missing functionality
- market_movement: new platforms, adoption, new APIs, pricing changes, shutdowns, acquisitions, category growth
- technical_change: newly possible capabilities, model/platform changes, new standards, infrastructure getting cheaper
- ecosystem_gap: issue trackers / feature requests, adjacent tooling around popular projects, fragmented categories, missing integrations
- economic_distribution: evidence someone pays, high incumbent pricing, marketplaces, identifiable buyer channels
- constraint_change: policy/regulatory changes, platform restrictions, security/compliance requirements
${profile.directionSeed ? `- direction_seed: queries that test the developer's stated direction against real evidence\n` : ''}
Developer profile:
${profileText(profile)}

Each query should be specific enough to return concrete pages (forum threads, issues, pricing pages, changelogs), and the purpose should say what signal it is hunting for.`,
  }),
});

// ---------------- extractSignals ----------------
export const EvidenceForAgent = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  snippet: z.string(),
  query: z.string(),
});
export type EvidenceForAgent = z.infer<typeof EvidenceForAgent>;

export const ExtractedSignal = z.object({
  type: SignalType,
  observation: z.string().describe('What the source(s) actually say. No inference here.'),
  inference: z.string().describe('What you infer from the observation; may be empty string.'),
  affectedUser: z.string().nullable(),
  uncertainty: z.string().describe('What is uncertain about this signal (sample size, bias, age...).'),
  confidence: z.enum(['high', 'medium', 'low']),
  evidenceIds: z.array(z.string()).min(1),
});
export const SignalExtractionOutput = z.object({ signals: z.array(ExtractedSignal) });
export type SignalExtractionOutput = z.infer<typeof SignalExtractionOutput>;

export const extractSignals = defineOperation<
  { profile: DiscoveryProfile; evidence: EvidenceForAgent[] },
  SignalExtractionOutput
>({
  name: 'extractSignals',
  description: 'Turn evidence into structured candidate signals with provenance.',
  output: SignalExtractionOutput,
  effort: 'medium',
  buildPrompt: ({ profile, evidence }) => ({
    system: SYSTEM_BASE,
    user: `Extract structured SIGNALS from the evidence below. A signal is one observation about the world that could matter to someone deciding what to build.

Rules:
- Not every page is useful. Skip listicles, ads, generic content and anything without an actual observation. Return zero signals for useless evidence.
- Each signal MUST cite one or more evidence ids from the input. Group evidence that supports the same observation into one signal (deduplicate).
- "observation" = what the source says. "inference" = what you conclude; keep them separate.
- State the affected user/customer if the evidence says who.
- State uncertainty honestly (self-selected survey, single anecdote, vendor marketing, age of source).

Developer profile (for relevance only, not for inventing signals):
${profileText(profile)}

Evidence (id | title | url | snippet | discovered by query):
${evidence.map((e) => `- ${e.id} | ${e.title} | ${e.url} | ${e.snippet} | q: "${e.query}"`).join('\n')}`,
  }),
});

// ---------------- clusterSignals ----------------
export const SignalForAgent = z.object({
  id: z.string(),
  type: SignalType,
  observation: z.string(),
  inference: z.string(),
  affectedUser: z.string().nullable(),
});
export const ClusterOutput = z.object({
  clusters: z.array(
    z.object({
      label: z.string(),
      description: z.string(),
      rationale: z.string().describe('Why exactly these signals belong together.'),
      signalIds: z.array(z.string()).min(1),
    }),
  ),
});
export type ClusterOutput = z.infer<typeof ClusterOutput>;

export const clusterSignals = defineOperation<{ signals: z.infer<typeof SignalForAgent>[] }, ClusterOutput>({
  name: 'clusterSignals',
  description: 'Cluster related signals into opportunity areas with explicit rationale.',
  output: ClusterOutput,
  effort: 'medium',
  buildPrompt: ({ signals }) => ({
    system: SYSTEM_BASE,
    user: `Cluster the signals below into opportunity AREAS (not product ideas yet). A cluster groups signals that point at the same underlying problem space, user, or shift.

Rules:
- Every cluster must list the signal ids it is built from and a rationale explaining why they belong together.
- A signal may appear in at most one cluster. Leave weak or isolated signals out of clusters (do not force them in).
- Prefer fewer, well-supported clusters (ideally 2+ signals each) over many thin ones.

Signals:
${signals.map((s) => `- ${s.id} [${s.type}] user=${s.affectedUser ?? 'unknown'} | obs: ${s.observation} | inf: ${s.inference}`).join('\n')}`,
  }),
});

// ---------------- generateOpportunities ----------------
export const ClusterForAgent = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  rationale: z.string(),
  signals: z.array(
    SignalForAgent.extend({
      uncertainty: z.string(),
      evidence: z.array(
        z.object({ id: z.string(), title: z.string(), url: z.string(), snippet: z.string() }),
      ),
    }),
  ),
});
export const GeneratedOpportunity = z.object({
  clusterId: z.string().nullable(),
  title: z.string(),
  thesis: z.string(),
  problem: z.string(),
  targetUser: z.string(),
  evidenceSummary: z.string(),
  signalIds: z.array(z.string()).min(1),
  whyNow: z.string().describe('Evidence-backed timing, or "Unknown / no strong why-now evidence".'),
  currentAlternatives: z.string(),
  potentialWedge: z.string().describe('An inference. Prefix with "Inference:"'),
  monetizationNotes: z.string(),
  competitionNotes: z.string(),
  buildabilityNotes: z.string(),
  distributionNotes: z.string(),
  majorUncertainties: z.array(z.string()),
  openQuestions: z.array(z.string()),
  dimensions: OpportunityDimensions,
  seeded: z.boolean().describe("True only if this card represents the developer's own stated direction."),
});
export const OpportunityOutput = z.object({ opportunities: z.array(GeneratedOpportunity) });
export type OpportunityOutput = z.infer<typeof OpportunityOutput>;

export const generateOpportunities = defineOperation<
  { profile: DiscoveryProfile; clusters: z.infer<typeof ClusterForAgent>[] },
  OpportunityOutput
>({
  name: 'generateOpportunities',
  description: 'Generate evidence-backed opportunity hypotheses from clusters.',
  output: OpportunityOutput,
  effort: 'high',
  buildPrompt: ({ profile, clusters }) => ({
    system: SYSTEM_BASE,
    user: `Generate OPPORTUNITY HYPOTHESES from the clusters below. Produce roughly 3–10 cards depending on evidence quality. Do NOT fill a quota: if only two clusters are well supported, return two cards. Every card must cite signal ids from its cluster.

For each card:
- thesis: one line.
- problem / targetUser / evidenceSummary: grounded in the cited signals.
- whyNow: only if the evidence supports timing; otherwise write "Unknown / no strong why-now evidence".
- currentAlternatives: substitutes actually mentioned in the evidence (name them) or "none found in evidence".
- potentialWedge: your inference, prefixed "Inference:".
- dimensions: evidenceStrength (strong/medium/weak), competition (low/medium/high/unknown), buildability (easy/moderate/hard/unknown), monetizationEvidence (strong/medium/weak/unknown), distributionAccessibility (strong/medium/weak/unknown), developerFit (high/medium/low/unspecified — 'unspecified' when the profile gives nothing to judge by).
- openQuestions: what must be learned before deciding to build.
${profile.directionSeed ? `\nThe developer stated a direction: "${profile.directionSeed}". If the evidence supports it, include ONE card for that direction with seeded=true (still cite signals). If the evidence does not support it, do not fabricate a card; the absence is informative.\n` : ''}
Developer profile:
${profileText(profile)}

Clusters:
${clusters
  .map(
    (c) =>
      `## Cluster ${c.id}: ${c.label}\n${c.description}\nRationale: ${c.rationale}\nSignals:\n${c.signals
        .map(
          (s) =>
            `  - ${s.id} [${s.type}] obs: ${s.observation} | inf: ${s.inference} | uncertainty: ${s.uncertainty}\n    evidence: ${s.evidence.map((e) => `${e.id} "${e.title}" (${e.url})`).join('; ')}`,
        )
        .join('\n')}`,
  )
  .join('\n\n')}`,
  }),
});

// ---------------- planInvestigation ----------------
export const OpportunityForAgent = z.object({
  id: z.string(),
  title: z.string(),
  thesis: z.string(),
  problem: z.string(),
  targetUser: z.string(),
  evidenceSummary: z.string(),
  whyNow: z.string(),
  currentAlternatives: z.string(),
  potentialWedge: z.string(),
  openQuestions: z.array(z.string()),
  majorUncertainties: z.array(z.string()),
});
export type OpportunityForAgent = z.infer<typeof OpportunityForAgent>;

export const InvestigationPlanOutput = z.object({
  queries: z.array(z.object({ query: z.string(), purpose: z.string() })).min(1),
});
export type InvestigationPlanOutput = z.infer<typeof InvestigationPlanOutput>;

export const planInvestigation = defineOperation<
  { opportunity: OpportunityForAgent; kind: 'comparative' | 'deep'; maxQueries: number },
  InvestigationPlanOutput
>({
  name: 'planInvestigation',
  description: 'Plan targeted searches to investigate one opportunity.',
  output: InvestigationPlanOutput,
  effort: 'medium',
  buildPrompt: ({ opportunity, kind, maxQueries }) => ({
    system: SYSTEM_BASE,
    user: `Plan at most ${maxQueries} web searches to ${kind === 'comparative' ? 'quickly assess' : 'deeply investigate'} this opportunity.
Cover, as relevant: strength of problem evidence, target user, named alternatives/competitors, pricing of alternatives, monetization evidence, distribution channels, technical feasibility, constraints, and the biggest unknown.
Each query should hunt for concrete pages (competitor pricing, reviews, issue trackers, forum complaints, docs).

Opportunity:
${JSON.stringify(opportunity, null, 2)}`,
  }),
});

// ---------------- compareOpportunities ----------------
export const AgentFinding = z.object({
  key: z.string().describe('Short unique key, e.g. F1, F2.'),
  section: z.string(),
  claim: z.string(),
  kind: FindingKind,
  supportStrength: SupportStrength,
  evidenceIds: z.array(z.string()),
});
export const ComparisonOutput = z.object({
  findings: z.array(AgentFinding),
  rows: z.array(
    z.object({
      opportunityId: z.string(),
      problemEvidenceStrength: EvidenceStrength,
      targetUser: z.string(),
      alternatives: z.string(),
      marketCrowding: CompetitionLevel,
      monetizationEvidence: MonetizationEvidence,
      distributionAccessibility: DistributionAccessibility,
      technicalFeasibility: Buildability,
      majorConstraints: z.string(),
      biggestUnknown: z.string(),
      findingKeys: z.array(z.string()),
    }),
  ),
  summary: z.string(),
});
export type ComparisonOutput = z.infer<typeof ComparisonOutput>;

export const compareOpportunities = defineOperation<
  { candidates: Array<{ opportunity: OpportunityForAgent; evidence: EvidenceForAgent[] }> },
  ComparisonOutput
>({
  name: 'compareOpportunities',
  description: 'Side-by-side comparison of 2–3 opportunities from evidence.',
  output: ComparisonOutput,
  effort: 'high',
  buildPrompt: ({ candidates }) => ({
    system: SYSTEM_BASE,
    user: `Compare these opportunities side by side using ONLY the evidence provided. First list findings (sourced_fact with evidence ids, or inference with empty evidenceIds). Then fill one row per opportunity referencing finding keys. Finish with a short neutral summary (do not pick a winner; state trade-offs).

${candidates
  .map(
    (c) =>
      `## Opportunity ${c.opportunity.id}: ${c.opportunity.title}\n${JSON.stringify(c.opportunity, null, 2)}\nEvidence:\n${c.evidence.map((e) => `- ${e.id} | ${e.title} | ${e.url} | ${e.snippet}`).join('\n')}`,
  )
  .join('\n\n')}`,
  }),
});

// ---------------- synthesizeBrief ----------------
export const BRIEF_SECTIONS: Array<{ key: string; title: string }> = [
  { key: 'executive_summary', title: 'Executive summary' },
  { key: 'problem', title: 'Problem' },
  { key: 'target_users', title: 'Target users' },
  { key: 'alternatives', title: 'Current alternatives' },
  { key: 'market', title: 'Market and competitive landscape' },
  { key: 'economics', title: 'Economics and business-model constraints' },
  { key: 'distribution', title: 'Distribution and integration environment' },
  { key: 'observations', title: 'Important observations' },
  { key: 'feasibility', title: 'Technical feasibility' },
  { key: 'gaps', title: 'Gaps and opportunities' },
  { key: 'risks', title: 'Risks' },
  { key: 'recommendation', title: 'Recommended MVP or next investigation' },
];

export const BriefOutput = z.object({
  findings: z.array(AgentFinding).min(1),
  sections: z.array(
    z.object({
      key: z.string(),
      body: z.string().describe('Markdown. Cite findings inline as [F:<key>].'),
      findingKeys: z.array(z.string()),
    }),
  ),
});
export type BriefOutput = z.infer<typeof BriefOutput>;

export const synthesizeBrief = defineOperation<
  { profile: DiscoveryProfile; opportunity: OpportunityForAgent; evidence: EvidenceForAgent[] },
  BriefOutput
>({
  name: 'synthesizeBrief',
  description: 'Synthesize a sourced Product Brief with separate findings.',
  output: BriefOutput,
  effort: 'high',
  buildPrompt: ({ profile, opportunity, evidence }) => ({
    system: SYSTEM_BASE,
    user: `Write a sourced PRODUCT BRIEF for the opportunity below.

Step 1 — findings: list every factual claim you will rely on as a finding with kind=sourced_fact and the evidence ids that support it, plus the inferences you make as kind=inference (evidenceIds may be empty for inferences). Give each a short key (F1, F2, ...). Set supportStrength honestly.
Step 2 — sections: write these sections (use exactly these keys): ${BRIEF_SECTIONS.map((s) => s.key).join(', ')}.
Each section body is Markdown and must cite findings inline as [F:key]. Do not state facts that are not findings. The "sources" section is rendered automatically from evidence — do not write it.

Developer profile:
${profileText(profile)}

Opportunity:
${JSON.stringify(opportunity, null, 2)}

Evidence:
${evidence.map((e) => `- ${e.id} | ${e.title} | ${e.url} | ${e.snippet} | q: "${e.query}"`).join('\n')}`,
  }),
});

// ---------------- recommendDecision ----------------
export const FindingForAgent = z.object({
  id: z.string(),
  section: z.string(),
  claim: z.string(),
  kind: FindingKind,
  supportStrength: SupportStrength,
});
export const RecommendationOutput = z.object({
  recommendation: DecisionKind,
  why: z.string(),
  targetUser: z.string(),
  problem: z.string(),
  proposedWedge: z.string(),
  whyNow: z.string(),
  existingAlternatives: z.string(),
  distributionHypothesis: z.string(),
  monetizationHypothesis: z.string(),
  criticalAssumptions: z.array(
    z.object({
      statement: z.string(),
      supportingFindingIds: z.array(z.string()),
      evidenceAgainstFindingIds: z.array(z.string()),
      status: z.enum(['supported', 'contested', 'unknown']),
    }),
  ),
  unknowns: z.array(z.string()),
  whatWouldChangeTheDecision: z.array(z.string()),
  supportingFindingIds: z.array(z.string()),
});
export type RecommendationOutput = z.infer<typeof RecommendationOutput>;

export const recommendDecision = defineOperation<
  {
    opportunity: OpportunityForAgent;
    findings: z.infer<typeof FindingForAgent>[];
    briefSections: Array<{ key: string; body: string }>;
  },
  RecommendationOutput
>({
  name: 'recommendDecision',
  description: 'Recommend BUILD / INVESTIGATE_FURTHER / PIVOT / REJECT with assumptions.',
  output: RecommendationOutput,
  effort: 'high',
  buildPrompt: ({ opportunity, findings, briefSections }) => ({
    system: SYSTEM_BASE,
    user: `Produce a DECISION RECOMMENDATION for the opportunity. You recommend; a human will decide separately.
Options: BUILD, INVESTIGATE_FURTHER, PIVOT, REJECT.
Every critical assumption must reference finding ids for support and (where present) for evidence against. Use status 'unknown' when no finding speaks to it. Be explicit about what would change the decision.

Opportunity:
${JSON.stringify(opportunity, null, 2)}

Findings:
${findings.map((f) => `- ${f.id} [${f.kind}/${f.supportStrength}] (${f.section}) ${f.claim}`).join('\n')}

Brief sections:
${briefSections.map((s) => `### ${s.key}\n${s.body}`).join('\n\n')}`,
  }),
});

// ---------------- generateBuildPackage ----------------
export const BuildPackageOutput = z.object({
  productDefinition: z.string(),
  targetUser: z.string(),
  problem: z.string(),
  valueProposition: z.string(),
  evidenceBackedRationale: z.string(),
  mvpScope: z.array(z.string()),
  nonGoals: z.array(z.string()),
  userFlows: z.array(z.string()),
  requirements: z.array(
    z.object({
      text: z.string(),
      priority: z.enum(['must', 'should', 'could']),
      assumptionIds: z.array(z.string()),
      findingIds: z.array(z.string()),
    }),
  ),
  architectureProposal: z.string().describe('Clearly a proposal, not market evidence.'),
  interfaces: z.array(z.string()),
  dataModel: z.array(z.string()),
  milestones: z.array(z.object({ title: z.string(), description: z.string() })),
  acceptanceCriteria: z.array(z.string()),
  risks: z.array(z.object({ kind: z.enum(['product', 'engineering']), text: z.string() })),
  openQuestions: z.array(z.string()),
  validationPlan: z.array(z.string()),
  evidenceBackedAssumptions: z.array(z.string()),
});
export type BuildPackageOutput = z.infer<typeof BuildPackageOutput>;

export const generateBuildPackage = defineOperation<
  {
    opportunity: OpportunityForAgent;
    decision: { kind: DecisionKind; rationale: string | null; pivotDirection: string | null };
    assumptions: Assumption[];
    findings: z.infer<typeof FindingForAgent>[];
    briefSections: Array<{ key: string; body: string }>;
    profile: DiscoveryProfile;
  },
  BuildPackageOutput
>({
  name: 'generateBuildPackage',
  description: 'Generate a structured Build Package with requirements traced to assumptions/findings.',
  output: BuildPackageOutput,
  effort: 'high',
  buildPrompt: ({ opportunity, decision, assumptions, findings, briefSections, profile }) => ({
    system: SYSTEM_BASE,
    user: `Generate a BUILD PACKAGE: enough product context for a coding agent (Claude Code, Codex, ...) to begin implementation. The human decided: ${decision.kind}${decision.pivotDirection ? ` with pivot direction: ${decision.pivotDirection}` : ''}.${decision.rationale ? ` Rationale: ${decision.rationale}` : ''}

Rules:
- Requirements are numbered by the system; give each a priority and link assumption ids and finding ids that motivate it (empty arrays if none, but most should link).
- MVP scope small; non-goals explicit.
- architectureProposal is a proposal — label it as such in the text.
- Acceptance criteria must be testable.
- validationPlan: what must be learned after something exists.

Developer profile:
${profileText(profile)}

Opportunity:
${JSON.stringify(opportunity, null, 2)}

Critical assumptions (ids are stable — reference them):
${assumptions.map((a) => `- ${a.id} [${a.status}] ${a.statement}`).join('\n')}

Findings:
${findings.map((f) => `- ${f.id} [${f.kind}/${f.supportStrength}] (${f.section}) ${f.claim}`).join('\n')}

Brief sections:
${briefSections.map((s) => `### ${s.key}\n${s.body}`).join('\n\n')}`,
  }),
});

// ---------------- planValidation / reviewValidation ----------------
export const planValidation = defineOperation<
  { opportunity: OpportunityForAgent; assumptions: Assumption[]; maxQueries: number },
  InvestigationPlanOutput
>({
  name: 'planValidation',
  description: 'Plan bounded searches to re-check assumptions and competition.',
  output: InvestigationPlanOutput,
  effort: 'low',
  buildPrompt: ({ opportunity, assumptions, maxQueries }) => ({
    system: SYSTEM_BASE,
    user: `Plan at most ${maxQueries} web searches to RE-CHECK this opportunity after something was built: new competitors, pricing changes, platform changes, and whether each critical assumption still holds.

Opportunity: ${opportunity.title} — ${opportunity.thesis}
Assumptions:
${assumptions.map((a) => `- ${a.id}: ${a.statement}`).join('\n')}`,
  }),
});

export const ValidationReviewOutput = z.object({
  findings: z.array(AgentFinding),
  assumptionStatus: z.array(
    z.object({
      assumptionId: z.string(),
      status: z.enum(['still_true', 'weakened', 'contradicted', 'unknown']),
      note: z.string(),
    }),
  ),
  externalChanges: z.array(z.string()),
  verdict: ValidationVerdict,
  rationale: z.string(),
});
export type ValidationReviewOutput = z.infer<typeof ValidationReviewOutput>;

export const reviewValidation = defineOperation<
  {
    opportunity: OpportunityForAgent;
    assumptions: Assumption[];
    originalEvidence: EvidenceForAgent[];
    newEvidence: EvidenceForAgent[];
    whatWeBuilt: string;
    implementationLessons: string;
  },
  ValidationReviewOutput
>({
  name: 'reviewValidation',
  description: 'Compare original beliefs with fresh evidence and recommend CONTINUE/CHANGE_WEDGE/PIVOT/STOP.',
  output: ValidationReviewOutput,
  effort: 'high',
  buildPrompt: (i) => ({
    system: SYSTEM_BASE,
    user: `Review this opportunity after implementation. Compare what we originally believed with NEW evidence. For each assumption say still_true / weakened / contradicted / unknown with a note. List external changes. Recommend CONTINUE, CHANGE_WEDGE, PIVOT or STOP with rationale. Findings cite NEW evidence ids only.

Opportunity: ${i.opportunity.title} — ${i.opportunity.thesis}
What we built: ${i.whatWeBuilt || '(not described)'}
Implementation lessons: ${i.implementationLessons || '(none recorded)'}

Original assumptions:
${i.assumptions.map((a) => `- ${a.id}: ${a.statement}`).join('\n')}

Original evidence (for reference):
${i.originalEvidence.map((e) => `- ${e.id} | ${e.title} | ${e.url}`).join('\n')}

NEW evidence:
${i.newEvidence.map((e) => `- ${e.id} | ${e.title} | ${e.url} | ${e.snippet}`).join('\n')}`,
  }),
});
