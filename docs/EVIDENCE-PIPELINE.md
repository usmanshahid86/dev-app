# Evidence pipeline (V0.1)

The pipeline turns broad web search into claims a developer can trust, without ever collapsing the
distinction between **what a source says**, **what the model inferred**, and **what the human decided**.

```
search result            one row per (query, returned result)        evidence_discoveries
    ↓
canonical source         one row per canonical URL per project       evidence  (canonical_url, domain, category, fetch state)
    ↓
raw signal               extracted from one evidence batch           signals (kind='raw', evidence_ids)
    ↓
consolidated signal      merged across batches, same phenomenon      signals (kind='consolidated', component_signal_ids, stats)
    ↓
cluster                  opportunity area with rationale             signal_clusters
    ↓
opportunity              hypothesis + dimensions + corroboration     opportunities
    ↓
full-page retrieval      selective, budgeted, SSRF-guarded           evidence.full_text / fetch_status / text_hash
    ↓
supported finding        validated claim + support level + excerpts  findings (support_level, excerpts)
    ↓
decision                 agent recommendation vs. human decision     decisions
    ↓
requirement              traced to decision/assumption/finding       build_packages.requirements
```

## 1. Search result → canonical source → discovery

`workflows/search.ts` canonicalizes every returned URL (`domain/canonicalUrl.ts`: lowercase host, drop
`www.`, fragment, userinfo, tracking params `utm_*`/`ref`/`fbclid`/`gclid`/…, default ports; sort
remaining params; normalize trailing slash; keep scheme, path case and meaningful query parameters).

- If no evidence row with that canonical URL exists in the project, one is created (`source_canonicalized`,
  `evidence_created`) with a rule-based `category` (`domain/sourceCategory.ts`).
- Otherwise the existing row is reused (`source_rediscovered`) and its snippet is upgraded if the new one is richer.
- In both cases an `evidence_discoveries` row records the query, run, position, provider, provider metadata
  and the URL exactly as returned (`search_result_persisted`).

A page found by three queries is therefore **one source with three discoveries**. The evidence inspector lists
all of them; corroboration counts both `canonicalSources` and `discoveries`.

Every result with a parseable http(s) URL becomes evidence. Relevance is judged downstream by the agent, so
"returned but never used" pages remain inspectable (see §8).

## 2. Raw signals (batched)

`extractSignals` runs over evidence batches of `DEVAPP_DISCOVERY_EVIDENCE_BATCH_SIZE` (25). Each raw
signal has an observation (what the source says), an inference, affected user, uncertainty, confidence and
≥1 evidence id from **its own batch**; ids outside the batch are dropped programmatically. Raw signals are
persisted and never deleted.

## 3. Consolidation (cross-batch)

`consolidateSignals` sees every raw signal at once and merges only those describing the **same underlying
phenomenon** (not merely a shared topic). The workflow enforces: unknown component ids dropped, each raw
signal in at most one consolidated signal, uncovered raw signals become standalone consolidated signals.
Each consolidated signal stores `componentSignalIds`, the union of evidence ids, the agent's rationale (in
`uncertainty`), and `stats` — transparent corroboration counts (see §5).

Clusters and opportunities cite consolidated signals only. The signal inspector walks consolidated → raw
→ evidence.

## 4. Opportunities

`generateOpportunities` produces 0–10 cards from clusters; the count is the agent's call ("do not fill a
quota"). A card is persisted only if it cites ≥1 consolidated signal (therefore evidence). Each card stores
`corroboration` computed over its evidence, six categorical dimensions, explicit uncertainties and open
questions. No composite score exists anywhere.

## 5. Corroboration (what the user sees)

`domain/corroboration.ts` computes only verifiable counts: evidence records, canonical sources, domains,
discoveries, per-category mix, distinct source types, first-party vs third-party sources
(first-party = official_docs/pricing/changelog/repository/marketplace), pages read in full — plus a templated
sentence, e.g. _"5 sources across 4 domains; 3 independent source types; mix of first-party and third-party
sources; 2 pages read in full."_ Nothing is combined into a number. Five articles repeating one
announcement show as "5 sources … one source type; third-party sources only".

## 6. Selective full-page retrieval

| Run kind           | Fetch budget (env)                      | Default                          |
| ------------------ | --------------------------------------- | -------------------------------- |
| discovery          | —                                       | 0 (never fetches; snippet-first) |
| comparison         | `DEVAPP_COMPARISON_MAX_PAGE_FETCHES`    | 4 (split across candidates)      |
| deep investigation | `DEVAPP_INVESTIGATION_MAX_PAGE_FETCHES` | 8                                |
| validation         | `DEVAPP_VALIDATION_MAX_PAGE_FETCHES`    | 3                                |

`workflows/fetch.ts`: the agent (`selectSourcesForFetch`) picks which unfetched sources are worth reading
under the remaining budget (invented ids ignored); the `PageFetcher` reads them; the evidence row records
`fetch_status` (`snippet_only | fetch_pending | fetched | fetch_failed | unavailable`), final URL, HTTP
status, content type, page title, retained text (bounded, `text_truncated` flag), `text_chars`,
`text_hash`, `fetched_at`, `fetch_error`, `fetch_run_id`. Budget and counts live on the run
(`budget.maxPageFetches`, `progress.pageFetchesSelected/Completed/Failed`).

### PageFetcher security model (`providers/fetch/safety.ts`, `http.ts`)

- only `http`/`https`; URLs with userinfo rejected;
- hostnames `localhost`, `*.localhost`, `*.local`, `*.internal`, metadata hosts rejected;
- literal IPs and **every resolved address** (dns.lookup all) checked: loopback, unspecified, RFC1918,
  link-local (incl. 169.254.169.254), CGNAT, multicast/reserved, IPv6 loopback/ULA/link-local/multicast,
  v4-mapped, 6to4 and NAT64 forms rejected;
- redirects handled manually, each hop re-checked, max 5;
- 15 s overall timeout, 2 MB body cap enforced while streaming, 60k chars of text retained;
- text/HTML/XML only; binaries and PDFs rejected; no JavaScript execution; no cookies/credentials sent;
- extraction with Mozilla Readability over a linkedom DOM, body-text fallback, whitespace normalized,
  sha256 content hash.

Residual limitation: the socket connects by hostname after the DNS check, so a DNS answer that changes
between lookup and connect (rebinding) is not fully prevented with Node's `fetch`. Pinning the checked
address would require a custom undici dispatcher; documented as future work.

## 7. Findings: fact vs inference vs support

Investigation agents receive **evidence packets** (`workflows/fetch.ts::buildPackets`): id, title,
canonical URL, category, discovery query, and either the first `DEVAPP_PACKET_MAX_CHARS` (3000) of the
fetched page or the snippet, labelled FULL PAGE / SNIPPET ONLY.

Every proposed finding passes `domain/findings.ts::validateFinding`:

- evidence ids must exist in the investigation's allowed set (opportunity evidence + this run's evidence);
  unknown ids are dropped;
- a `sourced_fact` with no surviving evidence is **demoted to inference**;
- an `inference` stays an inference even with evidence attached;
- claimed excerpts are checked against the retained text of the **same** evidence record
  (`domain/excerpts.ts`, whitespace/punctuation-normalized); an excerpt citing uncited or other evidence is
  rejected; unverifiable excerpts are kept but marked `verified: false` with the reason;
- `support_level` is computed, never agent-set: `full_page_excerpt_verified` → `full_page` → `snippet_only` → `inference`.

The Product Brief Markdown, the findings panel and the Research Inspector all show the support level, so a
snippet-only claim is never presented like a page-backed one.

## 8. Missed-evidence preparation (Search R&D)

For every source the snapshot exposes `evidenceUsage`: returned (discovery count), promoted to evidence,
selected for fetch, fetched, used in a raw signal, used in a consolidated signal, used in an opportunity,
used in a finding, inspected by a human. All derived from stored lineage and the `evidence_viewed` event —
no "ignored evidence quality score". The evidence inspector shows the flags and lists the other results of
the same search as "returned by search; not necessarily relevant or used".

## 9. Human boundary

The agent recommends (`decisions.agent_recommendation`); the human decides (`decisions.user_decision`,
separate columns). A build package is generated only for a recorded human BUILD/PIVOT. Requirements link to
decision, assumption ids and finding ids; a purely engineering requirement carries no research links and is
displayed as "traces to: decision only" rather than padded with fake support.
