/**
 * SQLite schema (Drizzle). JSON-valued columns are stored as text with mode:'json'.
 * Moving to PostgreSQL later means swapping this file + the client for pg-core equivalents;
 * repositories.ts is the only module that touches these tables.
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  stage: text('stage').notNull(),
  mode: text('mode').notNull(),
  discoveryProfile: text('discovery_profile', { mode: 'json' }).notNull(),
  selectedOpportunityId: text('selected_opportunity_id'),
  decisionStatus: text('decision_status').notNull().default('none'),
});

export const researchRuns = sqliteTable(
  'research_runs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    kind: text('kind').notNull(),
    targetIds: text('target_ids', { mode: 'json' }).notNull(),
    status: text('status').notNull(),
    stage: text('stage').notNull(),
    budget: text('budget', { mode: 'json' }).notNull(),
    searchProvider: text('search_provider').notNull(),
    agentProvider: text('agent_provider').notNull(),
    progress: text('progress', { mode: 'json' }).notNull(),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('runs_project_idx').on(t.projectId)],
);

export const researchQueries = sqliteTable(
  'research_queries',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    runId: text('run_id').notNull(),
    query: text('query').notNull(),
    family: text('family').notNull(),
    purpose: text('purpose').notNull(),
    provider: text('provider').notNull(),
    status: text('status').notNull(),
    executedAt: text('executed_at'),
    durationMs: integer('duration_ms'),
    resultCount: integer('result_count'),
    rawResponseId: text('raw_response_id'),
    error: text('error'),
    failureCode: text('failure_code'),
  },
  (t) => [index('queries_run_idx').on(t.runId), index('queries_project_idx').on(t.projectId)],
);

export const rawResponses = sqliteTable('raw_responses', {
  id: text('id').primaryKey(),
  queryId: text('query_id').notNull(),
  provider: text('provider').notNull(),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
});

export const evidence = sqliteTable(
  'evidence',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    queryId: text('query_id').notNull(),
    url: text('url').notNull(),
    title: text('title').notNull(),
    snippet: text('snippet').notNull(),
    position: integer('position'),
    providerMeta: text('provider_meta', { mode: 'json' }),
    provider: text('provider').notNull(),
    retrievedAt: text('retrieved_at').notNull(),
    fullText: text('full_text'),
    isDemo: integer('is_demo', { mode: 'boolean' }).notNull().default(false),
    // V0.1: canonical source identity, classification and fetch state
    canonicalUrl: text('canonical_url').notNull().default(''),
    domain: text('domain').notNull().default(''),
    category: text('category').notNull().default('other'),
    categoryConfidence: text('category_confidence').notNull().default('low'),
    fetchStatus: text('fetch_status').notNull().default('snippet_only'),
    finalUrl: text('final_url'),
    httpStatus: integer('http_status'),
    contentType: text('content_type'),
    pageTitle: text('page_title'),
    textTruncated: integer('text_truncated', { mode: 'boolean' }).notNull().default(false),
    textChars: integer('text_chars'),
    textHash: text('text_hash'),
    fetchedAt: text('fetched_at'),
    fetchError: text('fetch_error'),
    fetchRunId: text('fetch_run_id'),
  },
  (t) => [
    index('evidence_project_idx').on(t.projectId),
    index('evidence_query_idx').on(t.queryId),
    index('evidence_canonical_idx').on(t.projectId, t.canonicalUrl),
  ],
);

/** Every time a search returned a source: one row per (query, source). Rediscoveries are preserved. */
export const evidenceDiscoveries = sqliteTable(
  'evidence_discoveries',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    evidenceId: text('evidence_id').notNull(),
    queryId: text('query_id').notNull(),
    runId: text('run_id').notNull(),
    position: integer('position'),
    provider: text('provider').notNull(),
    providerMeta: text('provider_meta', { mode: 'json' }),
    url: text('url').notNull(),
    retrievedAt: text('retrieved_at').notNull(),
  },
  (t) => [
    index('discoveries_evidence_idx').on(t.evidenceId),
    index('discoveries_query_idx').on(t.queryId),
    index('discoveries_project_idx').on(t.projectId),
  ],
);

export const signals = sqliteTable(
  'signals',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    runId: text('run_id').notNull(),
    kind: text('kind').notNull().default('raw'),
    componentSignalIds: text('component_signal_ids', { mode: 'json' }).notNull().default('[]'),
    stats: text('stats', { mode: 'json' }),
    type: text('type').notNull(),
    observation: text('observation').notNull(),
    inference: text('inference').notNull(),
    affectedUser: text('affected_user'),
    uncertainty: text('uncertainty').notNull(),
    confidence: text('confidence').notNull(),
    evidenceIds: text('evidence_ids', { mode: 'json' }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('signals_project_idx').on(t.projectId)],
);

export const signalClusters = sqliteTable('signal_clusters', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  runId: text('run_id').notNull(),
  label: text('label').notNull(),
  description: text('description').notNull(),
  rationale: text('rationale').notNull(),
  signalIds: text('signal_ids', { mode: 'json' }).notNull(),
  createdAt: text('created_at').notNull(),
});

export const opportunities = sqliteTable(
  'opportunities',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    runId: text('run_id').notNull(),
    clusterId: text('cluster_id'),
    title: text('title').notNull(),
    thesis: text('thesis').notNull(),
    problem: text('problem').notNull(),
    targetUser: text('target_user').notNull(),
    evidenceSummary: text('evidence_summary').notNull(),
    signalIds: text('signal_ids', { mode: 'json' }).notNull(),
    whyNow: text('why_now').notNull(),
    currentAlternatives: text('current_alternatives').notNull(),
    potentialWedge: text('potential_wedge').notNull(),
    monetizationNotes: text('monetization_notes').notNull(),
    competitionNotes: text('competition_notes').notNull(),
    buildabilityNotes: text('buildability_notes').notNull(),
    distributionNotes: text('distribution_notes').notNull(),
    majorUncertainties: text('major_uncertainties', { mode: 'json' }).notNull(),
    openQuestions: text('open_questions', { mode: 'json' }).notNull(),
    dimensions: text('dimensions', { mode: 'json' }).notNull(),
    corroboration: text('corroboration', { mode: 'json' }),
    status: text('status').notNull(),
    seeded: integer('seeded', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('opps_project_idx').on(t.projectId)],
);

export const investigations = sqliteTable('investigations', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  runId: text('run_id'),
  kind: text('kind').notNull(),
  opportunityIds: text('opportunity_ids', { mode: 'json' }).notNull(),
  status: text('status').notNull(),
  comparison: text('comparison', { mode: 'json' }),
  comparisonSummary: text('comparison_summary'),
  retrieval: text('retrieval'),
  retrievalNote: text('retrieval_note'),
  candidateRetrieval: text('candidate_retrieval', { mode: 'json' }),
  createdAt: text('created_at').notNull(),
});

export const findings = sqliteTable(
  'findings',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    investigationId: text('investigation_id').notNull(),
    section: text('section').notNull(),
    claim: text('claim').notNull(),
    kind: text('kind').notNull(),
    supportStrength: text('support_strength').notNull(),
    evidenceIds: text('evidence_ids', { mode: 'json' }).notNull(),
    supportLevel: text('support_level').notNull().default('snippet_only'),
    excerpts: text('excerpts', { mode: 'json' }).notNull().default('[]'),
    retrievalOrigin: text('retrieval_origin').notNull().default('unknown'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('findings_inv_idx').on(t.investigationId)],
);

export const briefs = sqliteTable('briefs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  investigationId: text('investigation_id').notNull(),
  opportunityId: text('opportunity_id').notNull(),
  version: integer('version').notNull(),
  sections: text('sections', { mode: 'json' }).notNull(),
  createdAt: text('created_at').notNull(),
});

export const decisions = sqliteTable('decisions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  briefId: text('brief_id').notNull(),
  opportunityId: text('opportunity_id').notNull(),
  version: integer('version').notNull(),
  agentRecommendation: text('agent_recommendation', { mode: 'json' }).notNull(),
  userDecision: text('user_decision'),
  userRationale: text('user_rationale'),
  userPivotDirection: text('user_pivot_direction'),
  decidedAt: text('decided_at'),
  createdAt: text('created_at').notNull(),
});

export const buildPackages = sqliteTable('build_packages', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  decisionId: text('decision_id').notNull(),
  version: integer('version').notNull(),
  sections: text('sections', { mode: 'json' }).notNull(),
  requirements: text('requirements', { mode: 'json' }).notNull(),
  createdAt: text('created_at').notNull(),
});

export const validationReviews = sqliteTable('validation_reviews', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  buildPackageId: text('build_package_id').notNull(),
  runId: text('run_id'),
  version: integer('version').notNull(),
  originalAssumptions: text('original_assumptions', { mode: 'json' }).notNull(),
  whatWeBuilt: text('what_we_built').notNull(),
  implementationLessons: text('implementation_lessons').notNull(),
  newEvidenceIds: text('new_evidence_ids', { mode: 'json' }).notNull(),
  assumptionStatus: text('assumption_status', { mode: 'json' }).notNull(),
  externalChanges: text('external_changes', { mode: 'json' }).notNull(),
  verdict: text('verdict'),
  rationale: text('rationale').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
});

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id'),
    type: text('type').notNull(),
    payload: text('payload', { mode: 'json' }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('events_project_idx').on(t.projectId)],
);
