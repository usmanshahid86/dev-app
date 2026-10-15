/**
 * DEMO THEMES — canned, clearly fake agent outputs used by the FixtureAgentProvider.
 * Everything here references demo pages by URL; the fixture agent resolves URLs to the evidence ids
 * it is given at runtime, so lineage (evidence → signal → opportunity → finding → requirement) is real
 * even though the content is fabricated for demonstration.
 */
import type { DemoThemeId } from './corpus';
import type { OpportunityDimensions, SignalType } from '@domain/types';

export interface DemoSignal {
  key: string;
  theme: DemoThemeId;
  /** Signals sharing a phenomenon describe the SAME underlying observation and are consolidated. */
  phenomenon: string;
  type: SignalType;
  observation: string;
  inference: string;
  affectedUser: string | null;
  uncertainty: string;
  confidence: 'high' | 'medium' | 'low';
}

export const DEMO_SIGNALS: DemoSignal[] = [
  {
    key: 'agent-context.repaste',
    phenomenon: 'agent-context.handoff',
    theme: 'agent-context',
    type: 'repeated_pain',
    observation:
      'A forum thread (140 replies) describes developers re-pasting project architecture and conventions into each new coding-agent session and maintaining a hand-written CONTEXT.md.',
    inference: 'Context handoff between coding-agent sessions is a recurring manual chore, not a one-off.',
    affectedUser: 'Developers using AI coding agents',
    uncertainty:
      'Self-selected forum population; thread size suggests breadth but not frequency per developer.',
    confidence: 'medium',
  },
  {
    key: 'agent-context.multi-tool',
    phenomenon: 'agent-context.handoff',
    theme: 'agent-context',
    type: 'workaround_manual_process',
    observation:
      'A team blog describes keeping CLAUDE.md, AGENTS.md and .cursorrules in sync by hand with a weekly diff script because they drift.',
    inference:
      'Teams using several agents duplicate the same project memory per tool and build ad-hoc sync tooling.',
    affectedUser: 'Small engineering teams using multiple AI coding tools',
    uncertainty: 'Single team anecdote.',
    confidence: 'medium',
  },
  {
    key: 'agent-context.portability',
    phenomenon: 'agent-context.handoff',
    theme: 'agent-context',
    type: 'missing_feature',
    observation:
      'A 7-month-old issue with 312 upvotes requests exporting session context so another agent can continue; the maintainer says it is not on the roadmap.',
    inference: 'Vendors are not prioritising cross-tool portability, leaving room for a neutral third party.',
    affectedUser: 'Users of that coding-agent tool',
    uncertainty: 'Upvotes are a weak demand proxy; maintainer stance may change.',
    confidence: 'medium',
  },
  {
    key: 'agent-context.standard',
    phenomenon: 'agent-context.standard',
    theme: 'agent-context',
    type: 'technical_capability_change',
    observation:
      'A working group published a draft interchange format for project memory; two vendors said they would evaluate it, none committed to shipping it.',
    inference: 'A standard may emerge, which would help a neutral tool but also commoditise the format.',
    affectedUser: 'Coding-agent vendors and their users',
    uncertainty: 'Draft only; adoption unknown.',
    confidence: 'low',
  },
  {
    key: 'agent-context.adoption',
    phenomenon: 'agent-context.adoption',
    theme: 'agent-context',
    type: 'adoption_evidence',
    observation:
      'A self-selected survey (n=4,800) reports multi-assistant usage rising from 38% to 61% YoY, with "keeping tools in sync about my project" the #2 frustration.',
    inference: 'The population that feels this pain is growing quickly.',
    affectedUser: 'Developers using AI coding assistants',
    uncertainty: 'Self-selected sample; methodology not inspected.',
    confidence: 'medium',
  },
  {
    key: 'local-first.complexity',
    phenomenon: 'local-first.complexity',
    theme: 'local-first-sync',
    type: 'repeated_pain',
    observation:
      'A 3-person app team spent four months on hand-rolled CRDT sync and still has conflict bugs; they ask what small teams actually use.',
    inference: 'Offline sync is disproportionately hard for small teams.',
    affectedUser: 'Small product teams building offline-capable apps',
    uncertainty: 'Single anecdote.',
    confidence: 'low',
  },
  {
    key: 'local-first.incumbent-pricing',
    phenomenon: 'local-first.pricing',
    theme: 'local-first-sync',
    type: 'expensive_incumbent',
    observation:
      'An incumbent managed sync platform starts its Team plan at $499/month with a very limited free tier.',
    inference: 'There may be a gap for a cheaper or self-hostable option below the incumbent floor.',
    affectedUser: 'Small teams needing realtime/offline sync',
    uncertainty: 'Pricing may change; other incumbents not checked.',
    confidence: 'medium',
  },
  {
    key: 'local-first.shutdown',
    phenomenon: 'local-first.shutdown',
    theme: 'local-first-sync',
    type: 'product_shutdown_deprecation',
    observation:
      'A hosted sync provider announced shutdown with 90 days to migrate; customers are asking for self-hostable alternatives.',
    inference: 'A displaced customer base exists right now.',
    affectedUser: 'Customers of the shutting-down sync service',
    uncertainty: 'Size of customer base unknown.',
    confidence: 'medium',
  },
  {
    key: 'local-first.capability',
    phenomenon: 'local-first.capability',
    theme: 'local-first-sync',
    type: 'technical_capability_change',
    observation:
      'A benchmark shows WASM SQLite with OPFS handling 50k-row tables with sub-10ms queries in the browser.',
    inference: 'Local-first architectures no longer need a custom storage engine.',
    affectedUser: 'Web app developers',
    uncertainty: 'Single benchmark post.',
    confidence: 'medium',
  },
  {
    key: 'billing.manual-metering',
    phenomenon: 'billing.manual',
    theme: 'usage-billing',
    type: 'workaround_manual_process',
    observation:
      'Indie SaaS founders describe cron jobs aggregating usage into spreadsheets and manually creating invoice line items, with double-charging incidents.',
    inference: 'Metered billing for small SaaS is error-prone manual work.',
    affectedUser: 'Solo and small-team SaaS founders',
    uncertainty: 'Forum anecdotes; number of founders affected unknown.',
    confidence: 'medium',
  },
  {
    key: 'billing.incumbent-pricing',
    phenomenon: 'billing.pricing',
    theme: 'usage-billing',
    type: 'expensive_incumbent',
    observation:
      'A usage-billing incumbent charges 0.8% of revenue with a $2,000/month minimum, which commenters call a non-starter under $300k ARR.',
    inference: 'Sub-$300k-ARR SaaS businesses are priced out of the incumbent.',
    affectedUser: 'Early-stage SaaS businesses',
    uncertainty: 'Only one incumbent checked.',
    confidence: 'medium',
  },
  {
    key: 'billing.api-change',
    phenomenon: 'billing.api',
    theme: 'usage-billing',
    type: 'platform_api_change',
    observation:
      'A major payments API introduced first-class meter objects and deprecated the previous usage-record endpoint with a 12-month sunset and a 40-page migration guide.',
    inference: 'A forced migration creates a window where developers will adopt new tooling.',
    affectedUser: 'Developers integrating usage billing with that payments API',
    uncertainty: 'Migration difficulty varies by integration.',
    confidence: 'high',
  },
  {
    key: 'billing.distribution',
    phenomenon: 'billing.distribution',
    theme: 'usage-billing',
    type: 'distribution_opportunity',
    observation:
      'A framework marketplace lists 214 billing/metering plugins; top ones show five-figure weekly installs and several are paid.',
    inference:
      'There is an identifiable distribution surface and evidence developers pay for billing add-ons.',
    affectedUser: 'Developers on that framework',
    uncertainty: 'Install counts may include free tiers.',
    confidence: 'medium',
  },
  {
    key: 'llm-cost.attribution',
    phenomenon: 'llm-cost.attribution',
    theme: 'llm-cost',
    type: 'repeated_pain',
    observation:
      'A 6-person startup could not attribute a tripled LLM bill to a feature; they now hand-tag calls and export logs to a spreadsheet weekly.',
    inference: 'Per-feature LLM cost attribution is missing for small teams.',
    affectedUser: 'Small startups shipping LLM features',
    uncertainty: 'Single post-mortem.',
    confidence: 'low',
  },
  {
    key: 'llm-cost.incumbent-pricing',
    phenomenon: 'llm-cost.pricing',
    theme: 'llm-cost',
    type: 'expensive_incumbent',
    observation:
      'An LLM observability vendor reportedly starts contracts at $30k/year and its free tier drops traces after 7 days.',
    inference: 'Small teams are underserved by the incumbent pricing structure.',
    affectedUser: 'Small teams',
    uncertainty: 'Reported deal sizes from a review site.',
    confidence: 'low',
  },
  {
    key: 'llm-cost.pricing-churn',
    phenomenon: 'llm-cost.churn',
    theme: 'llm-cost',
    type: 'pricing_change',
    observation:
      'Three providers cut model prices again; teams report hard-coded cost tables in dashboards are chronically stale.',
    inference: 'A maintained price catalog is itself a small recurring need.',
    affectedUser: 'Teams running LLM cost dashboards',
    uncertainty: 'Roundup article; number of affected teams unknown.',
    confidence: 'medium',
  },
  {
    key: 'compliance.cost',
    phenomenon: 'compliance.manual-evidence',
    theme: 'compliance-smb',
    type: 'expensive_incumbent',
    observation:
      'Founders of a 10-person startup report SOC 2 vendor quotes of $25k–$60k before the audit; some collect evidence manually in a shared folder.',
    inference: 'Cost pushes small startups toward manual evidence collection.',
    affectedUser: 'Startups under ~20 people',
    uncertainty: 'Quotes vary widely; sample small.',
    confidence: 'medium',
  },
  {
    key: 'compliance.buyer-pressure',
    phenomenon: 'compliance.pressure',
    theme: 'compliance-smb',
    type: 'regulatory_policy_change',
    observation:
      'A procurement survey reports 72% of enterprise buyers now require SOC 2 or equivalent from vendors under 50 employees, up from 44%.',
    inference: 'Demand for compliance is being pushed onto ever-smaller vendors.',
    affectedUser: 'Small vendors selling to enterprises',
    uncertainty: 'Survey methodology not inspected.',
    confidence: 'medium',
  },
  {
    key: 'compliance.automation-gap',
    phenomenon: 'compliance.manual-evidence',
    theme: 'compliance-smb',
    type: 'missing_feature',
    observation:
      'Users of an open-source compliance toolkit request automated evidence from CI/CD and cloud APIs instead of monthly screenshot rituals.',
    inference: 'Evidence automation hooked into developer tooling is a gap.',
    affectedUser: 'Engineering teams doing compliance',
    uncertainty: 'Single issue thread.',
    confidence: 'low',
  },
  {
    key: 'webhook.reliability-pain',
    phenomenon: 'webhook.pain',
    theme: 'webhook-reliability',
    type: 'repeated_pain',
    observation:
      'An incident write-up describes webhooks silently dropped for 3 hours with no replay or dead-letter queue; retries are hand-rolled per service.',
    inference: 'Outbound webhook reliability is still hand-built in small API companies.',
    affectedUser: 'Small API companies',
    uncertainty: 'Single incident.',
    confidence: 'low',
  },
  {
    key: 'webhook.incumbent-strong',
    phenomenon: 'webhook.incumbent',
    theme: 'webhook-reliability',
    type: 'competitor_movement',
    observation:
      'A managed webhook delivery service has a generous free tier and is described as well-regarded and widely adopted.',
    inference: 'The category already has a strong, affordable incumbent.',
    affectedUser: 'API companies',
    uncertainty: 'Adoption claims from commenters.',
    confidence: 'medium',
  },
];

export interface DemoOpportunityTemplate {
  theme: DemoThemeId;
  minSignals: number;
  title: string;
  thesis: string;
  problem: string;
  targetUser: string;
  evidenceSummary: string;
  whyNow: string;
  currentAlternatives: string;
  potentialWedge: string;
  monetizationNotes: string;
  competitionNotes: string;
  buildabilityNotes: string;
  distributionNotes: string;
  majorUncertainties: string[];
  openQuestions: string[];
  dimensions: OpportunityDimensions;
  clusterLabel: string;
  clusterDescription: string;
  clusterRationale: string;
}

export const DEMO_OPPORTUNITIES: DemoOpportunityTemplate[] = [
  {
    theme: 'agent-context',
    minSignals: 2,
    clusterLabel: 'Cross-agent project context / memory',
    clusterDescription:
      'Developers using several AI coding agents repeatedly re-establish project context by hand.',
    clusterRationale:
      'The re-paste complaints, the multi-file sync workaround, the portability feature request and the survey all describe the same handoff problem from different angles; the draft standard is the technical-change counterpart.',
    title: 'Portable project memory for AI coding agents',
    thesis:
      'A neutral, tool-agnostic project memory that every coding agent can read and write, so context survives tool switches.',
    problem:
      'Developers using multiple coding agents re-explain their project to each tool and hand-sync several memory files that drift.',
    targetUser: 'Developers and small teams using two or more AI coding assistants weekly.',
    evidenceSummary:
      'A large forum thread, a team write-up, a 312-upvote feature request, a survey showing multi-tool use at 61%, and a draft interchange spec.',
    whyNow:
      'Multi-tool usage rose sharply year over year and a draft interchange format exists but no vendor has shipped it.',
    currentAlternatives:
      'Hand-maintained CLAUDE.md / AGENTS.md / .cursorrules files, custom diff scripts, community export scripts.',
    potentialWedge:
      'Inference: a CLI that generates and syncs the per-tool memory files from one canonical source, before attempting a richer shared memory.',
    monetizationNotes:
      'No direct payment evidence in discovery; team-sync and hosted features are plausible but unproven.',
    competitionNotes:
      'Vendors own their own memory formats; no neutral cross-tool product observed in evidence.',
    buildabilityNotes: 'File generation and sync is easy; richer semantic memory is hard.',
    distributionNotes: 'Developer communities and the issue thread itself; strong word-of-mouth surface.',
    majorUncertainties: [
      'Whether vendors ship the draft standard themselves',
      'Willingness to pay for a dev-tool utility',
    ],
    openQuestions: [
      'How many developers actively switch agents mid-project?',
      'Would teams pay, or only individuals?',
    ],
    dimensions: {
      evidenceStrength: 'strong',
      competition: 'low',
      buildability: 'moderate',
      monetizationEvidence: 'weak',
      distributionAccessibility: 'strong',
      developerFit: 'unspecified',
    },
  },
  {
    theme: 'usage-billing',
    minSignals: 2,
    clusterLabel: 'Usage-based billing for small SaaS',
    clusterDescription:
      'Small SaaS businesses do metered billing by hand because incumbents price them out, while a platform API change forces a migration.',
    clusterRationale:
      'Manual metering workarounds, incumbent minimum pricing, the payments-API deprecation and the marketplace listing all concern the same buyer (early-stage SaaS) and job (metering + invoicing).',
    title: 'Metered billing toolkit for sub-$300k ARR SaaS',
    thesis:
      'A lightweight, self-serve metering and invoicing layer for SaaS businesses too small for enterprise billing platforms.',
    problem:
      'Indie SaaS founders aggregate usage in spreadsheets and hand-create invoice line items, causing double-charging; incumbents require $2k/month minimums.',
    targetUser: 'Solo and small-team SaaS founders with usage-based pricing.',
    evidenceSummary:
      'Forum workarounds, an incumbent pricing page with a $2,000/month minimum, a payments-API meter migration with a 12-month sunset, and a marketplace category with paid plugins.',
    whyNow: 'A payments-API deprecation forces every integration to be rewritten within 12 months.',
    currentAlternatives:
      'Spreadsheets plus cron jobs; enterprise billing platforms (0.8% of revenue, $2k/month minimum); marketplace plugins.',
    potentialWedge:
      'Inference: a migration-focused plugin for the new meter objects that also handles invoice generation.',
    monetizationNotes: 'Paid plugins with five-figure installs exist in the marketplace category.',
    competitionNotes:
      '214 plugins in the category; crowded at the low end, but the migration moment resets the field.',
    buildabilityNotes:
      'Well-understood domain; correctness (idempotency, double-charge prevention) is the hard part.',
    distributionNotes: 'A framework marketplace with high install counts is a direct channel.',
    majorUncertainties: ['Whether the marketplace incumbents adapt quickly to the API change'],
    openQuestions: ['What share of plugins are already migrating?', 'What price point do founders accept?'],
    dimensions: {
      evidenceStrength: 'strong',
      competition: 'high',
      buildability: 'moderate',
      monetizationEvidence: 'strong',
      distributionAccessibility: 'strong',
      developerFit: 'unspecified',
    },
  },
  {
    theme: 'local-first-sync',
    minSignals: 2,
    clusterLabel: 'Affordable local-first sync for small teams',
    clusterDescription:
      'Small teams struggle to build offline sync, incumbents are expensive, one provider is shutting down, and browser SQLite makes local-first practical.',
    clusterRationale:
      'The CRDT complexity complaint, incumbent pricing, the shutdown notice and the WASM SQLite capability all point at the same job (sync for small apps) and the same moment.',
    title: 'Self-hostable sync backend for local-first apps',
    thesis:
      'A simple sync layer on top of SQLite that small teams can self-host, priced far below incumbents.',
    problem:
      'Small teams spend months on sync and still ship conflict bugs; managed alternatives start at $499/month.',
    targetUser: 'Small product teams building offline-capable web or mobile apps.',
    evidenceSummary:
      'One complexity anecdote, an incumbent pricing page, a shutdown notice with displaced customers, and a browser-SQLite benchmark.',
    whyNow:
      'A hosted sync provider is shutting down with 90 days to migrate, and WASM SQLite removes the need for a custom engine.',
    currentAlternatives:
      'Hand-rolled CRDTs; managed sync platforms from $499/month; the shutting-down provider.',
    potentialWedge: "Inference: a migration target for the shutting-down provider's customers.",
    monetizationNotes:
      'Incumbent pricing shows willingness to pay at the high end; low-end willingness unknown.',
    competitionNotes:
      'Several open-source sync projects likely exist but were not surfaced in discovery evidence.',
    buildabilityNotes: 'Hard: conflict resolution correctness is the core risk.',
    distributionNotes: 'The shutdown thread is a concrete, time-limited channel.',
    majorUncertainties: [
      'Open-source competition not yet surveyed',
      'Engineering difficulty of correct sync',
    ],
    openQuestions: [
      'Which open-source sync engines already cover this?',
      'How many customers does the shutting-down provider have?',
    ],
    dimensions: {
      evidenceStrength: 'medium',
      competition: 'unknown',
      buildability: 'hard',
      monetizationEvidence: 'medium',
      distributionAccessibility: 'medium',
      developerFit: 'unspecified',
    },
  },
  {
    theme: 'llm-cost',
    minSignals: 2,
    clusterLabel: 'LLM cost attribution for small teams',
    clusterDescription:
      'Small teams cannot attribute LLM spend per feature and incumbents are priced for enterprises.',
    clusterRationale:
      'The attribution post-mortem, incumbent pricing and provider price churn all concern tracking LLM spend on small teams.',
    title: 'Per-feature LLM spend tracking for small startups',
    thesis:
      'A lightweight SDK plus dashboard that attributes token spend to product features, with an always-current price catalog.',
    problem:
      'Teams hand-tag LLM calls and export to spreadsheets; dashboards hard-code stale prices; incumbents start at $30k/year.',
    targetUser: 'Startups under ~20 people shipping LLM features.',
    evidenceSummary: 'One post-mortem, one reported pricing data point, one pricing-churn roundup.',
    whyNow: 'Unknown / no strong why-now evidence beyond ongoing price churn.',
    currentAlternatives: 'Spreadsheets; enterprise LLM observability vendors; provider dashboards.',
    potentialWedge: 'Inference: a maintained open price catalog as the free top-of-funnel.',
    monetizationNotes: 'Weak: only enterprise-tier pricing observed; small-team willingness to pay unknown.',
    competitionNotes: 'Likely crowded with open-source tracers; not surfaced in discovery evidence.',
    buildabilityNotes: 'Easy to moderate.',
    distributionNotes: 'Unknown.',
    majorUncertainties: ['Thin evidence overall', 'Crowded open-source space'],
    openQuestions: [
      'Do small teams pay for observability at all?',
      'Which open-source tracers already do attribution?',
    ],
    dimensions: {
      evidenceStrength: 'weak',
      competition: 'unknown',
      buildability: 'easy',
      monetizationEvidence: 'weak',
      distributionAccessibility: 'unknown',
      developerFit: 'unspecified',
    },
  },
  {
    theme: 'compliance-smb',
    minSignals: 2,
    clusterLabel: 'Developer-native compliance evidence for small vendors',
    clusterDescription:
      'Enterprise buyers push SOC 2 onto tiny vendors who cannot afford compliance platforms and want evidence collected from CI rather than screenshots.',
    clusterRationale:
      'Cost quotes, buyer-pressure survey and the CI-evidence feature request describe the same constraint change hitting the same small vendors.',
    title: 'CI-driven compliance evidence collection for small vendors',
    thesis:
      'Collect SOC 2 evidence automatically from CI/CD and cloud APIs for startups that cannot justify $25k+ platforms.',
    problem:
      'Startups under 20 people get $25k–$60k quotes and fall back to manual screenshot rituals while buyers increasingly require attestations.',
    targetUser: 'Engineering-led startups under ~50 people selling to enterprises.',
    evidenceSummary:
      'Founder quotes thread, a procurement survey (72% of buyers require attestation), and an open-source feature request for CI-based evidence.',
    whyNow: 'Buyer requirements for small vendors rose from 44% to 72% in two years.',
    currentAlternatives:
      'Compliance-automation platforms ($25k+), manual shared folders, an open-source toolkit without CI integration.',
    potentialWedge:
      'Inference: a GitHub-Actions-style evidence collector that exports to whatever auditor format is needed.',
    monetizationNotes: 'Strong willingness to pay at the incumbent level; price-sensitive segment below it.',
    competitionNotes: 'Well-funded incumbents; low end less served.',
    buildabilityNotes: 'Moderate; auditor acceptance is the non-technical risk.',
    distributionNotes: 'Founder communities and CI marketplaces.',
    majorUncertainties: ['Whether auditors accept automated evidence from a new tool'],
    openQuestions: [
      'Which auditors accept exported evidence?',
      'How low can pricing go and still be a business?',
    ],
    dimensions: {
      evidenceStrength: 'medium',
      competition: 'high',
      buildability: 'moderate',
      monetizationEvidence: 'medium',
      distributionAccessibility: 'medium',
      developerFit: 'unspecified',
    },
  },
  // webhook-reliability intentionally has NO template: the strong incumbent signal means the fixture
  // agent declines to produce a card. This demonstrates "do not fill a quota with weak ideas".
];

export interface DemoFinding {
  key: string;
  section: string;
  claim: string;
  kind: 'sourced_fact' | 'inference';
  supportStrength: 'strong' | 'medium' | 'weak';
  urls: string[];
}

export interface DemoInvestigation {
  theme: DemoThemeId;
  investigationQueries: Array<{ query: string; purpose: string }>;
  findings: DemoFinding[];
  sections: Record<string, { body: string; findingKeys: string[] }>;
  comparisonRow: {
    problemEvidenceStrength: 'strong' | 'medium' | 'weak';
    alternatives: string;
    marketCrowding: 'low' | 'medium' | 'high' | 'unknown';
    monetizationEvidence: 'strong' | 'medium' | 'weak' | 'unknown';
    distributionAccessibility: 'strong' | 'medium' | 'weak' | 'unknown';
    technicalFeasibility: 'easy' | 'moderate' | 'hard' | 'unknown';
    majorConstraints: string;
    biggestUnknown: string;
  };
  recommendation: {
    recommendation: 'BUILD' | 'INVESTIGATE_FURTHER' | 'PIVOT' | 'REJECT';
    why: string;
    proposedWedge: string;
    distributionHypothesis: string;
    monetizationHypothesis: string;
    assumptions: Array<{
      statement: string;
      supportKeys: string[];
      againstKeys: string[];
      status: 'supported' | 'contested' | 'unknown';
    }>;
    unknowns: string[];
    whatWouldChange: string[];
  };
  buildPackage: {
    productDefinition: string;
    valueProposition: string;
    mvpScope: string[];
    nonGoals: string[];
    userFlows: string[];
    requirements: Array<{
      text: string;
      priority: 'must' | 'should' | 'could';
      assumptionIdx: number[];
      findingKeys: string[];
    }>;
    architectureProposal: string;
    interfaces: string[];
    dataModel: string[];
    milestones: Array<{ title: string; description: string }>;
    acceptanceCriteria: string[];
    risks: Array<{ kind: 'product' | 'engineering'; text: string }>;
    openQuestions: string[];
    validationPlan: string[];
  };
  validationQueries: Array<{ query: string; purpose: string }>;
}

const U = (p: string) => `https://demo.invalid/${p}`;

const GENERIC_SECTION = (title: string) => ({
  body: `No dedicated findings for ${title.toLowerCase()} were produced in this DEMO investigation; this section is intentionally thin to show how sparse evidence is surfaced rather than papered over.`,
  findingKeys: [] as string[],
});

export const DEMO_INVESTIGATIONS: DemoInvestigation[] = [
  {
    theme: 'agent-context',
    investigationQueries: [
      {
        query: 'coding agent context handoff between tools complaint',
        purpose: 'Confirm breadth of the pain',
      },
      { query: 'AGENTS.md CLAUDE.md multiple tools sync workaround', purpose: 'Find current workarounds' },
      { query: 'coding agent session export portability feature request', purpose: 'Check vendor stance' },
      { query: 'draft spec interop context coding agents standard', purpose: 'Check standardisation status' },
      {
        query: 'survey developers multiple AI coding assistants adoption',
        purpose: 'Size the affected population',
      },
    ],
    findings: [
      {
        key: 'F1',
        section: 'problem',
        claim:
          'Developers report re-explaining project context to each new coding-agent session and maintaining hand-written context files.',
        kind: 'sourced_fact',
        supportStrength: 'medium',
        urls: [U('forum/coding-agents-lose-context')],
      },
      {
        key: 'F2',
        section: 'alternatives',
        claim: 'Teams keep CLAUDE.md, AGENTS.md and .cursorrules in sync by hand, with ad-hoc diff scripts.',
        kind: 'sourced_fact',
        supportStrength: 'medium',
        urls: [U('blog/memory-files-for-ai-agents')],
      },
      {
        key: 'F3',
        section: 'market',
        claim:
          'A vendor declined (not on roadmap) a 312-upvote request to export session context for other agents.',
        kind: 'sourced_fact',
        supportStrength: 'medium',
        urls: [U('issues/agent-tool/4512')],
      },
      {
        key: 'F4',
        section: 'market',
        claim:
          'A draft interchange format for project memory exists; no vendor has committed to shipping it.',
        kind: 'sourced_fact',
        supportStrength: 'weak',
        urls: [U('news/agent-interop-standard-draft')],
      },
      {
        key: 'F5',
        section: 'target_users',
        claim:
          '61% of surveyed developers use two or more AI coding assistants weekly (self-selected survey, n=4,800).',
        kind: 'sourced_fact',
        supportStrength: 'medium',
        urls: [U('survey/developer-ai-tools-2026')],
      },
      {
        key: 'F6',
        section: 'economics',
        claim: 'No evidence of anyone paying for cross-tool context today was found in this investigation.',
        kind: 'inference',
        supportStrength: 'weak',
        urls: [],
      },
      {
        key: 'F7',
        section: 'gaps',
        claim:
          'Vendors are incentivised to keep memory proprietary, which leaves the neutral position open to a third party.',
        kind: 'inference',
        supportStrength: 'medium',
        urls: [],
      },
      {
        key: 'F8',
        section: 'feasibility',
        claim:
          'Generating per-tool memory files from one canonical source is straightforward; semantic shared memory is not.',
        kind: 'inference',
        supportStrength: 'medium',
        urls: [],
      },
    ],
    sections: {
      executive_summary: {
        body: 'Developers who use several AI coding agents repeatedly re-establish project context by hand [F:F1][F:F2]. The affected population appears large and growing [F:F5], vendors are not prioritising portability [F:F3], and a draft standard exists without adoption [F:F4]. Monetization is unproven [F:F6].',
        findingKeys: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'],
      },
      problem: {
        body: 'Context does not survive a switch between coding agents; developers re-paste architecture notes and maintain duplicate memory files that drift [F:F1][F:F2].',
        findingKeys: ['F1', 'F2'],
      },
      target_users: {
        body: 'Developers and small teams using two or more assistants weekly — a majority of a self-selected survey population [F:F5].',
        findingKeys: ['F5'],
      },
      alternatives: {
        body: 'Hand-maintained per-tool files and diff scripts [F:F2]; community export scripts attached to the feature request [F:F3].',
        findingKeys: ['F2', 'F3'],
      },
      market: {
        body: 'Vendors keep memory internal [F:F3]; a standard is drafted but unshipped [F:F4]. No neutral cross-tool product surfaced in evidence.',
        findingKeys: ['F3', 'F4'],
      },
      economics: {
        body: 'No payment evidence yet [F:F6]. Plausible models (team sync, hosted memory) are inferences and must be tested.',
        findingKeys: ['F6'],
      },
      distribution: {
        body: 'The forum thread and the issue tracker are concrete places where affected developers already gather [F:F1][F:F3].',
        findingKeys: ['F1', 'F3'],
      },
      observations: {
        body: 'The strongest signal is behavioural: people already build workarounds [F:F2]. The draft standard is both an opportunity and a commoditisation risk [F:F4][F:F7].',
        findingKeys: ['F2', 'F4', 'F7'],
      },
      feasibility: {
        body: 'A file-generation/sync CLI is easy; a richer shared memory is hard [F:F8].',
        findingKeys: ['F8'],
      },
      gaps: {
        body: 'The neutral position is open [F:F7]. The gap narrows if vendors ship the standard [F:F4].',
        findingKeys: ['F7', 'F4'],
      },
      risks: {
        body: 'Vendor adoption of the standard; low willingness to pay for a utility [F:F6]; platform changes to memory file conventions.',
        findingKeys: ['F6'],
      },
      recommendation: {
        body: 'Build a small CLI that generates and syncs per-tool memory files from one canonical source [F:F8], distribute through the existing threads [F:F1][F:F3], and test willingness to pay for team features before building shared semantic memory.',
        findingKeys: ['F8', 'F1', 'F3'],
      },
    },
    comparisonRow: {
      problemEvidenceStrength: 'strong',
      alternatives: 'Hand-maintained memory files; diff scripts; community export scripts',
      marketCrowding: 'low',
      monetizationEvidence: 'weak',
      distributionAccessibility: 'strong',
      technicalFeasibility: 'moderate',
      majorConstraints: 'Vendors may ship the draft standard themselves',
      biggestUnknown: 'Willingness to pay',
    },
    recommendation: {
      recommendation: 'BUILD',
      why: 'Strong behavioural evidence of pain and workarounds, a growing population, low current competition and an easy initial wedge. Monetization is the open question and can be tested cheaply after a minimal CLI exists.',
      proposedWedge:
        'Single-source memory CLI that generates CLAUDE.md / AGENTS.md / .cursorrules and keeps them in sync.',
      distributionHypothesis: 'Post in the existing forum thread and issue; developer word of mouth.',
      monetizationHypothesis: 'Free CLI; paid team sync / hosted memory later (untested).',
      assumptions: [
        {
          statement: 'A meaningful share of developers switch between coding agents on the same project.',
          supportKeys: ['F1', 'F5'],
          againstKeys: [],
          status: 'supported',
        },
        {
          statement: 'Vendors will not ship cross-tool portability themselves within 12 months.',
          supportKeys: ['F3'],
          againstKeys: ['F4'],
          status: 'contested',
        },
        {
          statement: 'Teams will pay for synchronised shared memory.',
          supportKeys: [],
          againstKeys: ['F6'],
          status: 'unknown',
        },
      ],
      unknowns: ['Willingness to pay', 'How often switching happens per project'],
      whatWouldChange: [
        'A major vendor ships the interchange standard',
        'User interviews show switching is rare',
      ],
    },
    buildPackage: {
      productDefinition:
        'A command-line tool that keeps one canonical project memory and generates/syncs the per-tool memory files that AI coding agents read.',
      valueProposition: 'Write project context once; every coding agent you use stays in sync.',
      mvpScope: [
        'Canonical memory file format',
        'Generators for three common tool memory files',
        'Drift detection and sync command',
        'Init command that imports existing files',
      ],
      nonGoals: ['Hosted/shared memory service', 'Semantic memory or embeddings', 'IDE plugins'],
      userFlows: [
        'Init: import existing memory files into one canonical source',
        'Sync: regenerate per-tool files after editing the canonical source',
        'Check: detect drift in CI',
      ],
      requirements: [
        {
          text: 'The tool shall maintain a single canonical memory file from which per-tool files are generated.',
          priority: 'must',
          assumptionIdx: [0],
          findingKeys: ['F2'],
        },
        {
          text: 'The tool shall generate at least three per-tool memory file formats.',
          priority: 'must',
          assumptionIdx: [0],
          findingKeys: ['F2', 'F5'],
        },
        {
          text: 'The tool shall detect drift between generated files and the canonical source and report it with a non-zero exit code.',
          priority: 'must',
          assumptionIdx: [],
          findingKeys: ['F2'],
        },
        {
          text: 'The tool shall import existing memory files on init without data loss.',
          priority: 'must',
          assumptionIdx: [0],
          findingKeys: ['F1'],
        },
        {
          text: 'The tool should be able to emit the draft interchange format when it stabilises.',
          priority: 'could',
          assumptionIdx: [1],
          findingKeys: ['F4'],
        },
        {
          text: 'The tool should record anonymous opt-in usage counts to test the willingness-to-pay assumption.',
          priority: 'should',
          assumptionIdx: [2],
          findingKeys: ['F6'],
        },
      ],
      architectureProposal:
        'PROPOSAL (not market evidence): a single-binary CLI; canonical memory as Markdown with front-matter; generator plugins per tool; drift check via content hashes.',
      interfaces: [
        'CLI: init / sync / check',
        'File formats: CLAUDE.md, AGENTS.md, .cursorrules',
        'Optional: draft interchange format exporter',
      ],
      dataModel: [
        'CanonicalMemory { sections[], metadata }',
        'GeneratorTarget { tool, path, template }',
        'SyncState { hashes per target }',
      ],
      milestones: [
        {
          title: 'M1 — Canonical format + one generator',
          description: 'Define format; generate one target; manual testing.',
        },
        {
          title: 'M2 — Three generators + drift check',
          description: 'Add two more targets and the check command.',
        },
        {
          title: 'M3 — Import + release',
          description: 'Init/import flow; publish; post in the discovery threads.',
        },
      ],
      acceptanceCriteria: [
        'Running sync produces identical files on repeated runs',
        'check exits non-zero when a generated file is edited by hand',
        'init imports a sample repo with three existing files without losing content',
      ],
      risks: [
        {
          kind: 'product',
          text: 'A vendor ships the interchange standard, reducing the need for a neutral tool.',
        },
        { kind: 'engineering', text: 'Tool memory file conventions change without notice.' },
      ],
      openQuestions: ['Which three tools to target first?', 'Should canonical memory be split per topic?'],
      validationPlan: [
        'Measure installs from the two discovery threads',
        'Interview 10 multi-tool developers about switching frequency',
        'Offer a waitlist for team sync to test willingness to pay',
      ],
    },
    validationQueries: [
      {
        query: 'coding agent interop context standard adoption vendors ship',
        purpose: 'Check whether the standard shipped',
      },
      { query: 'tool sync AGENTS.md CLAUDE.md generator cli new', purpose: 'Look for new competitors' },
      { query: 'survey developers multiple AI coding assistants', purpose: 'Re-check population growth' },
    ],
  },
  {
    theme: 'usage-billing',
    investigationQueries: [
      {
        query: 'metered billing indie SaaS manual invoice spreadsheet',
        purpose: 'Confirm workaround breadth',
      },
      { query: 'billing platform pricing minimum revenue share', purpose: 'Incumbent pricing' },
      {
        query: 'payments API meter objects deprecation migration',
        purpose: 'Timing of the forced migration',
      },
      {
        query: 'marketplace billing metering plugins paid installs',
        purpose: 'Distribution and payment evidence',
      },
    ],
    findings: [
      {
        key: 'F1',
        section: 'problem',
        claim:
          'Indie founders aggregate usage in spreadsheets and hand-create invoice line items; double-charging incidents are reported.',
        kind: 'sourced_fact',
        supportStrength: 'medium',
        urls: [U('forum/usage-billing-indie-saas')],
      },
      {
        key: 'F2',
        section: 'economics',
        claim: 'An incumbent billing platform charges 0.8% of revenue with a $2,000/month minimum.',
        kind: 'sourced_fact',
        supportStrength: 'strong',
        urls: [U('pricing/billing-platform-fees')],
      },
      {
        key: 'F3',
        section: 'market',
        claim:
          'A major payments API deprecated its usage-record endpoint with a 12-month sunset in favour of meter objects.',
        kind: 'sourced_fact',
        supportStrength: 'strong',
        urls: [U('changelog/payments-api-meters')],
      },
      {
        key: 'F4',
        section: 'distribution',
        claim:
          'A framework marketplace lists 214 billing/metering plugins, several paid, with five-figure weekly installs at the top.',
        kind: 'sourced_fact',
        supportStrength: 'medium',
        urls: [U('marketplace/billing-plugins')],
      },
      {
        key: 'F5',
        section: 'gaps',
        claim:
          'The forced migration is a window in which existing plugins may lose users who need help moving to meter objects.',
        kind: 'inference',
        supportStrength: 'medium',
        urls: [],
      },
    ],
    sections: {
      executive_summary: {
        body: 'Small SaaS businesses do metered billing by hand [F:F1] because incumbents start at $2k/month [F:F2]. A payments-API migration with a 12-month sunset [F:F3] creates a timing window; a marketplace shows paid demand [F:F4].',
        findingKeys: ['F1', 'F2', 'F3', 'F4'],
      },
      problem: { body: 'Manual metering and invoicing with real money errors [F:F1].', findingKeys: ['F1'] },
      target_users: {
        body: 'Solo and small-team SaaS founders under ~$300k ARR [F:F2].',
        findingKeys: ['F2'],
      },
      alternatives: {
        body: 'Spreadsheets and cron jobs [F:F1]; enterprise billing platforms [F:F2]; 214 marketplace plugins [F:F4].',
        findingKeys: ['F1', 'F2', 'F4'],
      },
      market: {
        body: 'Crowded plugin category [F:F4] but a forced migration resets it [F:F3][F:F5].',
        findingKeys: ['F4', 'F3', 'F5'],
      },
      economics: {
        body: 'Clear willingness to pay at the plugin level [F:F4]; incumbent pricing sets a ceiling [F:F2].',
        findingKeys: ['F4', 'F2'],
      },
      distribution: {
        body: 'The marketplace is a direct channel with measurable installs [F:F4].',
        findingKeys: ['F4'],
      },
      observations: { body: 'Timing is the key asset [F:F3].', findingKeys: ['F3'] },
      feasibility: GENERIC_SECTION('Technical feasibility'),
      gaps: { body: 'Migration help plus invoice generation [F:F5].', findingKeys: ['F5'] },
      risks: { body: 'Incumbent plugins adapt quickly [F:F4].', findingKeys: ['F4'] },
      recommendation: {
        body: 'Investigate further: survey the top 20 plugins for migration status before committing.',
        findingKeys: ['F4', 'F3'],
      },
    },
    comparisonRow: {
      problemEvidenceStrength: 'strong',
      alternatives: 'Spreadsheets; enterprise billing platforms; marketplace plugins',
      marketCrowding: 'high',
      monetizationEvidence: 'strong',
      distributionAccessibility: 'strong',
      technicalFeasibility: 'moderate',
      majorConstraints: 'Crowded plugin category',
      biggestUnknown: 'Whether existing plugins already migrated',
    },
    recommendation: {
      recommendation: 'INVESTIGATE_FURTHER',
      why: 'Strong pain, payment and timing evidence, but the category is crowded and the key unknown (incumbent plugin migration status) is cheap to check before building.',
      proposedWedge: 'Migration-first metering plugin for the new meter objects.',
      distributionHypothesis: 'Framework marketplace listing.',
      monetizationHypothesis: 'Paid plugin tier.',
      assumptions: [
        {
          statement: 'Existing plugins have not yet migrated to meter objects.',
          supportKeys: [],
          againstKeys: [],
          status: 'unknown',
        },
        {
          statement: 'Founders will pay for a plugin that prevents double-charging.',
          supportKeys: ['F1', 'F4'],
          againstKeys: [],
          status: 'supported',
        },
      ],
      unknowns: ['Migration status of top plugins'],
      whatWouldChange: ['Top plugins already support meter objects'],
    },
    buildPackage: {
      productDefinition:
        'A marketplace plugin that migrates usage billing to the new meter objects and generates correct invoices.',
      valueProposition: 'Migrate once, stop double-charging.',
      mvpScope: ['Meter object sync', 'Idempotent invoice line generation', 'Migration wizard'],
      nonGoals: ['Full billing platform', 'Tax handling'],
      userFlows: ['Install → connect payments account → migrate → monthly invoice run'],
      requirements: [
        {
          text: 'The plugin shall create meter events idempotently so re-runs never double-charge.',
          priority: 'must',
          assumptionIdx: [1],
          findingKeys: ['F1'],
        },
        {
          text: 'The plugin shall migrate existing usage records to meter objects before the sunset date.',
          priority: 'must',
          assumptionIdx: [0],
          findingKeys: ['F3'],
        },
      ],
      architectureProposal:
        'PROPOSAL: plugin following the marketplace SDK; queue-backed sync with idempotency keys.',
      interfaces: ['Payments API meters', 'Marketplace plugin SDK'],
      dataModel: ['MeterEvent', 'InvoiceLine', 'MigrationState'],
      milestones: [{ title: 'M1 — Idempotent meter sync', description: 'Core sync with tests.' }],
      acceptanceCriteria: ['Re-running the sync for the same period creates zero duplicate meter events'],
      risks: [{ kind: 'product', text: 'Incumbent plugins adapt first.' }],
      openQuestions: ['Pricing tier'],
      validationPlan: ['Track installs and conversion in the marketplace'],
    },
    validationQueries: [
      { query: 'billing plugins meter objects migration support', purpose: 'Check incumbent migration' },
    ],
  },
];

export function findInvestigation(theme: DemoThemeId | null): DemoInvestigation | undefined {
  return DEMO_INVESTIGATIONS.find((i) => i.theme === theme);
}

/** Discovery queries the fixture planner emits; they are keyword-aligned with the corpus. */
export const DEMO_DISCOVERY_QUERIES: Array<{
  query: string;
  family: string;
  purpose: string;
  areas?: string[];
}> = [
  {
    query: 'developers complaint coding agent context session handoff manual workaround',
    family: 'pain_workaround',
    purpose: 'Recurring complaints about AI coding agents',
  },
  {
    query: 'feature request session export portability coding agent issue upvotes',
    family: 'ecosystem_gap',
    purpose: 'Requested missing functionality in agent tools',
  },
  {
    query: 'survey adoption multiple coding assistants developers growth',
    family: 'market_movement',
    purpose: 'Adoption evidence for multi-tool usage',
  },
  {
    query: 'standard protocol interop coding agent context spec new',
    family: 'technical_change',
    purpose: 'New standards around agent context',
  },
  {
    query: 'small team sync offline local-first CRDT conflict pain',
    family: 'pain_workaround',
    purpose: 'Pain building sync for small apps',
  },
  {
    query: 'sync backend pricing expensive incumbent realtime plan month',
    family: 'economic_distribution',
    purpose: 'Incumbent pricing in sync backends',
  },
  {
    query: 'hosted sync service shutdown migrate customers alternative',
    family: 'market_movement',
    purpose: 'Shutdowns creating displaced customers',
  },
  {
    query: 'SQLite WASM browser local-first capability new',
    family: 'technical_change',
    purpose: 'Infrastructure becoming easier',
  },
  {
    query: 'indie solo SaaS metered usage-based billing manual invoice workaround',
    family: 'pain_workaround',
    purpose: 'Manual billing workflows',
  },
  {
    query: 'billing platform pricing minimum fees incumbent expensive',
    family: 'economic_distribution',
    purpose: 'Incumbent billing pricing',
  },
  {
    query: 'payments API change meter deprecation migration',
    family: 'market_movement',
    purpose: 'Platform API changes in payments',
  },
  {
    query: 'marketplace billing metering plugins paid installs distribution',
    family: 'economic_distribution',
    purpose: 'Marketplace distribution and payment evidence',
  },
  {
    query: 'LLM cost bill tokens attribution observability startup manual',
    family: 'pain_workaround',
    purpose: 'LLM cost tracking pain',
  },
  {
    query: 'LLM observability vendor pricing expensive enterprise contract',
    family: 'economic_distribution',
    purpose: 'Incumbent LLM observability pricing',
  },
  {
    query: 'model providers pricing change tokens monthly',
    family: 'market_movement',
    purpose: 'Model pricing churn',
  },
  {
    query: 'SOC 2 compliance startup expensive quotes manual evidence',
    family: 'pain_workaround',
    purpose: 'Compliance cost pain for startups',
  },
  {
    query: 'procurement security requirements compliance enterprise vendors policy change',
    family: 'constraint_change',
    purpose: 'Buyer-side compliance pressure',
  },
  {
    query: 'compliance evidence CI automation feature request screenshots',
    family: 'ecosystem_gap',
    purpose: 'Missing CI integration for evidence',
  },
  {
    query: 'webhooks dropped retry replay dead-letter reliability incident',
    family: 'pain_workaround',
    purpose: 'Webhook reliability pain',
  },
  {
    query: 'webhook delivery service pricing managed adopted',
    family: 'economic_distribution',
    purpose: 'Webhook incumbents',
  },
];
