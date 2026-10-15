/**
 * Transparent, rule-based source classification. Category is descriptive, never a credibility score.
 * Confidence is 'high' for unambiguous host/path patterns, 'medium' for weaker hints, 'low' for 'other'.
 */
import { SourceCategory, type SourceCategoryValue } from './types';

export interface SourceClassification {
  category: SourceCategoryValue;
  confidence: 'high' | 'medium' | 'low';
  rule: string;
}

const FORUM_HOSTS = [
  'reddit.com',
  'news.ycombinator.com',
  'stackoverflow.com',
  'stackexchange.com',
  'discourse.',
  'community.',
  'forum.',
  'forums.',
  'discuss.',
  'lobste.rs',
  'indiehackers.com',
  'dev.to/t/',
];
const SOCIAL_HOSTS = [
  'twitter.com',
  'x.com',
  'linkedin.com',
  'mastodon.',
  'bsky.app',
  'threads.net',
  'facebook.com',
  'youtube.com',
  'tiktok.com',
];
const REVIEW_HOSTS = [
  'g2.com',
  'capterra.com',
  'trustpilot.com',
  'producthunt.com',
  'getapp.com',
  'trustradius.com',
  'gartner.com/reviews',
];
const NEWS_HOSTS = [
  'techcrunch.com',
  'theverge.com',
  'wired.com',
  'arstechnica.com',
  'reuters.com',
  'bloomberg.com',
  'nytimes.com',
  'theregister.com',
  'venturebeat.com',
  'zdnet.com',
  'bbc.',
  'theinformation.com',
  'axios.com',
];
const RESEARCH_HOSTS = [
  'arxiv.org',
  'acm.org',
  'ieee.org',
  'nature.com',
  'springer.com',
  'semanticscholar.org',
  'paperswithcode.com',
  'openreview.net',
];
const REG_HOSTS = [
  '.gov',
  '.gov.',
  'eur-lex.europa.eu',
  'europa.eu',
  'ec.europa.eu',
  'legislation.',
  'federalregister.gov',
  'nist.gov',
  'sec.gov',
];
const BLOG_HOSTS = [
  'medium.com',
  'substack.com',
  'hashnode.',
  'dev.to',
  'wordpress.com',
  'blogspot.',
  'ghost.io',
];
const MARKET_HOSTS = [
  'marketplace.',
  'apps.shopify.com',
  'chromewebstore.google.com',
  'marketplace.visualstudio.com',
  'wordpress.org/plugins',
  'npmjs.com',
  'pypi.org',
  'apps.apple.com',
  'play.google.com',
  'hub.docker.com',
  'marketplace.atlassian.com',
];

export function classifySource(url: string, title = ''): SourceClassification {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { category: 'other', confidence: 'low', rule: 'unparseable' };
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.toLowerCase();
  const full = `${host}${path}`;
  const t = title.toLowerCase();
  const has = (list: string[]) => list.some((h) => full.includes(h));

  if (host === 'github.com' || host === 'gitlab.com' || host.endsWith('.gitlab.com')) {
    if (/\/(issues|pull|pulls|discussions|merge_requests)(\/|$)/.test(path))
      return { category: 'issue_tracker', confidence: 'high', rule: 'forge issue/pr path' };
    if (/\/releases(\/|$)/.test(path) || /changelog/.test(path))
      return { category: 'changelog', confidence: 'high', rule: 'forge releases path' };
    if (path.split('/').filter(Boolean).length >= 2)
      return { category: 'repository', confidence: 'high', rule: 'forge repo path' };
  }
  if (/\/(pricing|plans|price)(\/|$)/.test(path) || /\bpricing\b/.test(t))
    return {
      category: 'pricing',
      confidence: /pricing|plans/.test(path) ? 'high' : 'medium',
      rule: 'pricing path/title',
    };
  if (
    /\/(changelog|release-notes|releases|whats-new|what-s-new)(\/|$)/.test(path) ||
    /\bchangelog\b|release notes/.test(t)
  )
    return { category: 'changelog', confidence: 'high', rule: 'changelog path/title' };
  if (
    /\/(issues?|tickets?|bugs?)\/\d+/.test(path) ||
    host.includes('jira.') ||
    host.includes('bugzilla.') ||
    host.includes('youtrack.')
  )
    return { category: 'issue_tracker', confidence: 'high', rule: 'issue path' };
  if (has(REG_HOSTS))
    return { category: 'regulatory_government', confidence: 'high', rule: 'government/regulatory host' };
  if (has(RESEARCH_HOSTS) || /\/benchmark/.test(path) || /\bbenchmark\b|\bsurvey\b|\bstudy\b/.test(t))
    return {
      category: 'research_benchmark',
      confidence: has(RESEARCH_HOSTS) ? 'high' : 'medium',
      rule: 'research host or benchmark/survey title',
    };
  if (
    has(MARKET_HOSTS) ||
    /\/marketplace(\/|$)|\/plugins(\/|$)|\/extensions(\/|$)|\/integrations(\/|$)/.test(path)
  )
    return { category: 'marketplace', confidence: 'high', rule: 'marketplace host/path' };
  if (has(REVIEW_HOSTS) || /\/reviews?(\/|$)|\/alternatives(\/|$)|\/compare(\/|$)|\/vs-/.test(path))
    return {
      category: 'review',
      confidence: has(REVIEW_HOSTS) ? 'high' : 'medium',
      rule: 'review host/path',
    };
  if (has(SOCIAL_HOSTS)) return { category: 'social', confidence: 'high', rule: 'social host' };
  if (has(FORUM_HOSTS) || /\/(forum|forums|community|discuss|discussions|threads?|t)\//.test(path))
    return { category: 'forum_community', confidence: 'high', rule: 'forum host/path' };
  if (has(NEWS_HOSTS) || host.startsWith('news.') || /\/news\//.test(path))
    return { category: 'news', confidence: has(NEWS_HOSTS) ? 'high' : 'medium', rule: 'news host/path' };
  if (
    host.startsWith('docs.') ||
    host.startsWith('developer.') ||
    host.startsWith('developers.') ||
    host.startsWith('learn.') ||
    host.startsWith('help.') ||
    host.startsWith('support.') ||
    /\/(docs|documentation|reference|api-reference|guide|guides|manual|help)(\/|$)/.test(path)
  )
    return { category: 'official_docs', confidence: 'high', rule: 'docs host/path' };
  if (
    has(BLOG_HOSTS) ||
    host.startsWith('blog.') ||
    /\/(blog|posts?|articles?)(\/|$)/.test(path) ||
    /\/\d{4}\/\d{2}\//.test(path)
  )
    return { category: 'blog', confidence: 'medium', rule: 'blog host/path' };
  return { category: 'other', confidence: 'low', rule: 'no rule matched' };
}

/** Sources a vendor publishes about itself vs. sources produced by others. Used only for the first/third-party mix display. */
export const FIRST_PARTY_CATEGORIES: SourceCategoryValue[] = [
  'official_docs',
  'pricing',
  'changelog',
  'repository',
  'marketplace',
];
export function isFirstParty(c: SourceCategoryValue): boolean {
  return FIRST_PARTY_CATEGORIES.includes(c);
}
export const ALL_SOURCE_CATEGORIES = SourceCategory.options;
