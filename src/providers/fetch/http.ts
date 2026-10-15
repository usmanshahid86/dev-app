/**
 * HttpPageFetcher — bounded, SSRF-guarded HTTP(S) retrieval of public HTML/text pages.
 * No JavaScript execution, no cookies, no credentials, manual redirect handling with per-hop checks,
 * byte cap enforced while streaming, timeout via AbortController, text/HTML only.
 */
import {
  DEFAULT_FETCH_LIMITS,
  PageFetchError,
  type FetchedPage,
  type PageFetchLimits,
  type PageFetcher,
} from './PageFetcher';
import { checkUrlForFetch, defaultLookup, type Lookup } from './safety';
import { extractFromHtml, extractFromPlainText } from './extract';

export interface HttpPageFetcherOptions {
  limits?: Partial<PageFetchLimits>;
  fetchImpl?: typeof fetch;
  lookup?: Lookup;
  /** Tests only: permit 127.0.0.1 / localhost so a local server can be used. Never set in production. */
  allowLoopbackForTests?: boolean;
  userAgent?: string;
}

const TEXT_TYPES = [
  'text/html',
  'application/xhtml+xml',
  'text/plain',
  'text/markdown',
  'application/xml',
  'text/xml',
];

export class HttpPageFetcher implements PageFetcher {
  readonly name = 'http';
  readonly isDemo = false;
  private readonly limits: PageFetchLimits;
  private readonly fetchImpl: typeof fetch;
  private readonly lookup: Lookup;
  private readonly allowLoopback: boolean;
  private readonly userAgent: string;

  constructor(opts: HttpPageFetcherOptions = {}) {
    this.limits = { ...DEFAULT_FETCH_LIMITS, ...opts.limits };
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.lookup = opts.lookup ?? defaultLookup;
    this.allowLoopback = Boolean(opts.allowLoopbackForTests);
    this.userAgent = opts.userAgent ?? 'dev-app-research/0.1 (+evidence fetcher; no JS; text only)';
  }

  async fetchPage(requestedUrl: string): Promise<FetchedPage> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.limits.timeoutMs);
    try {
      let current = requestedUrl;
      for (let hop = 0; hop <= this.limits.maxRedirects; hop++) {
        const check = await checkUrlForFetch(current, this.lookup, {
          allowLoopbackForTests: this.allowLoopback,
        });
        if (!check.ok)
          throw new PageFetchError(
            `${hop === 0 ? 'blocked URL' : 'blocked redirect target'}: ${check.reason}`,
            hop === 0 ? 'blocked_url' : 'blocked_redirect',
          );
        let res: Response;
        try {
          res = await this.fetchImpl(current, {
            method: 'GET',
            redirect: 'manual',
            signal: controller.signal,
            headers: {
              'user-agent': this.userAgent,
              accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
            },
            credentials: 'omit',
          } as RequestInit);
        } catch (err) {
          if ((err as Error).name === 'AbortError')
            throw new PageFetchError(`timed out after ${this.limits.timeoutMs}ms`, 'timeout');
          throw new PageFetchError(`network error: ${(err as Error).message}`, 'network');
        }
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get('location');
          try {
            await res.body?.cancel();
          } catch {
            /* ignore */
          }
          if (!loc)
            throw new PageFetchError(`redirect ${res.status} without location`, 'http_error', res.status);
          if (hop === this.limits.maxRedirects)
            throw new PageFetchError(`more than ${this.limits.maxRedirects} redirects`, 'too_many_redirects');
          current = new URL(loc, current).toString();
          continue;
        }
        if (res.status < 200 || res.status >= 300) {
          try {
            await res.body?.cancel();
          } catch {
            /* ignore */
          }
          throw new PageFetchError(`HTTP ${res.status}`, 'http_error', res.status);
        }
        const ct = (res.headers.get('content-type') ?? '').toLowerCase();
        const base = ct.split(';')[0]!.trim();
        if (!TEXT_TYPES.includes(base)) {
          try {
            await res.body?.cancel();
          } catch {
            /* ignore */
          }
          throw new PageFetchError(
            `unsupported content type ${base || '(none)'}`,
            'unsupported_content',
            res.status,
          );
        }
        const declared = Number(res.headers.get('content-length') ?? '0');
        if (declared > this.limits.maxBodyBytes) {
          try {
            await res.body?.cancel();
          } catch {
            /* ignore */
          }
          throw new PageFetchError(
            `body ${declared} bytes exceeds limit ${this.limits.maxBodyBytes}`,
            'too_large',
            res.status,
          );
        }
        const raw = await this.readBounded(res, controller);
        const isHtml =
          base === 'text/html' ||
          base === 'application/xhtml+xml' ||
          /^\s*<!doctype html|<html/i.test(raw.slice(0, 500));
        const extracted = isHtml
          ? extractFromHtml(raw, current, this.limits.maxTextChars)
          : extractFromPlainText(raw, this.limits.maxTextChars);
        if (!extracted.text) throw new PageFetchError('no readable text', 'empty', res.status);
        return {
          requestedUrl,
          finalUrl: current,
          status: res.status,
          contentType: base,
          title: extracted.title,
          text: extracted.text,
          textTruncated: extracted.truncated,
          fetchedAt: new Date().toISOString(),
          contentHash: extracted.hash,
          isDemo: false,
        };
      }
      throw new PageFetchError('redirect loop', 'too_many_redirects');
    } finally {
      clearTimeout(timer);
    }
  }

  private async readBounded(res: Response, controller: AbortController): Promise<string> {
    const reader = res.body?.getReader();
    if (!reader) return await res.text();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > this.limits.maxBodyBytes) {
            controller.abort();
            throw new PageFetchError(
              `body exceeds limit ${this.limits.maxBodyBytes} bytes`,
              'too_large',
              res.status,
            );
          }
          chunks.push(value);
        }
      }
    } catch (err) {
      if (err instanceof PageFetchError) throw err;
      if ((err as Error).name === 'AbortError')
        throw new PageFetchError(`timed out after ${this.limits.timeoutMs}ms`, 'timeout');
      throw new PageFetchError(`read error: ${(err as Error).message}`, 'network');
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
  }
}
