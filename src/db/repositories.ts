/**
 * Repository layer: the only place that knows table shapes. Everything returned is parsed
 * through the domain Zod schemas so callers get validated domain objects.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from './client';
import * as t from './schema';
import {
  Project,
  ResearchRun,
  ResearchQuery,
  Evidence,
  Signal,
  SignalCluster,
  Opportunity,
  Investigation,
  Finding,
  ProductBrief,
  Decision,
  BuildPackage,
  ValidationReview,
  WorkflowEvent,
  type WorkflowStage,
  type OpportunityStatus,
} from '@domain/types';
import { nowIso } from '@domain/ids';

type Row<T> = T extends { $inferSelect: infer S } ? S : never;

export class Repositories {
  constructor(readonly db: Db) {}

  // ---- Projects ----
  createProject(p: Project): Project {
    this.db.insert(t.projects).values(p).run();
    return p;
  }
  getProject(id: string): Project | null {
    const row = this.db.select().from(t.projects).where(eq(t.projects.id, id)).get();
    return row ? Project.parse(row) : null;
  }
  listProjects(): Project[] {
    return this.db
      .select()
      .from(t.projects)
      .orderBy(desc(t.projects.updatedAt))
      .all()
      .map((r) => Project.parse(r));
  }
  updateProject(id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>): Project {
    this.db
      .update(t.projects)
      .set({ ...patch, updatedAt: nowIso() })
      .where(eq(t.projects.id, id))
      .run();
    const p = this.getProject(id);
    if (!p) throw new Error(`project ${id} not found`);
    return p;
  }
  setStage(id: string, stage: WorkflowStage): Project {
    return this.updateProject(id, { stage });
  }
  deleteProject(id: string): void {
    const tables = [
      t.events,
      t.validationReviews,
      t.buildPackages,
      t.decisions,
      t.briefs,
      t.findings,
      t.investigations,
      t.opportunities,
      t.signalClusters,
      t.signals,
      t.evidence,
      t.researchQueries,
      t.researchRuns,
    ] as const;
    this.db.transaction((tx) => {
      const qIds = tx
        .select({ id: t.researchQueries.id })
        .from(t.researchQueries)
        .where(eq(t.researchQueries.projectId, id))
        .all()
        .map((r) => r.id);
      if (qIds.length) tx.delete(t.rawResponses).where(inArray(t.rawResponses.queryId, qIds)).run();
      for (const tbl of tables)
        tx.delete(tbl)
          .where(eq((tbl as any).projectId, id))
          .run();
      tx.delete(t.projects).where(eq(t.projects.id, id)).run();
    });
  }

  // ---- Runs ----
  createRun(r: ResearchRun): ResearchRun {
    this.db.insert(t.researchRuns).values(r).run();
    return r;
  }
  getRun(id: string): ResearchRun | null {
    const row = this.db.select().from(t.researchRuns).where(eq(t.researchRuns.id, id)).get();
    return row ? ResearchRun.parse(row) : null;
  }
  listRuns(projectId: string): ResearchRun[] {
    return this.db
      .select()
      .from(t.researchRuns)
      .where(eq(t.researchRuns.projectId, projectId))
      .orderBy(desc(t.researchRuns.createdAt))
      .all()
      .map((r) => ResearchRun.parse(r));
  }
  updateRun(id: string, patch: Partial<ResearchRun>): ResearchRun {
    this.db
      .update(t.researchRuns)
      .set({ ...patch, updatedAt: nowIso() })
      .where(eq(t.researchRuns.id, id))
      .run();
    const r = this.getRun(id);
    if (!r) throw new Error(`run ${id} not found`);
    return r;
  }

  // ---- Queries + raw responses ----
  createQuery(q: ResearchQuery): ResearchQuery {
    this.db.insert(t.researchQueries).values(q).run();
    return q;
  }
  updateQuery(id: string, patch: Partial<ResearchQuery>): void {
    this.db.update(t.researchQueries).set(patch).where(eq(t.researchQueries.id, id)).run();
  }
  getQuery(id: string): ResearchQuery | null {
    const row = this.db.select().from(t.researchQueries).where(eq(t.researchQueries.id, id)).get();
    return row ? ResearchQuery.parse(row) : null;
  }
  listQueries(projectId: string, runId?: string): ResearchQuery[] {
    const where = runId
      ? and(eq(t.researchQueries.projectId, projectId), eq(t.researchQueries.runId, runId))
      : eq(t.researchQueries.projectId, projectId);
    return this.db
      .select()
      .from(t.researchQueries)
      .where(where)
      .all()
      .map((r) => ResearchQuery.parse(r));
  }
  createRawResponse(r: { id: string; queryId: string; provider: string; body: string }): void {
    this.db
      .insert(t.rawResponses)
      .values({ ...r, createdAt: nowIso() })
      .run();
  }
  getRawResponse(id: string): Row<typeof t.rawResponses> | null {
    return this.db.select().from(t.rawResponses).where(eq(t.rawResponses.id, id)).get() ?? null;
  }

  // ---- Evidence ----
  createEvidence(rows: Evidence[]): void {
    if (!rows.length) return;
    this.db.insert(t.evidence).values(rows).run();
  }
  getEvidence(id: string): Evidence | null {
    const row = this.db.select().from(t.evidence).where(eq(t.evidence.id, id)).get();
    return row ? Evidence.parse(row) : null;
  }
  listEvidence(projectId: string): Evidence[] {
    return this.db
      .select()
      .from(t.evidence)
      .where(eq(t.evidence.projectId, projectId))
      .all()
      .map((r) => Evidence.parse(r));
  }
  listEvidenceByQuery(queryId: string): Evidence[] {
    return this.db
      .select()
      .from(t.evidence)
      .where(eq(t.evidence.queryId, queryId))
      .all()
      .map((r) => Evidence.parse(r));
  }

  // ---- Signals / clusters / opportunities ----
  createSignals(rows: Signal[]): void {
    if (rows.length) this.db.insert(t.signals).values(rows).run();
  }
  listSignals(projectId: string): Signal[] {
    return this.db
      .select()
      .from(t.signals)
      .where(eq(t.signals.projectId, projectId))
      .all()
      .map((r) => Signal.parse(r));
  }
  createClusters(rows: SignalCluster[]): void {
    if (rows.length) this.db.insert(t.signalClusters).values(rows).run();
  }
  listClusters(projectId: string): SignalCluster[] {
    return this.db
      .select()
      .from(t.signalClusters)
      .where(eq(t.signalClusters.projectId, projectId))
      .all()
      .map((r) => SignalCluster.parse(r));
  }
  createOpportunities(rows: Opportunity[]): void {
    if (rows.length) this.db.insert(t.opportunities).values(rows).run();
  }
  getOpportunity(id: string): Opportunity | null {
    const row = this.db.select().from(t.opportunities).where(eq(t.opportunities.id, id)).get();
    return row ? Opportunity.parse(row) : null;
  }
  listOpportunities(projectId: string): Opportunity[] {
    return this.db
      .select()
      .from(t.opportunities)
      .where(eq(t.opportunities.projectId, projectId))
      .all()
      .map((r) => Opportunity.parse(r));
  }
  setOpportunityStatus(id: string, status: OpportunityStatus): Opportunity {
    this.db.update(t.opportunities).set({ status }).where(eq(t.opportunities.id, id)).run();
    const o = this.getOpportunity(id);
    if (!o) throw new Error(`opportunity ${id} not found`);
    return o;
  }

  // ---- Investigations / findings / briefs ----
  createInvestigation(i: Investigation): Investigation {
    this.db.insert(t.investigations).values(i).run();
    return i;
  }
  updateInvestigation(id: string, patch: Partial<Investigation>): void {
    this.db.update(t.investigations).set(patch).where(eq(t.investigations.id, id)).run();
  }
  getInvestigation(id: string): Investigation | null {
    const row = this.db.select().from(t.investigations).where(eq(t.investigations.id, id)).get();
    return row ? Investigation.parse(row) : null;
  }
  listInvestigations(projectId: string): Investigation[] {
    return this.db
      .select()
      .from(t.investigations)
      .where(eq(t.investigations.projectId, projectId))
      .orderBy(desc(t.investigations.createdAt))
      .all()
      .map((r) => Investigation.parse(r));
  }
  createFindings(rows: Finding[]): void {
    if (rows.length) this.db.insert(t.findings).values(rows).run();
  }
  listFindings(projectId: string, investigationId?: string): Finding[] {
    const where = investigationId
      ? and(eq(t.findings.projectId, projectId), eq(t.findings.investigationId, investigationId))
      : eq(t.findings.projectId, projectId);
    return this.db
      .select()
      .from(t.findings)
      .where(where)
      .all()
      .map((r) => Finding.parse(r));
  }
  createBrief(b: ProductBrief): ProductBrief {
    this.db.insert(t.briefs).values(b).run();
    return b;
  }
  listBriefs(projectId: string): ProductBrief[] {
    return this.db
      .select()
      .from(t.briefs)
      .where(eq(t.briefs.projectId, projectId))
      .orderBy(desc(t.briefs.version))
      .all()
      .map((r) => ProductBrief.parse(r));
  }
  getBrief(id: string): ProductBrief | null {
    const row = this.db.select().from(t.briefs).where(eq(t.briefs.id, id)).get();
    return row ? ProductBrief.parse(row) : null;
  }

  // ---- Decisions / build packages / validation ----
  createDecision(d: Decision): Decision {
    this.db.insert(t.decisions).values(d).run();
    return d;
  }
  updateDecision(id: string, patch: Partial<Decision>): Decision {
    this.db.update(t.decisions).set(patch).where(eq(t.decisions.id, id)).run();
    const d = this.getDecision(id);
    if (!d) throw new Error(`decision ${id} not found`);
    return d;
  }
  getDecision(id: string): Decision | null {
    const row = this.db.select().from(t.decisions).where(eq(t.decisions.id, id)).get();
    return row ? Decision.parse(row) : null;
  }
  listDecisions(projectId: string): Decision[] {
    return this.db
      .select()
      .from(t.decisions)
      .where(eq(t.decisions.projectId, projectId))
      .orderBy(desc(t.decisions.version))
      .all()
      .map((r) => Decision.parse(r));
  }
  createBuildPackage(b: BuildPackage): BuildPackage {
    this.db.insert(t.buildPackages).values(b).run();
    return b;
  }
  getBuildPackage(id: string): BuildPackage | null {
    const row = this.db.select().from(t.buildPackages).where(eq(t.buildPackages.id, id)).get();
    return row ? BuildPackage.parse(row) : null;
  }
  listBuildPackages(projectId: string): BuildPackage[] {
    return this.db
      .select()
      .from(t.buildPackages)
      .where(eq(t.buildPackages.projectId, projectId))
      .orderBy(desc(t.buildPackages.version))
      .all()
      .map((r) => BuildPackage.parse(r));
  }
  createValidationReview(v: ValidationReview): ValidationReview {
    this.db.insert(t.validationReviews).values(v).run();
    return v;
  }
  updateValidationReview(id: string, patch: Partial<ValidationReview>): void {
    this.db.update(t.validationReviews).set(patch).where(eq(t.validationReviews.id, id)).run();
  }
  listValidationReviews(projectId: string): ValidationReview[] {
    return this.db
      .select()
      .from(t.validationReviews)
      .where(eq(t.validationReviews.projectId, projectId))
      .orderBy(desc(t.validationReviews.version))
      .all()
      .map((r) => ValidationReview.parse(r));
  }

  // ---- Events ----
  createEvent(e: WorkflowEvent): void {
    this.db.insert(t.events).values(e).run();
  }
  listEvents(projectId: string, limit = 500): WorkflowEvent[] {
    return this.db
      .select()
      .from(t.events)
      .where(eq(t.events.projectId, projectId))
      .orderBy(desc(t.events.createdAt))
      .limit(limit)
      .all()
      .map((r) => WorkflowEvent.parse(r));
  }
}
