# dev-app — what might be worth building?

An evidence-backed workflow for developers who do **not** need to arrive with a startup idea:

```
DISCOVER → CHOOSE → INVESTIGATE → DECIDE → DESIGN → BUILD → VALIDATE
```

The app searches the web (through [Jevlin](docs/SEARCH-INTEGRATION.md)) for _observable signals_ — complaints, workarounds, feature requests, pricing pages, shutdowns, changelogs — turns them into structured signals, clusters them into opportunity areas, and produces opportunity cards you can inspect, compare, investigate deeply, decide on, and turn into a Build Package a coding agent can execute. Every claim traces back to the evidence and the query that found it.

Three things are kept separate throughout: **what the source says**, **what the agent inferred**, and **what you decided**.

**V0.1 (trustworthy discovery)** adds the evidence pipeline described in [docs/EVIDENCE-PIPELINE.md](docs/EVIDENCE-PIPELINE.md): canonical sources with every discovery path preserved, rule-based source categories, cross-batch signal consolidation with raw-signal lineage, transparent corroboration (counts, never a score), selective SSRF-guarded full-page retrieval under explicit budgets, and findings whose support level (`full page, excerpt verified` → `full page` → `snippet only` → `inference`) is computed programmatically from verified excerpts.

## Quick start (demo mode, no credentials)

```bash
npm install
npm run seed:demo        # deterministic demo project through the whole workflow (fixture providers)
npm run dev              # API on :4100, Vite client on :5173 (proxied)
```

Open http://localhost:5173 and pick the **DEMO** project, or click **New exploration** → **Find opportunities** to run discovery yourself against the fixture corpus. Demo mode is labelled everywhere: evidence comes from fake pages under `demo.invalid`, never from the web.

Production-style single process (serves the built client from the API):

```bash
npm run build && npm start   # http://localhost:4100
```

## Real mode

Copy `.env.example` to `.env` and set:

| Variable                           | Value                           | Notes                                                                                                                  |
| ---------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `DEVAPP_SEARCH_PROVIDER`           | `jevlin`                        | uses the local Jevlin CLI (`jevlin search --stdin`)                                                                    |
| `JEVLIN_BIN`, `JEVLIN_CONFIG`      | paths                           | default `~/.local/bin/jevlin`, `~/.jevlin/jevlin.toml`; the agent must be claimed (`jevlin connect`)                   |
| `JEVLIN_TIER`                      | `fast` (default) or `balanced`  | `balanced` fans out across providers; costs more                                                                       |
| `DEVAPP_AGENT_PROVIDER`            | `claude-cli` or `anthropic-api` | `claude-cli` uses the logged-in Claude Code CLI (`claude -p --json-schema`); `anthropic-api` needs `ANTHROPIC_API_KEY` |
| `CLAUDE_MODEL` / `ANTHROPIC_MODEL` | model alias / id                | defaults `sonnet` / `claude-sonnet-5-5`                                                                                |
| `DEVAPP_DISCOVERY_MAX_QUERIES`     | integer                         | discovery search budget (default 12)                                                                                   |

Smoke tests for the real adapters (each performs exactly one call):

```bash
npm run smoke:jevlin -- "your query"           # one fast-tier Jevlin search
DEVAPP_AGENT_PROVIDER=claude-cli npm run smoke:agent   # one planDiscovery call
```

If a real provider fails, the run is recorded as `failed`/`partial` with the provider's `action` (`login`, `connect`, `retry`, …). The app never substitutes fixture data for a failed real call.

## Commands

| Command                                 | What it does                                                |
| --------------------------------------- | ----------------------------------------------------------- |
| `npm run dev`                           | API (tsx watch) + Vite client                               |
| `npm run build`                         | typecheck both targets + build client to `dist/client`      |
| `npm start`                             | serve API + built client on `DEVAPP_PORT` (4100)            |
| `npm test`                              | Vitest: domain, providers, workflows, API, UI smoke (jsdom) |
| `npm run typecheck` / `lint` / `format` | tsc / eslint / prettier                                     |
| `npm run db:generate` / `db:migrate`    | Drizzle migrations (checked in under `src/db/migrations`)   |
| `npm run seed:demo`                     | seed a deterministic demo project into the configured DB    |

## Where things are

```
src/domain        Zod domain model, workflow state machine, lineage helpers (no I/O)
src/providers     SearchProvider (jevlin, fixture) · AgentProvider (claude-cli, anthropic-api, fixture) · PageFetcher (http, fixture) · ops/ (structured agent operations)
src/db            Drizzle schema, SQLite client, repositories (only module that touches tables)
src/workflows     discovery · investigation (comparative + deep) · decision · buildPackage · validation · seed · runs
src/export        Markdown renderers: PROJECT-BRIEF / PRODUCT-DECISION / BUILD-PACKAGE / AGENT-HANDOFF
src/telemetry     local structured workflow events
src/server        Hono API + config
src/client        React UI (Vite)
fixtures/demo     fake corpus + canned reasoning for demo mode
tests/            vitest suites
docs/             ARCHITECTURE · DOMAIN-MODEL · EVIDENCE-PIPELINE · DECISIONS · SEARCH-INTEGRATION · AGENT-INTEGRATION · TELEMETRY · V0-STATUS · DOGFOOD-01
```

See [docs/V0-STATUS.md](docs/V0-STATUS.md) for what works, what is shallow, and what is next.
