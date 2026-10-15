# Search integration (Jevlin)

## Boundary

`src/providers/search/SearchProvider.ts`:

```ts
interface SearchProvider {
  name: string; isDemo: boolean;
  search(query, { maxResults?, recency?, domainFilter?, timeoutMs? }): Promise<SearchResultSet>;
  healthCheck(): Promise<{ ok, message }>;
}
SearchResultSet = { provider, query, items: [{ url, title, snippet, position, providerMeta }], rawText, durationMs, isDemo, meta }
```

Workflows only consume `SearchResultSet`. `rawText` is persisted verbatim in `raw_responses`; `items` become `evidence` rows. `providerMeta` (e.g. Jevlin `found_by`, `best_rank`) is stored but never required by business logic.

## JevlinSearchProvider (`jevlin.ts`)

Wraps the stable local CLI contract established from the skill docs and verified with a live call:

```
jevlin search -config <jevlin.toml> --stdin   <<< {"version":1,"query":"…","view":"merged","max_results":n,"tier":"fast"}
```

- Query goes on **stdin** as JSON (never on argv).
- `view: "merged"` → `result.merged[]` (deduplicated cross-provider citations with `found_by`, `found_in`, `best_rank`). Fallback: `result.candidates[chosen].citations`.
- Envelope handling follows the contract exactly: `ok`, `retryable`, `action` ∈ none/retry/fix_input/connect/login/check_access/report. Message text is never interpreted. Failures become `SearchProviderError{code, retryable, action}`.
- `healthCheck()` runs `jevlin status -json` and reports whether the agent is claimed.
- Options: `max_results` (1–25), `recency`, `domain_filter` (≤16), `tier` from `JEVLIN_TIER`.
- Timeout 90 s per search (SIGKILL on expiry → retryable error).

Observed in the smoke test: fast tier, provider `serper`, latency ≈1.2–1.5 s, `usage.cost_micros` 3000 per search.

## How the workflow uses it

`workflows/search.ts::executeQueries` — persists planned queries, executes sequentially within the run budget, stores the raw envelope, normalizes evidence, records per-query status/duration/result count, and emits `search_completed`/`search_failed` events.

Failure policy:

- a retryable or `report` failure marks that query failed and continues (run ends `partial`);
- `login` / `connect` / `check_access` stops the run immediately and marks the remaining queries `skipped` — these will not fix themselves mid-run;
- zero evidence overall → run `failed` (if searches failed) or `completed` with zero opportunities (if searches returned nothing);
- **never** falls back to fixture data.

## FixtureSearchProvider (`fixture.ts`)

Deterministic keyword matcher over `fixtures/demo/corpus.ts` (23 pages under `https://demo.invalid/`, titles prefixed `[DEMO]`, `isDemo: true`). Used for tests, UI work and the seed. Unrelated queries return zero results, so the "no opportunities" path is reachable in demo mode too.

## Future providers / Jevlin improvements

Nothing outside `providers/search/` knows about Jevlin. A new tier, a `balanced` fan-out default, full-page fetching (`evidence.full_text` is reserved), or a different router only change the adapter or env config.
