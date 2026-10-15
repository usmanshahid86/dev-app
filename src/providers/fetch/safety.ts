/**
 * URL safety for fetching untrusted search-result URLs (SSRF defence).
 * - only http/https; no userinfo
 * - hostname must not be localhost / loopback / private / link-local / CGNAT / metadata / unspecified / multicast
 * - the hostname is resolved first and EVERY resolved address is checked (dns.lookup all:true)
 * Residual limitation: the connection is made by hostname after the check, so a DNS answer that changes
 * between our lookup and the socket connect (DNS rebinding) is not fully prevented. Documented in
 * docs/EVIDENCE-PIPELINE.md.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface UrlCheck {
  ok: boolean;
  reason?: string;
}

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  'instance-data',
  'ip6-localhost',
  'ip6-loopback',
]);

export function isPrivateIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p as [number, number, number, number];
  if (a === 0) return true; // unspecified / "this network"
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0 && p[2] === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

export function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase().split('%')[0]!;
  if (s === '::' || s === '::1') return true;
  if (s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb')) return true; // link-local fe80::/10
  if (s.startsWith('fc') || s.startsWith('fd')) return true; // unique local fc00::/7
  if (s.startsWith('ff')) return true; // multicast
  if (s.startsWith('::ffff:')) {
    const v4 = s.slice(7);
    return isIP(v4) === 4 ? isPrivateIPv4(v4) : true;
  }
  if (s.startsWith('2002:')) return true; // 6to4 — could embed private v4; reject conservatively
  if (s.startsWith('64:ff9b:')) return true; // NAT64 — same
  return false;
}

export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateIPv4(ip);
  if (v === 6) return isPrivateIPv6(ip);
  return true;
}

export function checkUrlSyntax(
  raw: string,
  opts: { allowLoopbackForTests?: boolean } = {},
): UrlCheck & { url?: URL } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'unparseable URL' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:')
    return { ok: false, reason: `scheme ${u.protocol} not allowed` };
  if (u.username || u.password) return { ok: false, reason: 'userinfo in URL not allowed' };
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return { ok: false, reason: 'empty host' };
  if (
    BLOCKED_HOSTS.has(host) ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    if (!(opts.allowLoopbackForTests && (host === 'localhost' || host.endsWith('.localhost'))))
      return { ok: false, reason: `host ${host} is blocked` };
  }
  if (isIP(host)) {
    const loop = host === '127.0.0.1' || host === '::1';
    if (isBlockedAddress(host) && !(opts.allowLoopbackForTests && loop))
      return { ok: false, reason: `address ${host} is not public` };
  }
  return { ok: true, url: u };
}

export type Lookup = (hostname: string) => Promise<string[]>;

export const defaultLookup: Lookup = async (hostname) => {
  const res = await dnsLookup(hostname, { all: true, verbatim: true });
  return res.map((r) => r.address);
};

/** Full check: syntax + resolve every address and reject if ANY is non-public. */
export async function checkUrlForFetch(
  raw: string,
  lookup: Lookup = defaultLookup,
  opts: { allowLoopbackForTests?: boolean } = {},
): Promise<UrlCheck & { url?: URL }> {
  const syn = checkUrlSyntax(raw, opts);
  if (!syn.ok || !syn.url) return syn;
  const host = syn.url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return syn;
  let addrs: string[];
  try {
    addrs = await lookup(host);
  } catch (err) {
    return { ok: false, reason: `DNS lookup failed: ${(err as Error).message}` };
  }
  if (!addrs.length) return { ok: false, reason: 'DNS returned no addresses' };
  for (const a of addrs) {
    const loop = a === '127.0.0.1' || a === '::1';
    if (isBlockedAddress(a) && !(opts.allowLoopbackForTests && loop))
      return { ok: false, reason: `host resolves to non-public address ${a}` };
  }
  return syn;
}
