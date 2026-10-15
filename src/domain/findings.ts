/**
 * Programmatic finding validation. The agent proposes findings; this module decides what may be
 * persisted and how well it is supported. Nothing here trusts the agent's own labels beyond `kind`.
 */
import type { Evidence, FindingKind, SupportLevel, SupportingExcerpt, SupportStrength } from './types';
import { checkExcerpt } from './excerpts';

export interface ProposedFinding {
  key: string;
  section: string;
  claim: string;
  kind: FindingKind;
  supportStrength: SupportStrength;
  evidenceIds: string[];
  excerpts?: Array<{ evidenceId: string; excerpt: string }>;
}

export interface ValidatedFinding {
  key: string;
  section: string;
  claim: string;
  kind: FindingKind;
  supportStrength: SupportStrength;
  evidenceIds: string[];
  supportLevel: SupportLevel;
  excerpts: SupportingExcerpt[];
  /** Human-readable audit notes (dropped ids, demotions, rejected excerpts). */
  notes: string[];
}

/**
 * @param allowed evidence the finding may cite (same project; same investigation context)
 */
export function validateFinding(f: ProposedFinding, allowed: Map<string, Evidence>): ValidatedFinding {
  const notes: string[] = [];
  const evidenceIds = [...new Set(f.evidenceIds)].filter((id) => {
    const ok = allowed.has(id);
    if (!ok) notes.push(`dropped unknown evidence id ${id}`);
    return ok;
  });
  const excerpts: SupportingExcerpt[] = [];
  for (const ex of f.excerpts ?? []) {
    const ev = allowed.get(ex.evidenceId);
    if (!ev) {
      notes.push(`excerpt rejected: unknown evidence ${ex.evidenceId}`);
      continue;
    }
    if (!evidenceIds.includes(ex.evidenceId)) {
      notes.push(`excerpt rejected: evidence ${ex.evidenceId} is not cited by the finding`);
      continue;
    }
    const check = checkExcerpt(
      ex.excerpt,
      ev.fetchStatus === 'fetched' ? ev.fullText : null,
      `${ev.title}\n${ev.snippet}`,
    );
    excerpts.push({
      evidenceId: ex.evidenceId,
      excerpt: ex.excerpt.slice(0, 600),
      verified: check.verified,
      note: check.verified ? check.against : `not verified: ${check.reason}`,
    });
    if (!check.verified) notes.push(`excerpt for ${ex.evidenceId} could not be validated (${check.reason})`);
  }
  let kind = f.kind;
  if (kind === 'sourced_fact' && evidenceIds.length === 0) {
    kind = 'inference';
    notes.push('demoted to inference: sourced_fact with no valid evidence');
  }
  const cited = evidenceIds.map((id) => allowed.get(id)!);
  let supportLevel: SupportLevel;
  if (kind === 'inference') supportLevel = 'inference';
  else if (excerpts.some((x) => x.verified && x.note === 'full_page'))
    supportLevel = 'full_page_excerpt_verified';
  else if (cited.some((e) => e.fetchStatus === 'fetched')) supportLevel = 'full_page';
  else supportLevel = 'snippet_only';
  return {
    key: f.key,
    section: f.section,
    claim: f.claim,
    kind,
    supportStrength: f.supportStrength,
    evidenceIds,
    supportLevel,
    excerpts,
    notes,
  };
}

export function validateFindings(
  list: ProposedFinding[],
  allowed: Map<string, Evidence>,
): ValidatedFinding[] {
  return list.map((f) => validateFinding(f, allowed));
}

export const SUPPORT_LEVEL_LABEL: Record<SupportLevel, string> = {
  full_page_excerpt_verified: 'Full page, excerpt verified',
  full_page: 'Full page read',
  snippet_only: 'Search snippet only',
  inference: 'Model inference',
};
