# Telemetry (local workflow events)

Purpose: let us study how search quality flows into product decisions:

```
query → returned result → canonical source → raw signal → consolidated signal → opportunity
      → page fetch → finding (with support level) → evidence opened by a human → decision → requirement
```

Storage: table `events` (`id`, `project_id`, `type`, `payload` json, `created_at`). Local only; nothing
leaves the machine. Visible under **Research log** and `GET /api/projects/:id/events`.

Not captured: model reasoning, prompts, provider credentials, terminal transcripts, raw page bodies (page
text lives on `evidence.full_text`, raw search envelopes in `raw_responses`).

## Event model

| type                                                      | emitted by                | payload keys                                                                                                                                                                              |
| --------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project_created`                                         | projects                  | mode, hasDirection                                                                                                                                                                        |
| `discovery_started`                                       | discovery                 | runId, profile, budget, evidenceBatchSize                                                                                                                                                 |
| `query_planned`                                           | search                    | runId, queryId, family, query                                                                                                                                                             |
| `search_completed`                                        | search                    | runId, queryId, provider, resultCount, requestedMaxResults, newEvidence, rediscovered, dropped, durationMs, isDemo, costMicros, decision                                                  |
| `search_failed`                                           | search                    | runId, queryId, provider, code, action                                                                                                                                                    |
| `search_result_persisted`                                 | search                    | discoveryId, evidenceId, queryId, position, isNew                                                                                                                                         |
| `source_canonicalized`                                    | search                    | evidenceId, url, canonicalUrl, domain, category, categoryConfidence, rule                                                                                                                 |
| `source_rediscovered`                                     | search                    | evidenceId, queryId, runId, position, previousQueryId                                                                                                                                     |
| `evidence_created`                                        | search                    | evidenceId, queryId, url, isDemo                                                                                                                                                          |
| `page_fetch_selected`                                     | fetch                     | runId, evidenceId, url, reason, purpose                                                                                                                                                   |
| `page_fetch_completed`                                    | fetch                     | runId, evidenceId, finalUrl, status, contentType, textChars, truncated, hash, isDemo                                                                                                      |
| `page_fetch_failed`                                       | fetch                     | runId, evidenceId, url, code, status                                                                                                                                                      |
| `page_fetch_suppressed`                                   | fetch                     | runId, evidenceId, url, fetchStatus, fetchError, reason, permanent, until                                                                                                                 |
| `agent_call`                                              | runs                      | callId (stable), runId, op, attempt, provider, model, durationMs, inputTokens, outputTokens, costClass (cli_reported / estimated / unknown), cliReportedUsd, estimatedUsd, pricingVersion |
| `raw_signal_created` / `signal_created`                   | discovery                 | signalId, type, evidenceIds, confidence (kind)                                                                                                                                            |
| `signals_consolidated`                                    | discovery                 | runId, raw, consolidated, merged                                                                                                                                                          |
| `consolidated_signal_created`                             | discovery                 | signalId, componentSignalIds, evidenceIds, stats                                                                                                                                          |
| `corroboration_computed`                                  | discovery                 | subject (signal/opportunity), id, counts…, summary                                                                                                                                        |
| `cluster_created`                                         | discovery                 | clusterId, signalIds                                                                                                                                                                      |
| `opportunity_created`                                     | discovery                 | opportunityId, clusterId, signalIds, dimensions, seeded                                                                                                                                   |
| `discovery_completed` / `discovery_failed`                | discovery                 | runId, evidence, discoveries, rawSignals, consolidatedSignals, clusters, opportunities, failedQueries / error, action                                                                     |
| `agent_retry`                                             | runs                      | runId, op, code, provider                                                                                                                                                                 |
| `evidence_viewed`                                         | UI → API                  | evidenceId, from                                                                                                                                                                          |
| `opportunity_status_changed` / `opportunity_selected`     | projects / investigation  | opportunityId, from, to                                                                                                                                                                   |
| `investigation_started` / `_completed` / `_failed`        | investigation             | runId, investigationId, kind, opportunityIds, budget / findings, fullPageFindings / error                                                                                                 |
| `finding_created`                                         | investigation, validation | findingId, investigationId, kind, supportLevel, evidenceIds, section, notes                                                                                                               |
| `evidence_used_in_finding`                                | investigation             | findingId, evidenceId, supportLevel                                                                                                                                                       |
| `evidence_excerpt_verified` / `evidence_excerpt_rejected` | investigation             | findingId, evidenceId, note, chars                                                                                                                                                        |
| `brief_created`                                           | investigation             | briefId, version, findings, supportLevels                                                                                                                                                 |
| `decision_recommended` / `decision_selected`              | investigation / decision  | decisionId, recommendation / userDecision, agentRecommendation, agreesWithAgent                                                                                                           |
| `build_package_created`                                   | buildPackage              | buildPackageId, decisionId, version, requirements, traced                                                                                                                                 |
| `export_generated`                                        | API                       | files                                                                                                                                                                                     |
| `validation_started` / `_completed` / `_failed`           | validation                | runId, reviewId, buildPackageId, version, budget / verdict, newEvidence / error                                                                                                           |
| `stage_changed`                                           | all                       | from, to, byUser?                                                                                                                                                                         |

## Example R&D questions

- Which returned results (discoveries) never became a raw signal? → `search_result_persisted` minus `raw_signal_created.evidenceIds`, or `evidenceUsage` in the snapshot.
- Did deep-tail results (position ≥ 10) end up in findings? → join `evidence_discoveries.position` with `evidence_used_in_finding`.
- How often did the agent's excerpts fail verification? → `evidence_excerpt_rejected` vs `_verified`.
- Did the human look at the evidence before deciding? → `evidence_viewed` before `decision_selected`.
