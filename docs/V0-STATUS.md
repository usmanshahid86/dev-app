# Status (V0 → V0.1)

## V0.1 — trustworthy opportunity discovery (added 2026-10-15)

Working and tested:

- **Canonical sources + discovery provenance**: one evidence row per canonical URL per project, an `evidence_discoveries` row per (query, result); the inspector lists every query that found a source. V0 rows backfilled on upgrade.
- **Source classification**: 14 rule-based categories with confidence; shown on evidence, in the brief's sources list and in corroboration mixes.
- **Cross-batch consolidation**: raw signals kept; consolidated signals carry component ids, evidence union and transparent stats; clusters/opportunities cite consolidated signals only. Programmatic guards against invented ids and double use.
- **Corroboration**: counts (sources, domains, discoveries, category mix, source types, first/third-party, pages read) plus a templated sentence on every consolidated signal and opportunity card. No composite score.
- **Selective full-page retrieval**: `PageFetcher` boundary; SSRF-guarded HTTP fetcher (scheme/host/IP/DNS/redirect/size/timeout/content-type checks, no JS, Readability extraction, hash, truncation flag); per-run budgets (discovery 0, comparison 4, deep 8, validation 3); agent chooses sources under budget; fetch state and errors persisted on evidence.
- **Evidence packets + validated findings**: agents reason from bounded page text where fetched; every finding passes programmatic validation (unknown ids dropped, fact→inference demotion, excerpt verification against the cited record's own text); computed `supportLevel` with four levels, shown in UI and exports.
- **Research Inspector**: finding → fact/inference → support → excerpts → evidence (category, fetch state, retained text) → discoveries → signals → opportunity; evidence usage flags; "other results from the same search" labelled as not necessarily relevant or used.
- **Telemetry**: 13 new event types (docs/TELEMETRY.md) incl. excerpt verified/rejected and agent retries.
- **Jevlin depth**: requests 20 results per query (fast tier returns ≤10; V0's cap of 8 dropped results); empty `chosen=-1` answers surfaced as failures.
- **Migration 0001 + backfill**, tested fresh and V0 → V0.1 (`tests/db/migration.test.ts`), applied to the real `data/devapp.sqlite`.
- **Tests**: 139 (was 44).
- **Dogfood**: one bounded real-mode discovery run; see docs/DOGFOOD-01.md.

Known limitations (material):

- DNS rebinding between the pre-check and the socket connect is not prevented (docs/EVIDENCE-PIPELINE.md §6).
- A run interrupted by process exit stays `running` until marked by hand (happened in dogfood attempt 1); no startup sweep yet.
- One agent retry, no repair prompt; the fixture agent's consolidation is phenomenon-keyed and only exercises the guards, not agent judgement.
- Source classification is rule-based; real-world `other` rate is high (see DOGFOOD-01).
- Page text is retained up to 60k chars; packets hand the agent only the first 3000 chars of each fetched page, so long pages are effectively sampled from the top.
- Comparison splits a small fetch budget across candidates (4 ÷ 2–3), so comparative findings are mostly snippet-level.

---

# V0 status (unchanged below)

## Working (end to end, tested)

- **Discovery with no idea**: optional profile → `planDiscovery` → budgeted searches → evidence (raw + normalized) → signals (observation vs inference, evidence ids) → clusters (with rationale) → 3–10 opportunity cards with six categorical dimensions. Deterministic in demo mode; real-provider path exercised via smoke scripts (Jevlin + Claude CLI).
- **"I already have a direction"**: seeds discovery queries from the direction and produces a `seeded` card only when evidence supports it.
- **Opportunity board**: sort by any single dimension, filter by evidence strength, hide/reject/mark interesting, expand card to see signals → evidence chips, select 2–3 to compare, investigate one.
- **Evidence inspector**: title, URL, snippet, discovering query, provider meta, raw provider response, signals extracted, opportunities built on it, findings citing it, other evidence from the same search (labelled "not necessarily relevant"). Records `evidence_viewed`.
- **Comparative investigation**: per-candidate bounded searches, findings, side-by-side table, neutral summary, "investigate deeply" / "reject all".
- **Deep investigation → Product Brief**: 12 fixed sections over separately persisted findings (sourced_fact / inference) with `[F:id]` citations; sources list rendered from evidence.
- **Research inspector**: finding → evidence cited → source → query → other evidence from the same search.
- **Decision artifact**: agent recommendation (BUILD / INVESTIGATE_FURTHER / PIVOT / REJECT) with assumptions + evidence for/against + unknowns + what would change it; **separate human decision** with rationale; build package gated on BUILD/PIVOT.
- **Build package**: all required sections, numbered requirements each traced to decision / assumption ids / finding ids; versioned.
- **Exports**: `PROJECT-BRIEF.md`, `PRODUCT-DECISION.md`, `BUILD-PACKAGE.md`, `AGENT-HANDOFF.md` rendered from structured state, DEMO banner when applicable.
- **Validation re-check**: fresh bounded search, new evidence recorded separately, assumption statuses, verdict CONTINUE/CHANGE_WEDGE/PIVOT/STOP; original artifacts untouched; versioned.
- **Workflow state machine** with backward navigation that deletes nothing.
- **Failure handling**: per-query failure → partial run; login/connect → run stops; agent malformed output → run failed with partial state kept; invented ids dropped; no demo substitution for real failures.
- **Telemetry**: 27 local event types; Research log page.
- **Demo seed**: `npm run seed:demo` or "Load demo project" button runs the real workflow code on fixture providers (23 evidence, 21 signals, 6 clusters, 5 cards, 21 findings, 6 traced requirements).
- **Tests**: 44 (domain, provider normalization, fixture determinism, workflow e2e, failure modes, HTTP API, UI smoke in jsdom against the real app).

## Partially implemented (intentionally shallow)

- **Fixture agent content** covers deep investigation/decision/build package for two themes (agent-context, usage-billing); other themes get a generic thin brief. Enough to demo; not a second corpus.
- **Validation review** is one bounded re-search + one agent review; no diffing of competitor sets or price tables.
- **Comparison** reuses discovery evidence plus a few new queries per candidate; no full-page fetching.
- **Evidence** is snippet-level only (`full_text` column reserved; no page fetch yet).
- **UI** has no keyboard shortcuts, no multi-project comparison, no editing of generated text (by design for V0: artifacts are generated and versioned, not hand-edited).
- **Anthropic API adapter** implemented but not exercised live (no key available in this environment).
- **Runs** are in-process; a server restart mid-run leaves the run `running` until the user re-runs (no resumption).

## Not implemented

- Retry/repair loop for malformed structured agent output.
- Full-page fetching and page-level evidence excerpts.
- Missed-evidence analysis ("what did the search return that the agent ignored and should not have") beyond listing siblings in the inspector.
- Multi-user, auth, hosted deployment, PostgreSQL (schema portability kept).
- Direct "build with coding agent" execution (export/handoff only, by design).
- Playwright/browser E2E.

## Known product questions (for the next iteration, not blockers)

1. Should discovery run in **families as separate mini-runs** (so the user can add "search more market-movement") instead of one plan?
2. How should **re-running discovery** merge with existing cards — append, supersede, or diff?
3. Is a 12-section brief the right length, or should the brief be **progressive** (summary first, sections on demand)?
4. Should **developer fit** be an agent judgement at all, or a user-set tag?
5. What does the user want to do with **weak but interesting** cards — park them, or spawn a "cheap check" investigation?
6. Should the human be able to **edit assumptions** before the build package is generated (likely yes)?
7. How much of the Research log should be visible to users vs. kept for R&D?

## Known technical debt (specific)

- `src/client/pages/DiscoverPage.tsx` is ~330 lines (setup form + running view + board + card); split into three files.
- `research_queries.purpose` is abused to carry the target opportunity id for comparison runs (`[opp_…] purpose`); add a `target_id` column.
- `Repositories.deleteProject` uses `(tbl as any).projectId`; make a typed list of project-scoped tables.
- `repos.updateRun` in `setStage` re-reads the run to merge progress; add a single `patchProgress` SQL update.
- Polling (1.2 s) instead of SSE for run progress.
- `seedDemoProject` picks opportunities by title substring; tie to theme ids instead.
- No index on `events.type`; fine for V0 volumes.
- Fixture search matching is a bag-of-words score; a query that matches nothing yields zero evidence (desired) but a query that matches only noise yields noise-only evidence (also desired, but undocumented in the UI beyond the inspector).
- Vite bundle is ~423 kB minified (React + router + zod); zod is pulled into the client only for enum types — could switch the client to type-only imports via a generated `types.d.ts`.
