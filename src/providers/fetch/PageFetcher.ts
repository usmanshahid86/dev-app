/**
 * PageFetcher boundary: turns a search-result URL into readable page text. Workflows never call
 * HTTP directly. Search-result URLs are hostile input; see safety.ts.
 */
export interface FetchedPage {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  title: string | null;
  text: string;
  textTruncated: boolean;
  fetchedAt: string;
  contentHash: string;
  isDemo: boolean;
}

export type PageFetchFailureCode =
  | 'blocked_url'
  | 'blocked_redirect'
  | 'too_many_redirects'
  | 'timeout'
  | 'too_large'
  | 'unsupported_content'
  | 'http_error'
  | 'network'
  | 'empty'
  | 'unavailable';

export class PageFetchError extends Error {
  constructor(
    message: string,
    public readonly code: PageFetchFailureCode,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'PageFetchError';
  }
}

export interface PageFetcher {
  readonly name: string;
  readonly isDemo: boolean;
  fetchPage(url: string): Promise<FetchedPage>;
}

export interface PageFetchLimits {
  timeoutMs: number;
  maxRedirects: number;
  maxBodyBytes: number;
  maxTextChars: number;
}

export const DEFAULT_FETCH_LIMITS: PageFetchLimits = {
  timeoutMs: 15_000,
  maxRedirects: 5,
  maxBodyBytes: 2_000_000,
  maxTextChars: 60_000,
};
