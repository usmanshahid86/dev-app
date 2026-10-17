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
