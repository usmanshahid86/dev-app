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
- Options: `max_results` (clamped to `JEVLIN_MAX_RESULTS_LIMIT`, default 20), `recency`, `domain_filter` (≤16), `tier` from `JEVLIN_TIER`.
- Timeout 90 s per search (SIGKILL on expiry → retryable error).
- An `ok: true` envelope with `chosen: -1` and an empty merged list means no provider ran. The adapter raises a retryable `no_provider_answer` error instead of recording an empty success.

### Result depth (V0.1 probe, 2026-10-15, fast tier, provider `serper`)

| `max_results` requested | merged results returned | `chosen` | cost_micros              |
| ----------------------- | ----------------------- | -------- | ------------------------ |
| 8 (V0 default)          | 8                       | 0        | 3000                     |
| 10                      | 10                      | 0        | 3000                     |
| 20                      | 10                      | 0        | 3000                     |
| 25                      | **0**                   | **-1**   | (none — no provider ran) |

The fast tier returns at most 10 merged results per query regardless of a higher cap; cost is per search,
not per result. V0's cap of 8 silently discarded results 9–10. V0.1 therefore requests 20 by default
(`DEVAPP_DISCOVERY_MAX_RESULTS_PER_QUERY=20`): the full fast-tier page today, and room for the balanced
tier's fan-out without code changes. 25 is not used because the router answered with no provider at all.
Provider composition and tiers are unchanged; nothing is truncated below what the router returns.

## How the workflow uses it

`workflows/search.ts::executeQueries` — persists planned queries, executes sequentially within the run budget, stores the raw envelope, canonicalizes every result into one evidence row per canonical URL with an `evidence_discoveries` row per (query, result) (rediscoveries preserved), classifies the source, records per-query status/duration/result count, and emits `search_completed`/`search_failed`/`search_result_persisted`/`source_canonicalized`/`source_rediscovered` events. See docs/EVIDENCE-PIPELINE.md.

Failure policy:

- a retryable or `report` failure marks that query failed and continues (run ends `partial`);
- `login` / `connect` / `check_access` stops the run immediately and marks the remaining queries `skipped` — these will not fix themselves mid-run;
- zero evidence overall → run `failed` (if searches failed) or `completed` with zero opportunities (if searches returned nothing);
- **never** falls back to fixture data.

## FixtureSearchProvider (`fixture.ts`)

Deterministic keyword matcher over `fixtures/demo/corpus.ts` (23 pages under `https://demo.invalid/`, titles prefixed `[DEMO]`, `isDemo: true`). Used for tests, UI work and the seed. Unrelated queries return zero results, so the "no opportunities" path is reachable in demo mode too.

## Page fetching is a separate boundary

Full-page retrieval is not part of search: `providers/fetch/` (PageFetcher) reads selected sources after discovery under explicit budgets. See docs/EVIDENCE-PIPELINE.md §6.

## Future providers / Jevlin improvements

Nothing outside `providers/search/` knows about Jevlin. A new tier, a `balanced` fan-out default, or a different router only change the adapter or env config. Search Experiment 2 decides depth/provider questions; the app retains whatever the router returns.
