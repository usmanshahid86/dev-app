# DOGFOOD-01 — real-mode Opportunity Discovery

Objective record of one bounded real-mode discovery run. No opportunity is ranked or recommended here; the purpose is for humans to inspect the first real opportunity set in the app (project `prj_2fe15839b8714483`, Discover page).

## Setup

| Item                   | Value                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| Date / time (UTC)      | 2026-10-15T11:53:07.514Z → 2026-10-15T11:56:34.002Z                                          |
| Duration               | 206 s                                                                                        |
| Search provider        | jevlin (fast tier; the router chose `serper` on every query)                                 |
| Agent provider / model | claude-cli / `sonnet` (Claude Code CLI alias; the exact model id is not reported by the CLI) |
| Page fetcher           | http (unused: the discovery fetch budget is 0)                                               |
| Query budget           | 12 queries × 20 results requested                                                            |
| Evidence batch size    | 25 per signal-extraction call                                                                |
| Project / run id       | `prj_2fe15839b8714483` / `run_d3c2f2f8c08943f8`                                              |
| Status                 | completed                                                                                    |

Discovery profile (no direction seed): areas "AI and software broadly"; team 2–5, "small technically strong team"; time to MVP months; resources moderate; customer any; business model open; geography open; avoid none; constraints: "Find software/AI opportunities worth investigating. Prefer evidence of real pain, structural change, economic opportunity, ecosystem gaps or newly possible capabilities. Do not assume the product must be an AI wrapper."

Prompts were not changed after seeing results. Provider composition and tiers were not changed for this run.

## Attempt 1 (interrupted) — recorded for completeness

A first attempt (project `prj_f54a1211a8fd42e5`, run `run_d1ed9adc4e7d4d2f`) with the same profile was interrupted when the host session ended during the final agent step (`building_opportunities`). Persisted before the interruption: 12 queries issued (1 failed: Jevlin answered `ok` with `chosen: -1` and an empty merged list for the query `LLM agent evals flaky "we ended up writing our own" regression testing agents production`), 102 results, 102 canonical sources, 0 rediscoveries, 19 raw signals, 10 consolidated signals, search cost 33,000 micro-dollars. The run was marked `failed` by hand afterwards (docs/DECISIONS.md #40). Its artifacts remain in the database and are not part of the numbers below.

## Attempt 2 (reported run)

### Queries issued (12; 0 failed)

| Family                | Results | Latency | Query                                                                                                      |
| --------------------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| pain_workaround       | 10      | 1339 ms | maintainers overwhelmed AI-generated pull requests issues spam open source policy                          |
| constraint_change     | 10      | 1568 ms | MCP server security vulnerabilities enterprise governance audit tooling 2026                               |
| constraint_change     | 10      | 1456 ms | EU AI Act August 2026 compliance deadline developers tooling documentation requirements                    |
| market_movement       | 10      | 1132 ms | LLM API pricing change deprecation developers migrating self-hosted open weights inference cost            |
| pain_workaround       | 10      | 1426 ms | AI agent evals flaky testing production regression "how do you test" agents reddit                         |
| ecosystem_gap         | 10      | 1255 ms | github issue feature request self-hosted open source alternative to LangSmith OR Datadog LLM observability |
| market_movement       | 10      | 1538 ms | shutting down service sunset announcement developer tool migrate export data 2026                          |
| technical_change      | 10      | 1267 ms | on-device small language models WebGPU browser local inference new release 2026 benchmarks                 |
| economic_distribution | 10      | 1403 ms | open source maintainers funding sponsorship paid support enterprise pays for open core pricing 2026        |
| pain_workaround       | 10      | 1740 ms | coding agents sandbox secrets credentials leak permissions problem developers workaround                   |
| economic_distribution | 10      | 1176 ms | SaaS price increase per-seat pricing complaints teams switching self-host open source 2026                 |
| pain_workaround       | 10      | 2194 ms | Hacker News Ask HN what tedious manual workflow do you wish was automated small business 2026              |

Result depth: 20 requested per query; the fast tier returned exactly 10 for every query (positions 0–9). No result beyond position 9 exists in this run, so deep-tail behaviour could not be observed with this tier.

### Counts

| Stage                                          | Count                                                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Search results returned (discoveries)          | 120                                                                                                                                 |
| Unique canonical sources                       | 120                                                                                                                                 |
| Rediscoveries (same source from another query) | 0                                                                                                                                   |
| Sources found by multiple queries              | 0                                                                                                                                   |
| Distinct domains                               | 87                                                                                                                                  |
| Raw signals                                    | 22                                                                                                                                  |
| Consolidated signals                           | 12 (of which 8 merged two or more raw signals)                                                                                      |
| Clusters                                       | 3                                                                                                                                   |
| Opportunities                                  | 5                                                                                                                                   |
| Page fetches                                   | 0 (discovery never fetches)                                                                                                         |
| Agent retries / malformed outputs              | 0                                                                                                                                   |
| Search cost                                    | 36000 micro-dollars ($0.036)                                                                                                        |
| Agent cost                                     | not captured (the run does not persist per-call CLI cost); 1 plan + 5 extraction + 1 consolidation + 1 cluster + 1 opportunity call |

Sources used by at least one raw signal: 107 of 120. Of their discovery positions, 53 were at positions 0–4 and 54 at positions 5–9 (the total pool was 60/60), so the lower half of each result page was used as often as the top half.

Evidence ids cited per raw signal: min 1, median 5, max 10. Most raw signals cite the bulk of a single query's result page.

### Source-category distribution (rule-based classifier)

| Category              | Sources |
| --------------------- | ------- |
| blog                  | 37      |
| other                 | 32      |
| forum_community       | 24      |
| social                | 8       |
| official_docs         | 5       |
| repository            | 5       |
| research_benchmark    | 2       |
| regulatory_government | 2       |
| issue_tracker         | 2       |
| changelog             | 1       |
| review                | 1       |
| news                  | 1       |

Top domains: reddit.com (11), news.ycombinator.com (9), github.com (7), linkedin.com (3), youtube.com (3), arxiv.org (2), dev.to (2), facebook.com (2), medium.com (2), sitepoint.com (2), aembit.io (1), agxntsix.ai (1).

### Consolidated signals

| Raw merged | Sources | Domains | Source types | Observation (truncated)                                                                                         |
| ---------- | ------- | ------- | ------------ | --------------------------------------------------------------------------------------------------------------- |
| 3          | 10      | 10      | 4            | Multiple sources (Reddit, Medium/Signadot, The New Stack, Godot co-founder, QEMU, OCaml) report open source ma… |
| 2          | 10      | 10      | 3            | Security sources report widespread MCP server weaknesses (one cites 97M+ monthly MCP downloads, 82% vulnerable… |
| 2          | 10      | 10      | 3            | Compliance guides and law-firm/developer sources say EU AI Act obligations for high-risk systems (Annex III, A… |
| 1          | 9       | 9       | 3            | Sources report enterprise LLM API spend of $8.4B in 2025 with inference dominating AI budgets. They give self-… |
| 2          | 11      | 6       | 2            | Multiple Reddit threads (r/LLMDevs, r/AI_Agents, r/devops) ask how to test AI agents before shipping; changing… |
| 2          | 10      | 8       | 5            | A Reddit r/LangChain user uses LangSmith for tracing/debugging/monitoring but wants open-source options to avo… |
| 2          | 10      | 10      | 3            | Many products have dated shutdowns or EOL: Firebase Studio sunset (announced 2026-03-19), OpenAI older models … |
| 3          | 10      | 9       | 4            | Sources describe in-browser local LLM inference maturing: a 2026 blog says WebGPU ships in every major browser… |
| 1          | 10      | 10      | 3            | GitHub Sponsors has passed $100M distributed since 2019. Help Net Security says the funding gap remains enormo… |
| 1          | 10      | 10      | 2            | Many independent sources describe coding agents (Claude Code, Codex) exposing secrets and credentials, e.g. re… |
| 1          | 2       | 1       | 1            | An Ask HN thread (2026) asks what people still do manually that should be automated. A UX-focused Ask HN threa… |
| 2          | 5       | 2       | 1            | HN commenters on automation advise automating only steps you already do well manually, keeping humans in the l… |

### Clusters (3)

- Trust, safety and governance for AI agents — 2 consolidated signal(s)
- LLM app lifecycle: testing, observability and model churn — 2 consolidated signal(s)
- LLM inference cost, privacy and where inference runs — 2 consolidated signal(s)

### Opportunity cards, exactly as produced (unranked)

### 1. Open credential-isolating runner for coding agents

**Thesis (verbatim):** An easy-to-adopt open-source layer (sandbox runner plus credential-injecting egress proxy plus permission policy) that keeps secrets away from coding agents.

- Dimensions: evidence medium · competition medium · buildability moderate · monetization weak · distribution strong · fit high
- Corroboration: 10 sources across 10 domains; two source types; third-party sources only (no first-party confirmation). Mix: 2 social, 5 blog, 3 other.
- Consolidated signals: 1
- Why now (verbatim): Sources describe sandbox escapes and secret exposure in current coding agents (Claude Code, Codex), so the problem exists in today's tooling. No dated adoption data is provided.
- Major unknowns (verbatim): Evidence is blog/vendor content with some marketing; the '29 million' figure is unexplained. · Unknown how many developers feel enough pain to adopt a new tool. · Agent vendors may ship adequate built-in sandboxing.

### 2. Governance gateway and auditing for MCP servers

**Thesis (verbatim):** A policy, authentication and audit layer for enterprise MCP deployments, differentiated by open source and runtime least-privilege enforcement rather than just scanning.

- Dimensions: evidence medium · competition high · buildability moderate · monetization weak · distribution medium · fit medium
- Corroboration: 10 sources across 10 domains; 3 independent source types; mix of first-party and third-party sources. Mix: 3 other, 1 research_benchmark, 1 repository, 5 blog.
- Consolidated signals: 1
- Why now (verbatim): Sources report 97M+ monthly MCP downloads and a CSA research note (dated 2026-05 in its URL) describing systemic flaws, suggesting rapid adoption with immature controls. Statistics are unverified.
- Major unknowns (verbatim): Statistics come from marketing reports with unverified methodology. · No evidence enterprises are paying for MCP governance. · The crowded field may consolidate into platform vendors.

### 3. Regression testing and re-validation for agents across prompt/model changes

**Thesis (verbatim):** A lightweight tool that lets developers detect behavior regressions in agents after prompt, tool, or forced model changes.

- Dimensions: evidence medium · competition high · buildability moderate · monetization weak · distribution medium · fit high
- Corroboration: 11 sources across 6 domains; two source types; third-party sources only (no first-party confirmation). Mix: 6 forum_community, 3 blog, 2 other.
- Consolidated signals: 1
- Why now (verbatim): Unknown / no strong why-now evidence beyond the mention of model deprecations, which lacks figures.
- Major unknowns (verbatim): Forum posts are self-selected and lack engagement counts. · The deprecation cost claim is a single snippet. · Differentiation versus existing eval platforms is unclear.

### 4. API vs self-hosted inference decision and routing tool

**Thesis (verbatim):** A tool that models break-even and routes or migrates traffic between proprietary APIs and self-hosted open-weight models using a team's real usage.

- Dimensions: evidence medium · competition unknown · buildability moderate · monetization weak · distribution medium · fit medium
- Corroboration: 9 sources across 9 domains; 3 independent source types; third-party sources only (no first-party confirmation). Mix: 1 news, 4 blog, 3 other, 1 social.
- Consolidated signals: 1
- Why now (verbatim): Unknown / no strong why-now evidence beyond 2025 spend figures and 2026 comparison content.
- Major unknowns (verbatim): Pricing data may be dated and conflicting. · Sources are vendor-biased. · Unclear whether decision tooling is a product or a one-off question.

### 5. Tooling for in-browser/on-device LLM apps

**Thesis (verbatim):** WebGPU-based local inference is maturing, and developers may need better tooling for benchmarking, model discovery and delivery in the browser.

- Dimensions: evidence weak · competition medium · buildability moderate · monetization weak · distribution medium · fit medium
- Corroboration: 10 sources across 9 domains; 4 independent source types; mix of first-party and third-party sources. Mix: 3 blog, 1 research_benchmark, 1 repository, 2 forum_community, 3 other.
- Consolidated signals: 1
- Why now (verbatim): Per sources, WebGPU support in all major browser engines and WebLLM's prebuilt model catalog make browser inference newly feasible; throughput evidence is a single high-end demo.
- Major unknowns (verbatim): Single demo on high-end hardware. · The demand signal is one old post without replies. · Platform vendors (Chrome) may absorb the capability.

## Observations (factual, not conclusions)

- Every query returned exactly 10 results and no source was returned by more than one query; the planned queries did not overlap in sources.
- Each opportunity cites exactly one consolidated signal, and each consolidated signal's sources-across-domains count is dominated by a single query's result page (raw signals cite most of a page). The corroboration line therefore reflects breadth within one search more than confirmation across searches.
- The classifier labelled 32 of 120 sources `other` and 37 `blog`; forum/community (24) and social (8) were the next largest groups.
- Two of the twelve consolidated signals merged raw signals from different queries (3 raw each); the remaining merges combined raw signals extracted within the same batch.
- No agent output failed schema validation; no excerpts or findings exist at this stage because discovery produces neither.
- Discovery stopped at `OPPORTUNITIES_READY`. No opportunity was selected, compared or investigated, no recommendation was made, no build package was generated.
