/**
 * Rendered Markdown artifacts over structured research state. The Markdown is derived, never the
 * source of truth: PROJECT-BRIEF.md, PRODUCT-DECISION.md, BUILD-PACKAGE.md, AGENT-HANDOFF.md.
 */
import type { ProjectSnapshot } from '@workflows/projects';
import type {
  Evidence,
  Finding,
  ProductBrief,
  Decision,
  BuildPackage,
  Opportunity,
  ResearchRun,
} from '@domain/types';
import { SUPPORT_LEVEL_LABEL } from '@domain/findings';

const demoBanner = (snap: ProjectSnapshot) =>
  snap.project.mode === 'demo'
    ? '> **DEMO CONTENT** — generated from fixture providers. Sources are fake pages under demo.invalid and are not real web evidence.\n\n'
    : '';

/** Retrieval status of the investigation that produced an artifact; never silent. Three separate lines: searches, pages, findings. */
export function retrievalBanner(
  inv: { retrieval: string | null; retrievalNote: string | null } | undefined,
  run?: ResearchRun,
  findings: Finding[] = [],
): string {
  const pages = (() => {
    if (!run) return 'pages: unknown (run record not available)';
    const p = run.progress;
    if (!(p.retrieval !== null || p.pageFetchesSelected > 0))
      return 'pages: unknown (run predates fetch tracking)';
    if (run.budget.maxPageFetches === 0) return 'pages: none (this run does not fetch pages)';
    if (p.pageFetchesSelected === 0) return 'pages: none selected';
    return `pages: ${p.pageFetchesCompleted} of ${p.pageFetchesSelected} selected pages read${p.pageFetchesFailed ? `, ${p.pageFetchesFailed} failed` : ''}${p.pageFetchesSuppressed ? `, ${p.pageFetchesSuppressed} excluded by fetch policy` : ''}`;
  })();
  const order = ['full_page_excerpt_verified', 'full_page', 'snippet_only', 'inference'] as const;
  const fl = findings.length
    ? `findings: ${order
        .map((k) => [k, findings.filter((f) => f.supportLevel === k).length] as const)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${n} ${SUPPORT_LEVEL_LABEL[k].toLowerCase()}`)
        .join(' · ')}`
    : 'findings: none';
  const detail = `>\n> searches: ${inv?.retrievalNote ?? 'unknown'} · ${pages} · ${fl}\n\n`;
  if (!inv || inv.retrieval === null)
    return `> **Retrieval status unknown** — this artifact predates retrieval tracking; treat it as resting on earlier research only.\n${detail}`;
  if (inv.retrieval === 'complete') return `> Fresh retrieval complete — ${inv.retrievalNote}.\n${detail}`;
  if (inv.retrieval === 'partial')
    return `> **Fresh retrieval incomplete** — ${inv.retrievalNote}. Conclusions depending on the missing searches are provisional.\n${detail}`;
  return `> **No fresh search succeeded** — ${inv.retrievalNote}. This artifact was built from earlier research (inherited evidence) only; its conclusions are provisional.\n${detail}`;
}

function evidenceLine(e: Evidence): string {
  const fetch =
    e.fetchStatus === 'fetched'
      ? `page read in full${e.textTruncated ? ' (truncated)' : ''}`
      : e.fetchStatus === 'snippet_only'
        ? 'search snippet only'
        : `page not available (${e.fetchStatus})`;
  return `- [${e.id}] ${e.isDemo ? '[DEMO] ' : ''}${e.title} — ${e.canonicalUrl || e.url} · ${e.category} · ${fetch}`;
}

function findingLine(f: Finding, byId: Map<string, Evidence>): string {
  const refs = f.evidenceIds.map((id) => byId.get(id)).filter((x): x is Evidence => Boolean(x));
  const kind = f.kind === 'sourced_fact' ? 'sourced' : 'inference';
  const support = `${SUPPORT_LEVEL_LABEL[f.supportLevel]}; evidence origin: ${f.retrievalOrigin}`;
  const ex = f.excerpts
    .map(
      (x) =>
        `\n  > ${x.verified ? '' : '[UNVERIFIED] '}"${x.excerpt}" — ${x.evidenceId}${x.verified ? '' : ` (${x.note})`}`,
    )
    .join('');
  return `- **${f.id}** (${kind}, ${f.supportStrength}; support: ${support}) ${f.claim}${refs.length ? `\n  Evidence: ${refs.map((e) => `${e.id} <${e.canonicalUrl || e.url}>`).join(', ')}` : ''}${ex}`;
}

function replaceFindingMarkers(body: string): string {
  return body.replace(/\[F:(fnd_[a-z0-9]+)\]/g, (_m, id) => `[${id}]`);
}

export function latestBrief(snap: ProjectSnapshot): ProductBrief | undefined {
  const sel = snap.project.selectedOpportunityId;
  return snap.briefs.find((b) => !sel || b.opportunityId === sel) ?? snap.briefs[0];
}
export function latestDecision(snap: ProjectSnapshot): Decision | undefined {
  return snap.decisions[0];
}
export function latestBuildPackage(snap: ProjectSnapshot): BuildPackage | undefined {
  return snap.buildPackages[0];
}

export function renderProjectBrief(snap: ProjectSnapshot): string {
  const brief = latestBrief(snap);
  const evById = new Map(snap.evidence.map((e) => [e.id, e]));
  const opp = brief ? snap.opportunities.find((o) => o.id === brief.opportunityId) : undefined;
  if (!brief || !opp)
    return `# Project Brief — ${snap.project.title}\n\n${demoBanner(snap)}_No Product Brief has been generated yet._\n`;
  const findings = snap.findings.filter((f) => f.investigationId === brief.investigationId);
  const cited = new Set(findings.flatMap((f) => f.evidenceIds));
  const inv = snap.investigations.find((i) => i.id === brief.investigationId);
  const run = inv?.runId ? snap.runs.find((r) => r.id === inv.runId) : undefined;
  const out: string[] = [];
  out.push(`# Product Brief — ${opp.title}\n`);
  out.push(demoBanner(snap));
  out.push(retrievalBanner(inv, run, findings));
  out.push(`_Project: ${snap.project.title} · Brief v${brief.version} · Generated ${brief.createdAt}_\n`);
  out.push(`**Thesis:** ${opp.thesis}\n`);
  for (const [i, s] of brief.sections.entries()) {
    out.push(`## ${i + 1}. ${s.title}\n\n${replaceFindingMarkers(s.body)}\n`);
  }
  const levels = findings.reduce<Record<string, number>>(
    (acc, f) => (
      (acc[SUPPORT_LEVEL_LABEL[f.supportLevel]] = (acc[SUPPORT_LEVEL_LABEL[f.supportLevel]] ?? 0) + 1),
      acc
    ),
    {},
  );
  out.push(`## ${brief.sections.length + 1}. Findings\n`);
  out.push(
    `_Support: ${Object.entries(levels)
      .map(([k, v]) => `${v} × ${k.toLowerCase()}`)
      .join(', ')}. A search snippet and an inspected source page are not the same support._\n`,
  );
  out.push(findings.map((f) => findingLine(f, evById)).join('\n') + '\n');
  out.push(`## ${brief.sections.length + 2}. Sources\n`);
  out.push(
    [...cited]
      .map((id) => evById.get(id))
      .filter((e): e is Evidence => Boolean(e))
      .map(evidenceLine)
      .join('\n') + '\n',
  );
  return out.join('\n');
}

export function renderProductDecision(snap: ProjectSnapshot): string {
  const d = latestDecision(snap);
  const evById = new Map(snap.evidence.map((e) => [e.id, e]));
  const fById = new Map(snap.findings.map((f) => [f.id, f]));
  if (!d)
    return `# Product Decision — ${snap.project.title}\n\n${demoBanner(snap)}_No decision has been generated yet._\n`;
  const opp = snap.opportunities.find((o) => o.id === d.opportunityId) as Opportunity;
  const r = d.agentRecommendation;
  const fl = (ids: string[]) =>
    ids
      .map((id) => fById.get(id))
      .filter((f): f is Finding => Boolean(f))
      .map((f) => `  - ${findingLine(f, evById).replace(/^- /, '')}`)
      .join('\n');
  const out: string[] = [];
  out.push(`# Product Decision — ${opp?.title ?? d.opportunityId}\n`);
  out.push(demoBanner(snap));
  out.push(`## Agent recommendation\n\n**${r.recommendation}**\n\n${r.why}\n`);
  out.push(`## Human decision\n`);
  out.push(
    d.userDecision
      ? `**${d.userDecision}** recorded ${d.decidedAt}${d.userRationale ? `\n\nRationale: ${d.userRationale}` : ''}${d.userPivotDirection ? `\n\nPivot direction: ${d.userPivotDirection}` : ''}\n`
      : `_Not yet decided. The agent recommendation above is NOT a decision._\n`,
  );
  out.push(
    `## Context\n\n- **Target user:** ${r.targetUser}\n- **Problem:** ${r.problem}\n- **Proposed wedge:** ${r.proposedWedge}\n- **Why now:** ${r.whyNow}\n- **Existing alternatives:** ${r.existingAlternatives}\n- **Distribution hypothesis:** ${r.distributionHypothesis}\n- **Monetization hypothesis:** ${r.monetizationHypothesis}\n`,
  );
  out.push(`## Critical assumptions\n`);
  for (const a of r.criticalAssumptions) {
    out.push(`### ${a.id} — ${a.statement}\n\nStatus: **${a.status}**\n`);
    if (a.supportingFindingIds.length) out.push(`Evidence for:\n${fl(a.supportingFindingIds)}\n`);
    if (a.evidenceAgainstFindingIds.length)
      out.push(`Evidence against:\n${fl(a.evidenceAgainstFindingIds)}\n`);
  }
  out.push(`## Unknowns\n\n${r.unknowns.map((u) => `- ${u}`).join('\n')}\n`);
  out.push(
    `## What would change the decision\n\n${r.whatWouldChangeTheDecision.map((u) => `- ${u}`).join('\n')}\n`,
  );
  return out.join('\n');
}

export function renderBuildPackage(snap: ProjectSnapshot): string {
  const bp = latestBuildPackage(snap);
  if (!bp)
    return `# Build Package — ${snap.project.title}\n\n${demoBanner(snap)}_No build package has been generated yet._\n`;
  const d = snap.decisions.find((x) => x.id === bp.decisionId);
  const s = bp.sections;
  const fById = new Map(snap.findings.map((f) => [f.id, f]));
  const aById = new Map((d?.agentRecommendation.criticalAssumptions ?? []).map((a) => [a.id, a]));
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '_none_');
  const out: string[] = [];
  out.push(`# Build Package — ${snap.project.title}\n`);
  out.push(demoBanner(snap));
  out.push(
    `_Version ${bp.version} · Decision ${bp.decisionId} (${d?.userDecision ?? 'undecided'}) · Generated ${bp.createdAt}_\n`,
  );
  out.push(
    `## Product definition\n\n${s.productDefinition}\n\n**Target user:** ${s.targetUser}\n\n**Problem:** ${s.problem}\n\n**Value proposition:** ${s.valueProposition}\n`,
  );
  out.push(
    `## Evidence-backed rationale\n\n${s.evidenceBackedRationale}\n\n### Evidence-backed assumptions\n\n${list(s.evidenceBackedAssumptions)}\n`,
  );
  out.push(
    `## MVP scope\n\n${list(s.mvpScope)}\n\n## Non-goals\n\n${list(s.nonGoals)}\n\n## User flows\n\n${list(s.userFlows)}\n`,
  );
  out.push(`## Functional requirements\n`);
  for (const r of bp.requirements) {
    const trace: string[] = [];
    for (const id of r.assumptionIds)
      trace.push(`assumption ${id}${aById.get(id) ? ` ("${aById.get(id)!.statement}")` : ''}`);
    for (const id of r.findingIds)
      trace.push(`finding ${id}${fById.get(id) ? ` ("${fById.get(id)!.claim}")` : ''}`);
    out.push(
      `${r.number}. **[${r.priority.toUpperCase()}]** ${r.text}${trace.length ? `\n   - Traces to: ${trace.join('; ')}` : '\n   - Traces to: decision only'}`,
    );
  }
  out.push('');
  out.push(
    `## Technical design (PROPOSED — not market evidence)\n\n${s.architectureProposal}\n\n### Interfaces\n\n${list(s.interfaces)}\n\n### Data model\n\n${list(s.dataModel)}\n`,
  );
  out.push(
    `## Milestones\n\n${s.milestones.map((m, i) => `${i + 1}. **${m.title}** — ${m.description}`).join('\n')}\n`,
  );
  out.push(`## Acceptance criteria\n\n${list(s.acceptanceCriteria)}\n`);
  out.push(`## Risks\n\n${s.risks.map((r) => `- (${r.kind}) ${r.text}`).join('\n') || '_none_'}\n`);
  out.push(
    `## Open questions\n\n${list(s.openQuestions)}\n\n## Validation plan\n\n${list(s.validationPlan)}\n`,
  );
  return out.join('\n');
}

export function renderAgentHandoff(snap: ProjectSnapshot): string {
  const bp = latestBuildPackage(snap);
  const d = latestDecision(snap);
  const opp = d ? snap.opportunities.find((o) => o.id === d.opportunityId) : undefined;
  if (!bp || !d || !opp)
    return `# Agent Handoff — ${snap.project.title}\n\n${demoBanner(snap)}_No build package yet; nothing to hand off._\n`;
  const s = bp.sections;
  const out: string[] = [];
  out.push(`# Agent Handoff — ${opp.title}\n`);
  out.push(demoBanner(snap));
  out.push(
    `You are a coding agent asked to implement the MVP described below. Read BUILD-PACKAGE.md for full detail and PRODUCT-DECISION.md / PROJECT-BRIEF.md only when you need the research rationale. Do not re-run the research.\n`,
  );
  out.push(
    `## What to build\n\n${s.productDefinition}\n\nFor: ${s.targetUser}\n\nValue: ${s.valueProposition}\n`,
  );
  out.push(
    `## Scope\n\nIn scope:\n${s.mvpScope.map((x) => `- ${x}`).join('\n')}\n\nOut of scope (do not build):\n${s.nonGoals.map((x) => `- ${x}`).join('\n')}\n`,
  );
  out.push(
    `## Requirements (implement in order of priority)\n\n${bp.requirements.map((r) => `${r.number}. [${r.priority.toUpperCase()}] ${r.text}`).join('\n')}\n`,
  );
  out.push(
    `## Proposed architecture (you may deviate with justification)\n\n${s.architectureProposal}\n\nInterfaces:\n${s.interfaces.map((x) => `- ${x}`).join('\n') || '- none specified'}\n\nData model:\n${s.dataModel.map((x) => `- ${x}`).join('\n') || '- none specified'}\n`,
  );
  out.push(
    `## Milestones\n\n${s.milestones.map((m, i) => `${i + 1}. ${m.title}: ${m.description}`).join('\n')}\n`,
  );
  out.push(`## Definition of done\n\n${s.acceptanceCriteria.map((x) => `- [ ] ${x}`).join('\n')}\n`);
  out.push(
    `## Watch out for\n\n${
      s.risks
        .filter((r) => r.kind === 'engineering')
        .map((r) => `- ${r.text}`)
        .join('\n') || '- no engineering risks recorded'
    }\n`,
  );
  out.push(
    `## Open questions — ask the human before guessing\n\n${s.openQuestions.map((x) => `- ${x}`).join('\n') || '- none'}\n`,
  );
  return out.join('\n');
}

export function renderAll(snap: ProjectSnapshot): Record<string, string> {
  return {
    'PROJECT-BRIEF.md': renderProjectBrief(snap),
    'PRODUCT-DECISION.md': renderProductDecision(snap),
    'BUILD-PACKAGE.md': renderBuildPackage(snap),
    'AGENT-HANDOFF.md': renderAgentHandoff(snap),
  };
}
