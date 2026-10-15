import type {
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
  WorkflowStage,
  OpportunityStatus,
} from '@domain/types';

export interface Snapshot {
  project: Project;
  runs: ResearchRun[];
  queries: ResearchQuery[];
  evidence: Evidence[];
  signals: Signal[];
  clusters: SignalCluster[];
  opportunities: Opportunity[];
  investigations: Investigation[];
  findings: Finding[];
  briefs: ProductBrief[];
  decisions: Decision[];
  buildPackages: BuildPackage[];
  validationReviews: ValidationReview[];
}

export interface Health {
  ok: boolean;
  mode: 'demo' | 'real';
  providers: {
    search: { name: string; isDemo: boolean; ok: boolean; message: string };
    agent: { name: string; isDemo: boolean; ok: boolean; message: string };
  };
  budgets: {
    discoveryMaxQueries: number;
    discoveryMaxResultsPerQuery: number;
    investigationMaxQueries: number;
    validationMaxQueries: number;
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly action?: string,
  ) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: text };
  }
  if (!res.ok) throw new ApiError(body?.error ?? `HTTP ${res.status}`, res.status, body?.code, body?.action);
  return body as T;
}
const post = <T>(path: string, body?: unknown) =>
  req<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  health: () => req<Health>('/api/health'),
  listProjects: () => req<{ projects: Project[] }>('/api/projects').then((r) => r.projects),
  createProject: (body: { title?: string; profile?: unknown }) =>
    post<{ project: Project }>('/api/projects', body).then((r) => r.project),
  getProject: (id: string) => req<Snapshot>(`/api/projects/${id}`),
  updateProject: (id: string, body: { title?: string; profile?: unknown }) =>
    req<{ project: Project }>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then(
      (r) => r.project,
    ),
  deleteProject: (id: string) => req<{ ok: true }>(`/api/projects/${id}`, { method: 'DELETE' }),
  setStage: (id: string, stage: WorkflowStage) =>
    post<{ project: Project }>(`/api/projects/${id}/stage`, { stage }).then((r) => r.project),
  startDiscovery: (id: string) => post<{ run: ResearchRun }>(`/api/projects/${id}/discovery`),
  setOpportunityStatus: (id: string, oppId: string, status: OpportunityStatus) =>
    post<{ opportunity: Opportunity }>(`/api/projects/${id}/opportunities/${oppId}/status`, { status }),
  compare: (id: string, opportunityIds: string[]) =>
    post<{ run: ResearchRun; investigation: Investigation }>(`/api/projects/${id}/compare`, {
      opportunityIds,
    }),
  investigate: (id: string, opportunityId: string) =>
    post<{ run: ResearchRun; investigation: Investigation }>(`/api/projects/${id}/investigate`, {
      opportunityId,
    }),
  decide: (
    id: string,
    decisionId: string,
    body: { decision: string; rationale?: string; pivotDirection?: string },
  ) => post<{ decision: Decision }>(`/api/projects/${id}/decisions/${decisionId}`, body),
  buildPackage: (id: string, decisionId: string) =>
    post<{ buildPackage: BuildPackage }>(`/api/projects/${id}/build-package`, { decisionId }),
  validate: (
    id: string,
    body: { buildPackageId: string; whatWeBuilt?: string; implementationLessons?: string },
  ) => post<{ run: ResearchRun; review: ValidationReview }>(`/api/projects/${id}/validate`, body),
  exportAll: (id: string) =>
    req<{ files: Record<string, string> }>(`/api/projects/${id}/export`).then((r) => r.files),
  exportUrl: (id: string, file: string) => `/api/projects/${id}/export/${file}`,
  evidenceViewed: (id: string, evidenceId: string, from: string) =>
    post<{ ok: true }>(`/api/projects/${id}/events`, { type: 'evidence_viewed', evidenceId, from }).catch(
      () => undefined,
    ),
  events: (id: string) =>
    req<{ events: WorkflowEvent[] }>(`/api/projects/${id}/events`).then((r) => r.events),
  raw: (id: string, rawId: string) =>
    req<{ raw: { id: string; provider: string; createdAt: string; body: string } }>(
      `/api/projects/${id}/raw/${rawId}`,
    ).then((r) => r.raw),
  seedDemo: () => post<{ projectId: string }>('/api/demo/seed'),
};
