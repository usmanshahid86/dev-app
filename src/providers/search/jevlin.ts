/**
 * JevlinSearchProvider — wraps the stable local Jevlin CLI contract:
 *
 *   jevlin search -config <toml> --stdin   <  {"version":1,"query":"...", ...}
 *
 * One JSON envelope comes back on stdout. We honour `ok` / `retryable` / `action` exactly
 * as the CLI documents them and never infer anything from message text.
 * The query goes on stdin, never on the command line.
 */
import { spawn } from 'node:child_process';
import {
  SearchProviderError,
  type SearchFailureAction,
  type SearchOptions,
  type SearchProvider,
  type SearchResultItem,
  type SearchResultSet,
} from './SearchProvider';

export interface JevlinConfig {
  bin: string;
  configPath: string;
  tier?: string;
  defaultTimeoutMs?: number;
  /** Hard cap on max_results sent to the router. 20 observed as the largest honoured value on the fast tier. */
  maxResultsLimit?: number;
}

interface JevlinEnvelope {
  version: number;
  command: string;
  ok: boolean;
  exit_code?: number;
  status?: string;
  code?: string;
  retryable?: boolean;
  action?: SearchFailureAction;
  request_id?: string;
  error?: { message?: string };
  retry_after_ms?: number;
  result?: {
    request_id?: string;
    chosen?: number;
    latency_ms?: number;
    decision?: unknown;
    usage?: { cost_micros?: number; latency_ms?: number };
    merged?: Array<{
      url: string;
      title?: string;
      snippet?: string;
      found_by?: string[];
      found_in?: unknown[];
      best_rank?: number;
    }>;
    candidates?: Array<{ citations?: Array<{ url: string; title?: string; snippet?: string }> }>;
  };
  mining?: unknown;
}

export class JevlinSearchProvider implements SearchProvider {
  readonly name = 'jevlin';
  readonly isDemo = false;

  constructor(private readonly cfg: JevlinConfig) {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResultSet> {
    const request: Record<string, unknown> = { version: 1, query, view: 'merged' };
    const limit = this.cfg.maxResultsLimit ?? 20;
    if (options.maxResults) request.max_results = Math.min(limit, Math.max(1, options.maxResults));
    if (options.recency) request.recency = options.recency;
    if (options.domainFilter?.length) request.domain_filter = options.domainFilter.slice(0, 16);
    if (this.cfg.tier) request.tier = this.cfg.tier;

    const started = Date.now();
    const { stdout, stderr, exitCode } = await this.exec(
      ['search', '-config', this.cfg.configPath, '--stdin'],
      JSON.stringify(request),
      options.timeoutMs ?? this.cfg.defaultTimeoutMs ?? 90_000,
    );
    const durationMs = Date.now() - started;

    let env: JevlinEnvelope;
    try {
      env = JSON.parse(stdout) as JevlinEnvelope;
    } catch {
      throw new SearchProviderError(
        `Jevlin returned no JSON envelope (exit ${exitCode}). ${stderr.slice(0, 300)}`,
        this.name,
        'no_envelope',
        false,
        'report',
        stdout || stderr,
      );
    }
    if (!env.ok) {
      throw new SearchProviderError(
        env.error?.message ?? `Jevlin search failed (${env.code ?? 'unknown'})`,
        this.name,
        env.code ?? 'unknown',
        Boolean(env.retryable),
        env.action ?? 'report',
        stdout,
        typeof env.retry_after_ms === 'number' ? env.retry_after_ms : undefined,
      );
    }
    const items = normalizeJevlin(env);
    // A router answer with no chosen provider and no results means no provider actually ran
    // (observed with max_results above the fast-tier limit). Surface it instead of recording an empty success.
    if (items.length === 0 && typeof env.result?.chosen === 'number' && env.result.chosen < 0) {
      throw new SearchProviderError(
        'Jevlin returned ok but no provider answered (chosen=-1, empty merged list)',
        this.name,
        'no_provider_answer',
        true,
        'retry',
        stdout,
      );
    }
    return {
      provider: this.name,
      query,
      items,
      rawText: stdout,
      durationMs,
      isDemo: false,
      meta: {
        requestId: env.request_id ?? env.result?.request_id,
        decision: env.result?.decision,
        costMicros: env.result?.usage?.cost_micros,
        latencyMs: env.result?.latency_ms,
      },
    };
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const { stdout } = await this.exec(['status', '-json', '-config', this.cfg.configPath], '', 20_000);
      const env = JSON.parse(stdout) as {
        ok?: boolean;
        data?: { agent?: { status?: string; claimed?: boolean } };
      };
      if (!env.ok) return { ok: false, message: 'jevlin status reported not ok' };
      const agent = env.data?.agent;
      if (agent && agent.claimed === false)
        return { ok: false, message: 'Jevlin agent not claimed; run `jevlin connect`' };
      return { ok: true, message: `jevlin ok (agent ${agent?.status ?? 'unknown'})` };
    } catch (err) {
      return { ok: false, message: `jevlin unavailable: ${(err as Error).message}` };
    }
  }

  private exec(
    args: string[],
    stdin: string,
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(this.cfg.bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (err) {
        reject(
          new SearchProviderError(
            `cannot start jevlin: ${(err as Error).message}`,
            this.name,
            'spawn',
            false,
            'report',
          ),
        );
        return;
      }
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(
          new SearchProviderError(
            `jevlin timed out after ${timeoutMs}ms`,
            this.name,
            'timeout',
            true,
            'retry',
          ),
        );
      }, timeoutMs);
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(
          new SearchProviderError(
            `jevlin not available: ${err.message}`,
            this.name,
            'spawn',
            false,
            'report',
          ),
        );
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code });
      });
      if (stdin) child.stdin.write(stdin);
      child.stdin.end();
    });
  }
}

/** Pure normalization of a Jevlin envelope into provider-neutral items. Exported for tests. */
export function normalizeJevlin(env: JevlinEnvelope): SearchResultItem[] {
  const merged = env.result?.merged;
  if (Array.isArray(merged) && merged.length) {
    return merged
      .filter((m) => typeof m.url === 'string' && m.url.length > 0)
      .map((m, i) => ({
        url: m.url,
        title: (m.title ?? '').trim() || m.url,
        snippet: (m.snippet ?? '').trim(),
        position: typeof m.best_rank === 'number' ? m.best_rank : i,
        providerMeta: {
          foundBy: m.found_by ?? [],
          bestRank: m.best_rank ?? null,
          foundIn: m.found_in ?? null,
        },
      }));
  }
  // Fallback for a "full" view: take the chosen candidate's citations.
  const chosen = env.result?.chosen ?? 0;
  const cits = env.result?.candidates?.[chosen]?.citations ?? [];
  return cits
    .filter((c) => typeof c.url === 'string' && c.url.length > 0)
    .map((c, i) => ({
      url: c.url,
      title: (c.title ?? '').trim() || c.url,
      snippet: (c.snippet ?? '').trim(),
      position: i,
      providerMeta: { candidate: chosen },
    }));
}
