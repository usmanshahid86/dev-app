# Proposal: DOGFOOD-03 follow-up — fetch visibility, repeated fetch failures, agent-cost observability

Status: **approved with refinements and implemented** (V0.1.2). Refinements applied: exact-URL suppression only (404/410 permanent; 401/403 and empty text on documented cooldowns; timeout/5xx eligible), no domain statistics and no prompt changes, suppressions audited; cost accounting in three separate categories with CLI figures labelled API-equivalent, stable call ids, idempotent recompute; historical records read "unknown" rather than zero. DOGFOOD-03 artifacts, prompts, budgets, providers and scoring are untouched; candidate B stays at the agent's INVESTIGATE_FURTHER recommendation with no human decision recorded.

## 1. Page-retrieval visibility

### Confirmed defect

The retrieval strip reports search execution only. `RetrievalStrip` (`src/client/components/RetrievalStrip.tsx:18–23`) takes the `Investigation`, whose `retrieval` / `retrievalNote` (`src/domain/types.ts:447–448`) are copied from the run's search outcomes. Page-fetch outcomes are persisted on the run — `progress.pageFetchesSelected / Completed / Failed` (`types.ts:249–251`, written by `src/workflows/fetch.ts:65, 124–125`) and per evidence row (`fetchStatus`, `fetchError`, `fetchRunId`) — but neither the strip nor the brief header reads them. In DOGFOOD-03 the strip said "Fresh retrieval complete — 8 of 8 searches executed" while 4 of 8 page reads had failed; the only visible traces were per-source badges in the brief's sources list and the Research log.

### Smallest change (persisted facts only, no migration, `retrieval` keeps its meaning)

- **Data:** none. The project snapshot already carries `runs` (`src/workflows/projects.ts:164`) and `findings`. The strip can look up `snap.runs.find(r => r.id === inv.runId)` for fetch counts, and derive finding counts by `supportLevel` from `snap.findings` filtered to `inv.id`.
- **UI:** extend `RetrievalStrip` with two optional props (`run`, `findings`) and render three labelled lines beneath the existing headline:
  - _Searches:_ `succeeded / planned executed` (existing note).
  - _Pages:_ `completed of selected read; failed failed` (from `run.progress`), omitted when the run predates tracking or selected 0.
  - _Findings:_ `n full-page verified · n full page · n snippet-only · n inference` (from findings).
    Wire at the two call sites (`ResearchPage.tsx:99` comparison, `:250` brief). Historical runs: the five DOGFOOD-02 runs and the DOGFOOD-03 run all carry fetch counts, so the line renders for them; pre-V0.1 runs show "pages: not tracked".
- **Export:** `retrievalBanner` (`src/export/markdown.ts:15`) gains the same pages/findings lines; it already prints per-source fetch state (`:29–31`).
- **Status semantics:** unchanged. `retrieval` stays "did this run's searches execute". No composite "coverage" metric is introduced; fetch failure is shown as counts.

Scope: ~40 lines (`RetrievalStrip.tsx`, two call sites, `markdown.ts`). Compatibility: additive props; null-safe for runs without fetch tracking.

Acceptance tests: (1) fixture deep investigation where the fixture fetcher fails 1 of 3 selections → strip text contains "2 of 3 pages read, 1 failed" and the findings line; (2) run with `maxPageFetches: 0` → no pages line; (3) export banner carries the same lines; (4) live DOGFOOD-03 render shows "4 of 8 pages read, 4 failed" (verified via the jsdom harness, not committed).

## 2. Repeated page-fetch failures

### Facts from the persisted fetch history (DOGFOOD-02 attempts 1–5 and DOGFOOD-03)

| Measure                                                          | Value                                       |
| ---------------------------------------------------------------- | ------------------------------------------- |
| Page selections / completed / failed                             | 23 / 14 / 9                                 |
| reddit.com                                                       | 8 selected, 0 fetched, 8 × HTTP 403         |
| One URL (`reddit.com/r/LLMDevs/…/how_are_you_actually_testing…`) | selected in **6 of 6 runs**, failed 6 times |
| facebook.com                                                     | 1 selected, 0 fetched (no readable text)    |
| Every other domain (github.com, arxiv.org, 9 blogs/vendors)      | 14 selected, 14 fetched                     |
| Reddit sources available in the project                          | 27, none ever readable                      |

### Root cause (confirmed defect)

Eligibility for selection is `fetchStatus === 'snippet_only' || 'fetch_failed'` (`src/workflows/fetch.ts:30–31`). A failed source stays eligible forever, and the selection prompt (`src/providers/agent/ops/index.ts:285`) tells the agent "Only snippets are available so far" with no fetch history, so the agent re-chooses the most on-topic first-person thread every time. The per-candidate share of one page (comparison) or eight (deep) is then partly spent on a known-dead fetch. Nothing in the current behaviour is incorrect per the V0.1 design (decision 45 keeps inherited evidence eligible), but the history is not used.

### Minimal policy (recommend; do not implement yet)

1. **Do not re-select a URL that failed with a non-transient class.** Treat `fetch_failed` with `http_error: 403/401/404/410` or `empty` as _exhausted_ for that evidence row; keep `timeout`/`network`/5xx failures eligible for one more try. Implement as a filter in `fetch.ts:30–31` driven by the persisted `fetchError` prefix, no new column. The source remains in search results, in findings as snippet-only, and in the inspector — it is only removed from the _fetch_ candidate list.
2. **Tell the selector what is known.** Add one line per candidate in the selection prompt input: `fetch history: never tried | failed (HTTP 403) in N earlier runs`, built from `fetchStatus` + `fetchError`. This is information, not instruction; the prompt's own criteria stay. (Prompt-adjacent change; flag for review.)
3. **Domain-level advisory, not exclusion.** Compute from the project's events a per-domain `failed/selected` ratio and pass it as the same kind of note ("reddit.com: 0 of 8 earlier fetches succeeded"). Do not hard-block domains: Reddit may become readable (e.g. via `old.reddit.com` or a JSON endpoint — out of scope here) and 27 of the project's sources live there.
4. **Second-choice on failure (optional, larger).** When a selected fetch fails, allow `selectAndFetch` to pick the next-ranked eligible source within the same budget. Needs the selector to return an ordered list rather than exactly `maxFetches` items; defer.

Scope: 1–3 ≈ 30 lines in `fetch.ts` plus a prompt-input line and tests. Compatibility: no schema change; historical rows already carry `fetchError`.

Acceptance tests: (1) a candidate set containing an evidence row with `fetch_failed`/`HTTP 403` is not offered to the selector, while a `timeout` row is; (2) the selection input for a never-tried row says "never tried" and for a failed row names the error; (3) the fixture deep investigation still fetches its budget; (4) the DOGFOOD-02/03 history replayed through the filter would have excluded the 6-times-selected Reddit URL after its first 403.

## 3. Agent-cost observability

### Why DOGFOOD-03 has search cost but no agent cost

Search cost flows from the Jevlin envelope (`usage.cost_micros`) into `search_completed` events and is summed by the report scripts. Agent cost is produced by the providers — the Claude CLI adapter returns `meta.costUsd` (the CLI's own `total_cost_usd`), `durationMs`, `inputTokens`, `outputTokens` (`src/providers/agent/claudeCli.ts:79–82`); the Anthropic API adapter returns tokens only (`anthropicApi.ts:61–62`); the fixture returns `{demo: true}` — but `runAgent` (`src/workflows/runs.ts:15–33`) returns `.output` and discards `meta`. Nothing persists it. The DOGFOOD-01 smoke showed the CLI reports `total_cost_usd` (e.g. 0.02333 for one planDiscovery call); note that its `usage.input_tokens` excludes cache reads (the smoke showed `inputTokens: 2`), so tokens from the CLI are not a reliable basis for re-estimation — the CLI's dollar figure is.

### Smallest reliable change

- `runAgent` emits an `agent_call` event `{runId, op, provider, model, durationMs, costUsd?, inputTokens?, outputTokens?, retry}` from `meta` after each call (success and retry). No schema change: events are JSON.
- Add `progress.agentCost: { measuredUsd: number | null; estimatedUsd: number | null; calls: number; unknownCalls: number }` to the run (JSON, no migration). Rules: CLI `costUsd` → **measured** (summed as reported by the CLI); API tokens → **estimated** using a small price table keyed by model id with the table version recorded in the event (clearly labelled estimate); fixture or missing meta → **unknown**, counted in `unknownCalls`. Never mix the three into one number.
- Surface: run status line "agent: $0.21 measured (9 calls)" / "≈ $0.18 estimated" / "unknown (fixture)"; dogfood scripts sum `agent_call` events.

Scope: ~40 lines (`runs.ts`, `types.ts` progress schema, `RunStatus.tsx`, a `providers/agent/pricing.ts` table) plus tests. Compatibility: additive JSON fields, null for historical runs. Risk: the price table goes stale; mitigated by labelling as estimate and recording the table version.

Acceptance tests: (1) a stub provider returning `costUsd` → `measuredUsd` summed, `estimatedUsd` null; (2) tokens only → `estimatedUsd` computed, `measuredUsd` null; (3) fixture → both null, `unknownCalls === calls`; (4) `agent_call` event count equals calls + retries; (5) run status renders the three forms.

## 4. Classification

| Item                                                                              | Class                            |
| --------------------------------------------------------------------------------- | -------------------------------- |
| Strip omits page-fetch outcomes                                                   | confirmed defect (visibility)    |
| Failed fetches remain eligible and are re-selected; selector has no fetch history | confirmed defect (behaviour)     |
| Second-choice selection on fetch failure                                          | potential optimization           |
| Domain advisory                                                                   | potential optimization           |
| Agent cost discarded by `runAgent`                                                | confirmed defect (observability) |
| Reddit readability via alternate endpoints                                        | out of scope                     |

## 5. Estimated total scope

About 110–150 lines across six files, three test files, no migration. Order: §1 (safe, UI-only) → §3 (observability) → §2 items 1–2 (behaviour, touches a prompt input) after review.
