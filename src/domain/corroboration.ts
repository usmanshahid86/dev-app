/**
 * Transparent corroboration / evidence-diversity characteristics. No composite score, by design:
 * every number here is a count the user can verify, and the summary is a templated sentence
 * explaining what the counts mean.
 */
import type { Corroboration, Evidence, EvidenceDiscovery, SourceCategoryValue } from './types';
import { isFirstParty } from './sourceCategory';

export function computeCorroboration(
  evidence: Evidence[],
  discoveries: EvidenceDiscovery[] = [],
): Corroboration {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const canonical = new Set(evidence.map((e) => e.canonicalUrl));
  const domains = new Set(evidence.map((e) => e.domain).filter(Boolean));
  const categoryMix: Partial<Record<SourceCategoryValue, number>> = {};
  let firstParty = 0;
  let thirdParty = 0;
  for (const e of evidence) {
    categoryMix[e.category] = (categoryMix[e.category] ?? 0) + 1;
    if (isFirstParty(e.category)) firstParty++;
    else thirdParty++;
  }
  const evidenceIds = new Set(evidence.map((e) => e.id));
  const discoveryCount = discoveries.filter((d) => evidenceIds.has(d.evidenceId)).length;
  const fetched = evidence.filter((e) => e.fetchStatus === 'fetched').length;
  const distinctTypes = Object.keys(categoryMix).filter((c) => c !== 'other').length;
  const summary = summarize({
    sources: canonical.size,
    domains: domains.size,
    distinctTypes,
    firstParty,
    thirdParty,
    fetched,
    total: evidence.length,
  });
  void byId;
  return {
    evidenceCount: evidence.length,
    canonicalSources: canonical.size,
    domains: domains.size,
    discoveries: discoveryCount || evidence.length,
    categoryMix,
    distinctSourceTypes: distinctTypes,
    firstParty,
    thirdParty,
    fetchedPages: fetched,
    summary,
  };
}

function summarize(x: {
  sources: number;
  domains: number;
  distinctTypes: number;
  firstParty: number;
  thirdParty: number;
  fetched: number;
  total: number;
}): string {
  if (x.total === 0) return 'No evidence.';
  const parts: string[] = [];
  if (x.sources === 1) parts.push('Rests on a single source');
  else if (x.domains === 1) parts.push(`${x.sources} sources, all from one domain`);
  else parts.push(`${x.sources} sources across ${x.domains} domains`);
  if (x.distinctTypes >= 3) parts.push(`${x.distinctTypes} independent source types`);
  else if (x.distinctTypes === 2) parts.push('two source types');
  else parts.push('one source type');
  if (x.firstParty > 0 && x.thirdParty > 0) parts.push('mix of first-party and third-party sources');
  else if (x.firstParty > 0) parts.push('first-party sources only (no independent confirmation)');
  else parts.push('third-party sources only (no first-party confirmation)');
  if (x.fetched > 0) parts.push(`${x.fetched} page${x.fetched === 1 ? '' : 's'} read in full`);
  return parts.join('; ') + '.';
}
