/**
 * Domain model for the dev-app research workflow.
 *
 * Lineage preserved end to end:
 *   Source evidence → Observed signal → Opportunity hypothesis → Product research (findings)
 *   → Product decision → Requirement → Build package → Later validation
 *
 * Every schema here is provider-agnostic: nothing in this file knows about Jevlin or Claude.
 */
import { z } from 'zod';

// ---------- Primitive enums ----------

export const WorkflowStage = z.enum([
  'DISCOVERY_SETUP',
  'DISCOVERING',
  'OPPORTUNITIES_READY',
  'COMPARING',
  'INVESTIGATING',
  'DECISION_READY',
  'DECIDED',
  'BUILD_PACKAGE_READY',
  'VALIDATING',
]);
export type WorkflowStage = z.infer<typeof WorkflowStage>;

export const EvidenceStrength = z.enum(['strong', 'medium', 'weak']);
export const CompetitionLevel = z.enum(['low', 'medium', 'high', 'unknown']);
export const Buildability = z.enum(['easy', 'moderate', 'hard', 'unknown']);
export const MonetizationEvidence = z.enum(['strong', 'medium', 'weak', 'unknown']);
export const DistributionAccessibility = z.enum(['strong', 'medium', 'weak', 'unknown']);
export const DeveloperFit = z.enum(['high', 'medium', 'low', 'unspecified']);

export const OpportunityDimensions = z.object({
  evidenceStrength: EvidenceStrength,
  competition: CompetitionLevel,
  buildability: Buildability,
  monetizationEvidence: MonetizationEvidence,
  distributionAccessibility: DistributionAccessibility,
  developerFit: DeveloperFit,
});
export type OpportunityDimensions = z.infer<typeof OpportunityDimensions>;

export const SignalType = z.enum([
  'repeated_pain',
  'workaround_manual_process',
  'expensive_incumbent',
  'dissatisfaction',
  'missing_feature',
  'ecosystem_growth',
  'technical_capability_change',
  'platform_api_change',
  'pricing_change',
  'product_shutdown_deprecation',
  'regulatory_policy_change',
  'underserved_niche',
  'distribution_opportunity',
  'monetization_evidence',
  'adoption_evidence',
  'competitor_movement',
  'other',
]);
export type SignalType = z.infer<typeof SignalType>;

export const QueryFamily = z.enum([
  'pain_workaround',
  'market_movement',
  'technical_change',
  'ecosystem_gap',
  'economic_distribution',
  'constraint_change',
  'direction_seed',
  'investigation',
  'validation',
]);
export type QueryFamily = z.infer<typeof QueryFamily>;

export const DecisionKind = z.enum(['BUILD', 'INVESTIGATE_FURTHER', 'PIVOT', 'REJECT']);
export type DecisionKind = z.infer<typeof DecisionKind>;

export const ValidationVerdict = z.enum(['CONTINUE', 'CHANGE_WEDGE', 'PIVOT', 'STOP']);
export type ValidationVerdict = z.infer<typeof ValidationVerdict>;

export const SupportStrength = z.enum(['strong', 'medium', 'weak']);
export const FindingKind = z.enum(['sourced_fact', 'inference']);

export const OpportunityStatus = z.enum([
  'candidate',
  'interesting',
  'hidden',
  'rejected',
  'comparing',
  'selected',
]);
export type OpportunityStatus = z.infer<typeof OpportunityStatus>;

export const ProviderMode = z.enum(['demo', 'real']);
export type ProviderMode = z.infer<typeof ProviderMode>;

// ---------- Discovery profile ----------

export const DiscoveryProfile = z.object({
  areas: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
  teamSize: z.enum(['solo', '2-5', '6+', 'unspecified']).default('unspecified'),
  timeToMvp: z.enum(['days', 'weeks', 'months', 'flexible']).default('flexible'),
  resources: z.enum(['low', 'moderate', 'flexible']).default('flexible'),
  customerType: z.enum(['developers', 'businesses', 'consumers', 'any']).default('any'),
  businessModel: z.string().optional(),
  geography: z.string().optional(),
  avoid: z.array(z.string()).default([]),
  constraints: z.string().optional(),
  /** Set when the developer arrives with a direction ("I already have a direction"). */
  directionSeed: z.string().optional(),
});
export type DiscoveryProfile = z.infer<typeof DiscoveryProfile>;

export const emptyProfile = (): DiscoveryProfile => DiscoveryProfile.parse({});

// ---------- Project ----------

export const Project = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  stage: WorkflowStage,
  mode: ProviderMode,
  discoveryProfile: DiscoveryProfile,
  selectedOpportunityId: z.string().nullable(),
  decisionStatus: z.enum(['none', 'recommended', 'decided']),
});
export type Project = z.infer<typeof Project>;

// ---------- Research runs / queries / evidence ----------

export const RunKind = z.enum(['discovery', 'comparison', 'investigation', 'validation']);
export type RunKind = z.infer<typeof RunKind>;

export const RunStatus = z.enum(['queued', 'running', 'completed', 'failed', 'partial']);
export type RunStatus = z.infer<typeof RunStatus>;

export const RunStageLabel = z.enum([
  'planning',
  'searching',
  'extracting_signals',
  'clustering',
  'building_opportunities',
  'comparing',
  'synthesizing',
  'recommending',
  'packaging',
  'reviewing',
  'done',
]);
export type RunStageLabel = z.infer<typeof RunStageLabel>;

export const ResearchBudget = z.object({
  maxQueries: z.number().int().positive(),
  maxResultsPerQuery: z.number().int().positive(),
});
export type ResearchBudget = z.infer<typeof ResearchBudget>;

export const ResearchRun = z.object({
  id: z.string(),
  projectId: z.string(),
  kind: RunKind,
  targetIds: z.array(z.string()),
  status: RunStatus,
  stage: RunStageLabel,
  budget: ResearchBudget,
  searchProvider: z.string(),
  agentProvider: z.string(),
  progress: z.object({
    queriesPlanned: z.number().int().default(0),
    queriesCompleted: z.number().int().default(0),
    queriesFailed: z.number().int().default(0),
    evidenceCount: z.number().int().default(0),
    signalCount: z.number().int().default(0),
    message: z.string().optional(),
  }),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ResearchRun = z.infer<typeof ResearchRun>;

export const ResearchQuery = z.object({
  id: z.string(),
  projectId: z.string(),
  runId: z.string(),
  query: z.string(),
  family: QueryFamily,
  purpose: z.string(),
  provider: z.string(),
  status: z.enum(['planned', 'running', 'completed', 'failed']),
  executedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  resultCount: z.number().nullable(),
  rawResponseId: z.string().nullable(),
  error: z.string().nullable(),
});
export type ResearchQuery = z.infer<typeof ResearchQuery>;

export const Evidence = z.object({
  id: z.string(),
  projectId: z.string(),
  queryId: z.string(),
  url: z.string(),
  title: z.string(),
  snippet: z.string(),
  position: z.number().nullable(),
  providerMeta: z.record(z.string(), z.unknown()).nullable(),
  provider: z.string(),
  retrievedAt: z.string(),
  fullText: z.string().nullable(),
  isDemo: z.boolean(),
});
export type Evidence = z.infer<typeof Evidence>;

// ---------- Signals, clusters, opportunities ----------

export const Signal = z.object({
  id: z.string(),
  projectId: z.string(),
  runId: z.string(),
  type: SignalType,
  /** What the source actually says. */
  observation: z.string(),
  /** What the agent inferred from it (may be empty). */
  inference: z.string(),
  affectedUser: z.string().nullable(),
  uncertainty: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  evidenceIds: z.array(z.string()).min(1),
  createdAt: z.string(),
});
export type Signal = z.infer<typeof Signal>;

export const SignalCluster = z.object({
  id: z.string(),
  projectId: z.string(),
  runId: z.string(),
  label: z.string(),
  description: z.string(),
  /** Why these signals belong together — explanation the agent must supply. */
  rationale: z.string(),
  signalIds: z.array(z.string()).min(1),
  createdAt: z.string(),
});
export type SignalCluster = z.infer<typeof SignalCluster>;

export const Opportunity = z.object({
  id: z.string(),
  projectId: z.string(),
  runId: z.string(),
  clusterId: z.string().nullable(),
  title: z.string(),
  thesis: z.string(),
  problem: z.string(),
  targetUser: z.string(),
  evidenceSummary: z.string(),
  signalIds: z.array(z.string()).min(1),
  whyNow: z.string(),
  currentAlternatives: z.string(),
  /** Explicitly an inference. */
  potentialWedge: z.string(),
  monetizationNotes: z.string(),
  competitionNotes: z.string(),
  buildabilityNotes: z.string(),
  distributionNotes: z.string(),
  majorUncertainties: z.array(z.string()),
  openQuestions: z.array(z.string()),
  dimensions: OpportunityDimensions,
  status: OpportunityStatus,
  /** Set when the developer brought their own direction instead of discovering. */
  seeded: z.boolean(),
  createdAt: z.string(),
});
export type Opportunity = z.infer<typeof Opportunity>;

// ---------- Investigation ----------

export const InvestigationKind = z.enum(['comparative', 'deep']);

export const ComparisonRow = z.object({
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
  findingIds: z.array(z.string()).default([]),
});
export type ComparisonRow = z.infer<typeof ComparisonRow>;

export const Investigation = z.object({
  id: z.string(),
  projectId: z.string(),
  runId: z.string().nullable(),
  kind: InvestigationKind,
  opportunityIds: z.array(z.string()).min(1),
  status: RunStatus,
  comparison: z.array(ComparisonRow).nullable(),
  comparisonSummary: z.string().nullable(),
  createdAt: z.string(),
});
export type Investigation = z.infer<typeof Investigation>;

export const Finding = z.object({
  id: z.string(),
  projectId: z.string(),
  investigationId: z.string(),
  section: z.string(),
  claim: z.string(),
  kind: FindingKind,
  supportStrength: SupportStrength,
  evidenceIds: z.array(z.string()),
  createdAt: z.string(),
});
export type Finding = z.infer<typeof Finding>;

export const BriefSection = z.object({
  key: z.string(),
  title: z.string(),
  /** Markdown body; may reference findings with [F:<findingId>] markers. */
  body: z.string(),
  findingIds: z.array(z.string()).default([]),
});
export type BriefSection = z.infer<typeof BriefSection>;

export const ProductBrief = z.object({
  id: z.string(),
  projectId: z.string(),
  investigationId: z.string(),
  opportunityId: z.string(),
  version: z.number().int(),
  sections: z.array(BriefSection),
  createdAt: z.string(),
});
export type ProductBrief = z.infer<typeof ProductBrief>;

// ---------- Decision ----------

export const Assumption = z.object({
  id: z.string(),
  statement: z.string(),
  supportingFindingIds: z.array(z.string()).default([]),
  evidenceAgainstFindingIds: z.array(z.string()).default([]),
  status: z.enum(['supported', 'contested', 'unknown']).default('unknown'),
});
export type Assumption = z.infer<typeof Assumption>;

export const AgentRecommendation = z.object({
  recommendation: DecisionKind,
  why: z.string(),
  targetUser: z.string(),
  problem: z.string(),
  proposedWedge: z.string(),
  whyNow: z.string(),
  existingAlternatives: z.string(),
  distributionHypothesis: z.string(),
  monetizationHypothesis: z.string(),
  criticalAssumptions: z.array(Assumption),
  unknowns: z.array(z.string()),
  whatWouldChangeTheDecision: z.array(z.string()),
  supportingFindingIds: z.array(z.string()),
});
export type AgentRecommendation = z.infer<typeof AgentRecommendation>;

export const Decision = z.object({
  id: z.string(),
  projectId: z.string(),
  briefId: z.string(),
  opportunityId: z.string(),
  version: z.number().int(),
  agentRecommendation: AgentRecommendation,
  userDecision: DecisionKind.nullable(),
  userRationale: z.string().nullable(),
  userPivotDirection: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Decision = z.infer<typeof Decision>;

// ---------- Build package ----------

export const Requirement = z.object({
  id: z.string(),
  number: z.number().int(),
  text: z.string(),
  decisionId: z.string(),
  assumptionIds: z.array(z.string()).default([]),
  findingIds: z.array(z.string()).default([]),
  priority: z.enum(['must', 'should', 'could']).default('must'),
});
export type Requirement = z.infer<typeof Requirement>;

export const BuildPackageSections = z.object({
  productDefinition: z.string(),
  targetUser: z.string(),
  problem: z.string(),
  valueProposition: z.string(),
  evidenceBackedRationale: z.string(),
  mvpScope: z.array(z.string()),
  nonGoals: z.array(z.string()),
  userFlows: z.array(z.string()),
  architectureProposal: z.string(),
  interfaces: z.array(z.string()),
  dataModel: z.array(z.string()),
  milestones: z.array(z.object({ title: z.string(), description: z.string() })),
  acceptanceCriteria: z.array(z.string()),
  risks: z.array(z.object({ kind: z.enum(['product', 'engineering']), text: z.string() })),
  openQuestions: z.array(z.string()),
  validationPlan: z.array(z.string()),
  evidenceBackedAssumptions: z.array(z.string()),
});
export type BuildPackageSections = z.infer<typeof BuildPackageSections>;

export const BuildPackage = z.object({
  id: z.string(),
  projectId: z.string(),
  decisionId: z.string(),
  version: z.number().int(),
  sections: BuildPackageSections,
  requirements: z.array(Requirement),
  createdAt: z.string(),
});
export type BuildPackage = z.infer<typeof BuildPackage>;

// ---------- Validation review ----------

export const ValidationReview = z.object({
  id: z.string(),
  projectId: z.string(),
  buildPackageId: z.string(),
  runId: z.string().nullable(),
  version: z.number().int(),
  originalAssumptions: z.array(Assumption),
  whatWeBuilt: z.string(),
  implementationLessons: z.string(),
  newEvidenceIds: z.array(z.string()),
  assumptionStatus: z.array(
    z.object({
      assumptionId: z.string(),
      status: z.enum(['still_true', 'weakened', 'contradicted', 'unknown']),
      note: z.string(),
    }),
  ),
  externalChanges: z.array(z.string()),
  verdict: ValidationVerdict.nullable(),
  rationale: z.string(),
  status: RunStatus,
  createdAt: z.string(),
});
export type ValidationReview = z.infer<typeof ValidationReview>;

// ---------- Telemetry ----------

export const EventType = z.enum([
  'project_created',
  'discovery_started',
  'query_planned',
  'search_completed',
  'search_failed',
  'evidence_created',
  'signal_created',
  'cluster_created',
  'opportunity_created',
  'discovery_completed',
  'discovery_failed',
  'evidence_viewed',
  'opportunity_status_changed',
  'opportunity_selected',
  'investigation_started',
  'investigation_completed',
  'investigation_failed',
  'finding_created',
  'brief_created',
  'decision_recommended',
  'decision_selected',
  'build_package_created',
  'export_generated',
  'validation_started',
  'validation_completed',
  'validation_failed',
  'stage_changed',
]);
export type EventType = z.infer<typeof EventType>;

export const WorkflowEvent = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  type: EventType,
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type WorkflowEvent = z.infer<typeof WorkflowEvent>;
