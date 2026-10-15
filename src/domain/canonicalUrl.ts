/**
 * One canonicalization implementation for source identity. Deliberately conservative:
 * lowercase host, drop `www.`, drop fragment, drop userinfo, drop well-known tracking params,
 * drop default ports, normalize the trailing slash, sort remaining query params. Scheme and
 * meaningful query parameters are kept so that distinct documents stay distinct.
 */
const TRACKING_PARAMS = new Set([
  'ref',
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'yclid',
  '_hsenc',
  '_hsmi',
  'ref_src',
  'ref_url',
]);

export interface CanonicalResult {
  canonicalUrl: string;
  domain: string;
}

export function canonicalizeUrl(input: string): CanonicalResult | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.username = '';
  u.password = '';
  u.hash = '';
  let host = u.hostname.toLowerCase();
  if (host.startsWith('www.')) host = host.slice(4);
  u.hostname = host;
  if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443'))
    u.port = '';
  const keep: Array<[string, string]> = [];
  for (const [k, v] of u.searchParams.entries()) {
    const key = k.toLowerCase();
    if (key.startsWith('utm_') || TRACKING_PARAMS.has(key)) continue;
    keep.push([k, v]);
  }
  keep.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  u.search = '';
  for (const [k, v] of keep) u.searchParams.append(k, v);
  let path = u.pathname.replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  u.pathname = path || '/';
  return { canonicalUrl: u.toString(), domain: host };
}

export function domainOf(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.startsWith('www.') ? h.slice(4) : h;
  } catch {
    return '';
  }
}
