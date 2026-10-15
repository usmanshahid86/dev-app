# Architecture

## Stack (greenfield choice)

| Concern     | Choice                                                           | Why                                                                                   |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Language    | TypeScript end to end (Node 20)                                  | one type system for domain, server, client, tests                                     |
| Server      | [Hono](https://hono.dev) on `@hono/node-server`                  | tiny, typed, testable in-process via `app.request()`; no framework lock-in            |
| Client      | React 19 + Vite + react-router                                   | standard developer-product UI stack; no component library (hand-written CSS tokens)   |
| Persistence | SQLite via `better-sqlite3` + Drizzle ORM, migrations checked in | local-first, zero setup; Drizzle schema is the only pg-specific surface to port later |
| Validation  | Zod 4                                                            | domain schemas double as agent output schemas (`z.toJSONSchema`)                      |
| Tests       | Vitest (+ Testing Library/jsdom for UI smoke)                    | one runner for everything                                                             |
| Jobs        | in-process async runs persisted in `research_runs`               | no queue infrastructure for V0; swap `workflows/runs.ts` later                        |

No microservices, no message broker, no external analytics.

## Layering

```
client (React)  ──HTTP──▶  server/app.ts (Hono, validation only)
                               │
                        workflows/*  (discovery, investigation, decision, buildPackage, validation)
                          │       │
                db/repositories   providers/
                  (SQLite)      ┌──┴────────────┬──────────────┐
                            SearchProvider   AgentProvider   PageFetcher
                            ├ jevlin (CLI)   ├ claude-cli    ├ http (SSRF-guarded, Readability)
                            └ fixture        ├ anthropic-api └ fixture
                                             └ fixture
                domain/  — Zod types, workflow state machine, lineage helpers (pure; shared with client)
                telemetry/ — local structured events (table `events`)
                export/  — Markdown rendered from structured state
```

Rules:

- `domain/` has no I/O and is imported by both server and client.
- `workflows/` are the only callers of providers and the only writers of workflow state. Each stage persists before the next begins so failures leave inspectable partial state.
- `db/repositories.ts` is the only module that knows table shapes; everything it returns is parsed through the domain Zod schemas.
- Providers never see domain persistence; they take plain inputs and return validated outputs. Raw provider payloads are stored separately (`raw_responses`) from normalized evidence.
- Agent output is never trusted for identity or support: workflows filter ids against what they handed the agent, `domain/findings.ts` computes support levels from stored evidence state, and `domain/excerpts.ts` verifies quotes against retained page text. The full pipeline is in `docs/EVIDENCE-PIPELINE.md`.

## Workflow state

`projects.stage` is an explicit state machine (`domain/workflow.ts`):

```
DISCOVERY_SETUP → DISCOVERING → OPPORTUNITIES_READY → (COMPARING) → INVESTIGATING
   → DECISION_READY → DECIDED → BUILD_PACKAGE_READY → VALIDATING
```

Running stages (`DISCOVERING`, `COMPARING`, `INVESTIGATING`, `VALIDATING`) are entered only by workflows; users may navigate backwards to the resting stages without deleting anything. Briefs, decisions, build packages and validation reviews are versioned (new rows, never overwritten). The URL never determines state; the client reads `project.stage`.

## Runs

Every research operation is a `research_runs` row with kind, budget, provider names, stage (`planning → searching → extracting_signals → clustering → building_opportunities`, etc.), counters and an error field. Workflows run in the server process (`workflows/runs.ts`); the client polls the project snapshot while a run is active. A crash leaves the run `running` with its partial queries/evidence intact; the user can re-run.

## Budgets

Configurable via env: `DEVAPP_DISCOVERY_MAX_QUERIES` (12), `DEVAPP_DISCOVERY_MAX_RESULTS_PER_QUERY` (20), `DEVAPP_INVESTIGATION_MAX_QUERIES` (8), `DEVAPP_VALIDATION_MAX_QUERIES` (5), page-fetch budgets `DEVAPP_COMPARISON/INVESTIGATION/VALIDATION_MAX_PAGE_FETCHES` (4 / 8 / 3; discovery is always 0), `DEVAPP_DISCOVERY_EVIDENCE_BATCH_SIZE` (25). Budgets and actual counts are persisted on each run. A Jevlin fast-tier search costs 3000 micro-dollars regardless of depth, so a default discovery run is ≈ $0.04 of search plus a handful of agent calls (the dogfood run spent $0.033 on search).

## Migrations

Drizzle SQL migrations are checked in (`0000_init`, `0001_evidence_sources_consolidation`). Because Drizzle migrations are SQL-only, `db/backfill.ts` runs idempotently after them on every open to fill derived columns for pre-V0.1 rows (canonical URL, domain, category, first-discovery rows). `tests/db/migration.test.ts` covers both a fresh install and a V0 → V0.1 upgrade.

## Demo vs real

`providers.mode` is `demo` if either provider is a fixture. The mode is stored on the project, shown in the top bar and as a banner, stamped on evidence (`is_demo`) and on every exported Markdown file. A failed real search is recorded as failed; fixture data is never used as a fallback (tested in `tests/workflows/failures.test.ts`).

## Moving to PostgreSQL later

Replace `db/schema.ts` (`sqlite-core` → `pg-core`), `db/client.ts` and regenerate migrations. Repositories use only portable Drizzle calls (`select/insert/update/delete`, `inArray`, `desc`, json-as-text columns). JSON columns become `jsonb`.
