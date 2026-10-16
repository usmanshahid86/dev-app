# Proposal: honest retrieval status for comparison and investigation runs

Status: **approved with refinements (review of `b5613d0`) and implemented** as V0.1.1. Motivated by DOGFOOD-02 attempt 1, which produced 13 complete-looking findings and a full side-by-side comparison from zero successful searches.

## 0. Review decisions incorporated

| #   | Decision                                                                                                                                                    | Where it landed                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Retrieval execution status is separate from evidence provenance and from investigation completion; a successful empty search counts as executed             | `RetrievalStatus` + `QueryOutcomes` on `run.progress` and `investigations`; `succeededEmpty` counted; `retrieval` ≠ `status`                                                                                                      |
| 2   | Keep discovery origin and verification level separate; inherited evidence stays eligible for page fetch                                                     | `Finding.retrievalOrigin` (new/inherited/mixed/none/unknown) alongside `supportLevel`; page selection unchanged; packets labelled `NEW IN THIS RUN` / `INHERITED (also returned by this run)` / `INHERITED FROM EARLIER RESEARCH` |
| 3   | Replace "two consecutive refusals" with a bounded retry/wait policy honouring `retry_after_ms`; mark remaining queries skipped when the budget is exhausted | `executeQueries` (`search.ts`): `DEVAPP_SEARCH_RETRY_BUDGET_MS` (90 s), `DEVAPP_SEARCH_MAX_RETRIES_PER_QUERY` (1), default wait 5 s; `research_queries.status='skipped'`, `failure_code='retry_budget_exhausted'`                 |
| 4   | Prevent candidate-order bias with deterministic round-robin                                                                                                 | `interleave()` in `investigation.ts`: A1, B1, C1, A2, B2, C2; per-candidate budgets unchanged                                                                                                                                     |
| 5   | Retrieval status visible above the comparison table and the brief; zero-search runs must not look like completed fresh research                             | `RetrievalStrip` component; investigation `status='partial'` unless retrieval is complete; column header "provisional — no fresh search"; Markdown brief banner                                                                   |
| 6   | Distinguish successful-empty, rate-limited, transport, unattempted                                                                                          | `QueryOutcomes {succeeded, succeededEmpty, rateLimited, transportFailed, otherFailed, skipped, retries, waitedMs}`; per-query `failure_code`                                                                                      |
| 7   | Keep findings supported by inherited evidence; mark fresh-retrieval-dependent conclusions provisional                                                       | Findings persisted with `retrievalOrigin`; strip and column markers say "provisional"; nothing is dropped                                                                                                                         |
| 8   | Minimal; prompts/providers/budgets/scoring unchanged; regression tests for zero/partial/full/empty and rate limits at different positions                   | Only the packet header gained an origin label; `tests/workflows/retrieval.test.ts` (12 tests)                                                                                                                                     |

Dropped from the original proposal: item E (pacing interval) and item F (two-refusal termination), per decisions 3 and 8.

## 1. Diagnosis

### Why a zero-search run looked complete

1. **Search failures are counted, not acted on.** `src/workflows/search.ts:204–227` increments `failed`, records the query as failed, and continues. Only `login`/`connect`/`check_access` stop the loop (`:216–219`). A `rate_limited` error is `retryable: true, action: 'retry'`, so all six queries fail in ~2 s and `executeQueries` returns normally with `evidence: []`, `failed: 6`, no `fatal`.
2. **The comparison has no "did search produce anything" gate.** `runComparison` checks only `search.fatal` (`src/workflows/investigation.ts:224`) and then proceeds to `fetching_pages` (`:228`) and `comparing` (`:262`). Discovery has such a gate (`discovery.ts` stops with "no usable evidence"); comparison and deep investigation (`:390–403`) do not.
3. **Inherited evidence is merged into the candidate's allowed set without a label.** `allowedEvidence` (`investigation.ts:58`) returns the opportunity's discovery evidence plus this run's evidence in one map. `buildPackets` (`fetch.ts:132–150`) labels packets only `full_page` / `snippet_only`; it does not say whether the evidence came from this run. The agent therefore receives the same shape of input whether or not comparison search happened, and `compareOpportunities` is told to "compare using ONLY the evidence provided" (`ops/index.ts:~330`), which it does, confidently.
4. **Page selection runs on inherited evidence too.** `selectAndFetch` is called on the merged set (`investigation.ts:237–262`), so a zero-search run still fetched two pages from discovery results, producing `full_page_excerpt_verified` findings. Those support levels are correct for the _pages_ but say nothing about whether the _comparison_ searched.
5. **Run status is coarse and is not shown where the result is read.** `finishRun` (`runs.ts:97–100`) sets `partial` with the message "6 searches failed" (`investigation.ts:282–286`), but the Research page renders `RunStatus` only while a run is active (`ResearchPage.tsx:13, 34`); `ComparisonView` (`:56–64`) shows the table and summary with no run badge. The comparison summary text produced by the agent contains no statement about retrieval. Exports do not include comparisons.
6. **Finding support levels answer a different question.** `domain/findings.ts:72–76` computes support from the cited evidence's fetch state. A `snippet_only` finding over inherited discovery evidence and a `snippet_only` finding over newly retrieved evidence are indistinguishable. The evidence rows carry `runId` only via `evidence_discoveries` (`types.ts:287–292`), so provenance exists in the data but is never surfaced at the finding or packet level.

Net: nothing in the pipeline is wrong per se — every finding is validated, every excerpt verified — but "retrieval happened" is never a precondition or an output. The run record is the only honest signal, and it is one badge away from the result.

### Rate-limit behaviour (attempts 1–4)

- Router envelope on refusal: `ok:false, code:'rate_limited', retryable:true, action:'retry', http_status:429, retry_after_ms:<n>`. The adapter maps it faithfully (`providers/search/jevlin.ts:96–101`) but **drops `retry_after_ms`**: `SearchProviderError` has no field for it (`SearchProvider.ts`), the `search_failed` event (`search.ts:207`) records only `code` and `action`, and nothing waits.
- Measured allowance over the session (probes from outside the app): before the owner's change, exactly 1 accepted search per 60 s window; after, a burst bucket of about 6–7 requests that refills slowly (90 s quiet → 4 accepted; ≥4 min quiet → 6 accepted), far below the configured 1000/hour. Concurrency (15) was irrelevant because the app is sequential.
- The app's six comparison searches go out ~1.5 s apart (`search.ts` loop, bounded only by provider latency), so a half-empty bucket at launch loses the tail of the plan — always the last candidate (C in attempt 4), which biases partial runs against later candidates.
- Attempt 3's failure was self-inflicted: six pre-flight probes consumed the bucket seconds before launch. Attempt 1's was an exhausted quota that persisted ~2 h regardless of `retry_after_ms`.

## 2. Original proposal (superseded by §0 where they differ)

Each item is independent; (A)–(C) are the minimum to stop misreading; (D)–(F) address rate limiting. No prompt changes.

### A. Retrieval status on the run (requirement 1)

Add `retrieval: 'complete' | 'partial' | 'none'` to `ResearchRun.progress` (`types.ts` run schema; no migration, `progress` is JSON) computed in `executeQueries` from `completed`/`failed`:
`none` when `completed === 0`, `partial` when `0 < completed < planned`, `complete` otherwise. Keep `status` (`partial`/`completed`) as is; `retrieval` is the precise sub-signal. Also store `retrievalNote` ("0 of 6 searches succeeded; 6 rate-limited") built in `search.ts` where `failed++` happens, replacing the free-text "6 searches failed" at `investigation.ts:286`.

### B. Provenance on evidence packets and findings (requirement 2)

- `buildPackets` (`fetch.ts:132`) gains `origin: 'this_run' | 'inherited'`, decided by whether `evidence_discoveries` has a row for this `runId` (`repos.listDiscoveriesByRun` already exists). The packet header line (`ops/index.ts:114–115`) appends `| NEW IN THIS RUN` or `| INHERITED FROM DISCOVERY`. This is the only prompt-adjacent change and it adds information, not instruction.
- `Finding` gains `retrievalOrigin: 'new' | 'inherited' | 'mixed' | 'none'` computed in `persistFindings` (`investigation.ts`) from its evidence ids versus this run's discovery rows. Stored in the existing `excerpts`-style JSON pattern; one additive migration (`findings.retrieval_origin text default 'inherited'`).

### C. Surface it where results are read (requirements 3, 4, 5)

- `ComparisonView` (`ResearchPage.tsx:56`): render a status strip above the table from the run: `retrieval === 'none'` → red notice "No comparison search succeeded; this table was built from discovery evidence only" with the retrieval note; `partial` → amber notice listing which candidates got 0 searches; `complete` → single muted line. Same strip above the brief. Findings panel badge adds the origin: existing `SupportBadge` plus a small "inherited" tag when `retrievalOrigin !== 'new'`.
- `Investigation` gains `retrieval` copied from the run at completion so exports and snapshots carry it without a join; `renderProjectBrief` prints the same strip under the title (`markdown.ts:62`).
- **Gate, not block:** in `runComparison`/`runDeepInvestigation`, when `completed === 0` keep going (partial results stay useful) but (i) set `retrieval: 'none'`, (ii) skip page selection for candidates with zero new evidence _unless_ no page has ever been fetched for them (so inherited pages can still be read once), and (iii) mark `investigation.status` as `partial`, not `completed` (`investigation.ts:275`, `:410`). "Completed" then means "retrieval and synthesis both ran".

### D. Honour `retry_after_ms` once (requirement 6)

- `SearchProviderError` gains `retryAfterMs?: number`; the Jevlin adapter passes `env.retry_after_ms` (`jevlin.ts:96–101`); `search_failed` payload includes it.
- In `executeQueries`, on a `retryable` failure with `retryAfterMs ≤ 60_000`, wait that long and retry that query **once** (bounded: at most one wait per query, total added wall-clock ≤ planned × 60 s; emit `search_retry`). Record on the run `progress.searchRetries`. With the measured bucket this converts attempt-4-style runs (bucket 4) into complete runs at the cost of ~1 min.

### E. Pace, don't burst (requirement 6)

Add `DEVAPP_SEARCH_MIN_INTERVAL_MS` (default 0; recommended 2000 for this account) applied between queries in `executeQueries`. Deterministic, provider-neutral, no behaviour change unless set.

### F. Stop after repeated refusals

If two consecutive `rate_limited` refusals occur after the retry in (D), treat as fatal for the run (`search.ts:216` list gains `rate_limited` after retry exhaustion): the run ends `partial` with `retrieval: 'none'|'partial'` and _does not_ proceed to synthesis when `completed === 0`. Combined with (C) this prevents the attempt-1 case entirely while keeping attempt-4-style partial runs.

## 3. What this does not change

Planner, comparison and brief prompts (except the packet header label), providers and tiers, budgets, evidence scoring, excerpt verification. Discovery is untouched.

## 4. Tests to add

- `executeQueries`: retrieval classification (`none`/`partial`/`complete`); one retry on `retryAfterMs`; pacing interval; fatal after two refusals.
- Comparison with a search provider that always refuses: investigation `status === 'partial'`, `retrieval === 'none'`, no page fetches on inherited evidence beyond the first, findings carry `retrievalOrigin === 'inherited'`.
- Comparison with a provider refusing only the last two queries: candidate C flagged as "0 searches" in the run note.
- UI smoke: the notice strip renders for `none` and `partial`.
- Export: brief header carries the strip.

## 5. Effort and risk

About 150–200 lines across `search.ts`, `fetch.ts`, `investigation.ts`, `types.ts`, one additive migration, `ResearchPage.tsx`, `markdown.ts`, plus tests. Risk is low: additive fields with defaults; the only behavioural changes are the one-shot retry, optional pacing, and marking zero-retrieval investigations `partial`.
