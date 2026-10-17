# DOGFOOD-04 — end-to-end research validation on V0.1.2

Status: **pre-registered** (this section was committed before any DOGFOOD-04 search ran). Results are appended below it as the experiment proceeds.

## A. Experiment setup (pre-registered)

### A1. Baseline and controls

| Item                     | Value                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application revision     | `9fddc35` (V0.1.2), working tree clean, in sync with `origin/main`                                                                                                                                                                                                                                                                                 |
| Runtime configuration    | no `.env`; documented defaults: 12 discovery queries, 8 investigation queries (2 per candidate in comparison), 20 results requested (fast tier returns at most 10), 4 comparison / 8 investigation page fetches, retry policy 1 retry per query with a 90 s wait budget, fetch cooldowns 7 days (401/403) and 24 h (empty text), 3000-char packets |
| Providers                | search `jevlin` (fast tier); agent `claude-cli` (`CLAUDE_MODEL=sonnet`); page fetcher `http`                                                                                                                                                                                                                                                       |
| Pre-flight (no searches) | `jevlin limits`: spent 0 of 4,914,000 µ$ daily ceiling; `jevlin status`: agent claimed; last search on the account was about 11 hours earlier, so any burst allowance has refilled; V0.1.2 features present in the build (fetch policy, `agent_call` accounting, three-line retrieval detail)                                                      |
| Controls                 | no code, prompt, provider, budget, scoring or workflow changes; no manual evidence insertion; no custom research script (the dogfood harness only calls the app's own API and reads persisted state); no reruns to improve results; historical DOGFOOD-02/03 artifacts untouched; a new project is created                                         |
| Waiting policy           | at least five minutes with no search traffic between stages so the burst bucket is not artificially drained; the bounded retry policy is left to handle whatever remains                                                                                                                                                                           |

### A2. Chosen research topic

**Market area:** enterprise UI automation reliability: RPA, scripted browser automation, and computer-use agents operating business applications.

**Opportunity hypothesis (the direction given to the application):** continuous monitoring and automatic repair ("self-healing") of enterprise UI and browser automations and computer-use agents when the applications they operate change.

### A3. Why this topic is suitable (stated before searching)

| Criterion                                     | Rationale                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Technically plausible for a small startup     | The core is change detection (DOM and screenshot comparison), locator or action repair, and replay verification; no model training or large infrastructure is implied. This is a prior belief, not a finding; feasibility is something the investigation must test.                                                                                                                                              |
| Identifiable buyer                            | Plausibly an automation Center of Excellence lead, an RPA program owner, a QA or test-automation lead, or a shared-services operations head. Whether any of them holds a budget for this specific capability is exactly what should be investigated.                                                                                                                                                             |
| Recurring problem                             | The applications automations operate on release changes continuously, so breakage and repair recur. Whether the cost is large enough to pay for is unknown.                                                                                                                                                                                                                                                      |
| Existing competitive landscape                | Expected categories (unverified prior): RPA platform vendors, test-automation vendors with self-healing features, open-source locator-healing tools, agentic browser infrastructure vendors.                                                                                                                                                                                                                     |
| Needs evidence beyond technical documentation | The decision depends on maintenance cost, procurement and budget behaviour, packaging and pricing of incumbents, and adoption of agent-based versus scripted automation; none of these are answered by API documentation.                                                                                                                                                                                        |
| Unfamiliar relative to earlier dogfoods       | DOGFOOD-02/03 covered coding-agent credential isolation, agent regression testing, and API-versus-self-hosted inference. None examined enterprise UI automation maintenance. One conceptual adjacency exists (re-validation after change, as in DOGFOOD-03's candidate B); the audit will measure actual source overlap by canonical URL against project `prj_2fe15839b8714483` rather than assume independence. |

**Selection-bias disclosure.** No searches, pre-screening or sampling of this topic were done before choosing it. Two opposing biases were considered and not used to steer the choice: a mature vendor-heavy market makes pricing and feature evidence easy for a web-search system to find (flatters the product), while enterprise purchasing behaviour is largely invisible on the public web (penalises it). The topic was chosen by the criteria above.

### A4. Discovery input (the application's own "I already have a direction" path)

| Field                                         | Value                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Areas                                         | enterprise UI and browser automation reliability and maintenance (RPA, scripted automation, computer-use agents) |
| Direction seed                                | the opportunity hypothesis in A2                                                                                 |
| Strengths / team                              | small technically strong team; team size 2–5                                                                     |
| Time to MVP / resources                       | months / moderate                                                                                                |
| Customer                                      | businesses                                                                                                       |
| Business model, geography, avoid, constraints | unspecified                                                                                                      |

### A5. Decision rules fixed in advance

1. **Candidate set for comparison.** After discovery, candidates must have a target user and problem inside the market area in A2. If more than three qualify, take the seeded card (if one was produced) plus the strongest by the application's own `evidenceStrength` rating, ties broken by consolidated-signal count and then title. If only two qualify, compare two. If fewer than two qualify, stop and report; discovery is **not** rerun.
2. **Primary opportunity.** The seeded card if present; otherwise the qualifying card whose thesis most directly matches A2. Recorded before comparison starts.
3. **Deep investigation target.** The primary opportunity, regardless of what the comparison shows; the comparison result is reported next to that choice, not used to change it.
4. **No human decision** is recorded and no investigation beyond one deep investigation is started.
5. **Partial runs stay partial.** If a stage is incomplete (rate limit, failed pages), the result is reported as such and the stage is not rerun to improve numbers.

### A6. Validation checkpoints for V0.1.2

Retrieval visibility (counts on the Research page and brief agree with persisted run and evidence rows); fetch-failure suppression (exercised only if a natural failure recurs within the project, otherwise reported as not exercised); agent-cost accounting (one `agent_call` per completed call, retries individually, no double counting, three categories kept apart, reconciled to event metadata); provenance (new, inherited and mixed origins independent of support level; every excerpt locatable in retained text).

## Discovery result and candidate selection (recorded before comparison started)

| Item                               | Value                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project                            | `prj_9b78f82754c042b0` (real mode, created through the application API)                                                                                     |
| Discovery run                      | `run_356d750a51bf405a`, 2026-10-17 03:05:34 → 03:08:35 UTC (3 min 1 s), status `completed`                                                                  |
| Searches                           | 12 planned, 12 executed, 0 failed, 0 retried, 0 skipped; 120 results (10 per query), 118 canonical sources on 79 domains, 2 sources returned by two queries |
| Search cost                        | 36,000 µ$ ($0.036)                                                                                                                                          |
| Agent calls                        | 9 `agent_call` events, all CLI-reported, $0.520 API-equivalent (not billed expenditure)                                                                     |
| Pipeline                           | 25 raw signals → 13 consolidated → 5 clusters → 4 opportunity cards                                                                                         |
| Independence from earlier projects | 0 canonical URLs shared with any earlier project; 17 of 79 domains also seen before                                                                         |

Cards exactly as produced:

| Card                   | Title                                                                          | Seeded | Evidence | Competition | Monetization | Consolidated signals |
| ---------------------- | ------------------------------------------------------------------------------ | ------ | -------- | ----------- | ------------ | -------------------- |
| `opp_4cb9cb98ba644521` | Cross-platform drift monitoring and self-healing for enterprise UI automations | yes    | medium   | high        | medium       | 7                    |
| `opp_0c2271067c084c4e` | Production reliability and drift monitoring for computer-use / browser agents  | no     | weak     | medium      | weak         | 4                    |
| `opp_7dfb910c4d41484b` | Per-bot repair and monitoring tooling sold to RPA managed-service providers    | no     | weak     | unknown     | medium       | 3                    |
| `opp_075e44c8db764707` | Governed, auditable repair with failure-cause classification                   | no     | weak     | unknown     | weak         | 3                    |

**Rule A5-1 applied.** All four cards have a target user and problem inside the declared market area, so more than three qualify. The seeded card is taken; among the remaining three, all rated `weak` on evidence strength, the tie breaks on consolidated-signal count (4, 3, 3) and then title, giving the cards `opp_0c2271067c084c4e` and `opp_075e44c8db764707` (the managed-service-provider card loses the title tie-break to the governed-repair card).

**Candidate set for comparison:** `opp_4cb9cb98ba644521`, `opp_0c2271067c084c4e`, `opp_075e44c8db764707`.

**Primary opportunity (rule A5-2): `opp_4cb9cb98ba644521`**, the seeded card, which is also the deep-investigation target (rule A5-3).

Observations recorded now, not interpreted: the discovery run's `retrieval` and `queryOutcomes` fields are null (retrieval status is recorded only for investigation runs); the application's own "why now" for the primary card reads "Weak", and its alternatives list already names several vendor-shipped self-healing features, so the application starts out skeptical of its own seed.
