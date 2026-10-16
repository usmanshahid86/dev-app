/**
 * Search provider boundary. The application only sees SearchResultSet; it never sees
 * Jevlin-specific shapes. Raw provider payloads are kept verbatim in `rawText` so they
 * can be persisted separately from normalized evidence.
 */
export interface SearchOptions {
  maxResults?: number;
  recency?: 'day' | 'week' | 'month' | 'year';
  domainFilter?: string[];
  timeoutMs?: number;
}

export interface SearchResultItem {
  url: string;
  title: string;
  snippet: string;
  /** 0-based position in the provider's result list, if available. */
  position: number | null;
  /** Provider-specific extras (e.g. found_by, best_rank). Never required by business logic. */
  providerMeta: Record<string, unknown> | null;
}

export interface SearchResultSet {
  provider: string;
  query: string;
  items: SearchResultItem[];
  /** Raw provider response as text, for separate persistence. */
  rawText: string;
  durationMs: number;
  isDemo: boolean;
  /** Provider-level metadata (request id, cost, tier...). */
  meta: Record<string, unknown>;
}

export type SearchFailureAction =
  'none' | 'retry' | 'fix_input' | 'connect' | 'login' | 'check_access' | 'report';

export class SearchProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly action: SearchFailureAction,
    public readonly rawText?: string,
    /** Router-suggested wait before retrying, when provided. */
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'SearchProviderError';
  }
}

export interface SearchProvider {
  readonly name: string;
  /** True only for fixture/demo providers. Demo data must always be labelled. */
  readonly isDemo: boolean;
  search(query: string, options?: SearchOptions): Promise<SearchResultSet>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}
