/**
 * Deterministic demo seed: runs the REAL workflow code end to end with fixture providers.
 * The result is a project marked mode='demo' whose evidence is all demo.invalid pages.
 */
import type { WorkflowContext } from './context';
import { FixtureSearchProvider } from '@providers/search/fixture';
import { FixtureAgentProvider } from '@providers/agent/fixture';
import { createProject } from './projects';
import { startDiscovery } from './discovery';
import { startComparison, startDeepInvestigation } from './investigation';
import { recordUserDecision } from './decision';
import { createBuildPackage } from './buildPackage';
import { drain } from './runs';

export async function seedDemoProject(
  base: WorkflowContext,
  opts: { title?: string; validate?: boolean } = {},
) {
  const ctx: WorkflowContext = {
    ...base,
    providers: { search: new FixtureSearchProvider(), agent: new FixtureAgentProvider(), mode: 'demo' },
  };
  const project = createProject(ctx, {
    title: opts.title ?? 'DEMO — Exploring broadly (no idea yet)',
    profile: {
      customerType: 'developers',
      teamSize: 'solo',
      timeToMvp: 'weeks',
      resources: 'low',
      strengths: ['TypeScript', 'CLI tools'],
    },
  });
  startDiscovery(ctx, project.id);
  await drain();
  const opps = ctx.repos.listOpportunities(project.id);
  if (opps.length < 2) throw new Error(`demo seed expected ≥2 opportunities, got ${opps.length}`);
  const sorted = [...opps].sort((a, b) => a.title.localeCompare(b.title));
  const pick = (needle: string) => sorted.find((o) => o.title.toLowerCase().includes(needle)) ?? sorted[0]!;
  const primary = pick('portable project memory');
  const secondary = pick('metered billing');
  const third = sorted.find((o) => o.id !== primary.id && o.id !== secondary.id);
  // Mark one as interesting and one as hidden so the comparison UI shows mixed statuses.
  if (third) ctx.repos.setOpportunityStatus(third.id, 'interesting');
  const weak = sorted.find(
    (o) => o.dimensions.evidenceStrength === 'weak' && ![primary.id, secondary.id, third?.id].includes(o.id),
  );
  if (weak) ctx.repos.setOpportunityStatus(weak.id, 'hidden');

  startComparison(ctx, project.id, [primary.id, secondary.id]);
  await drain();
  startDeepInvestigation(ctx, project.id, primary.id);
  await drain();
  const decision = ctx.repos.listDecisions(project.id)[0];
  if (!decision) throw new Error('demo seed: no decision produced');
  recordUserDecision(ctx, project.id, decision.id, {
    decision: 'BUILD',
    rationale:
      'DEMO: the human accepts the recommendation; the behavioural evidence is strong and the first wedge is cheap to test.',
  });
  const pkg = await createBuildPackage(ctx, project.id, decision.id);
  return {
    projectId: project.id,
    opportunityId: primary.id,
    decisionId: decision.id,
    buildPackageId: pkg.id,
  };
}
