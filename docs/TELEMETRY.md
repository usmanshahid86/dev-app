# Telemetry (local workflow events)

Purpose: let us study, later, how search quality flows into product decisions:

```
query → returned evidence → extracted signal → opportunity → evidence opened/inspected
      → opportunity selected → finding used → decision → requirement
```

Storage: table `events` (`id`, `project_id`, `type`, `payload` json, `created_at`). Local only; nothing leaves the machine; no network sink. Visible in the UI under **Research log** and via `GET /api/projects/:id/events`.

What is **not** captured: model reasoning/chain of thought, prompts, provider credentials, terminal transcripts, raw page bodies (raw search envelopes live in `raw_responses`, not in events).

## Event model

| type                                               | emitted by                | payload (keys)                                                                       |
| -------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------ |
| `project_created`                                  | projects                  | mode, hasDirection                                                                   |
| `discovery_started`                                | discovery                 | runId, profile, budget                                                               |
| `query_planned`                                    | search                    | runId, queryId, family, query                                                        |
| `search_completed`                                 | search                    | runId, queryId, provider, resultCount, evidenceCount, durationMs, isDemo, costMicros |
| `search_failed`                                    | search                    | runId, queryId, provider, code, action                                               |
| `evidence_created`                                 | search                    | evidenceId, queryId, url, isDemo                                                     |
| `signal_created`                                   | discovery                 | signalId, type, evidenceIds, confidence                                              |
| `cluster_created`                                  | discovery                 | clusterId, signalIds                                                                 |
| `opportunity_created`                              | discovery                 | opportunityId, clusterId, signalIds, dimensions, seeded                              |
| `discovery_completed` / `discovery_failed`         | discovery                 | runId, counts / error, action                                                        |
| `evidence_viewed`                                  | UI → API                  | evidenceId, from (opportunity-card, brief-sources, research-inspector, sibling, …)   |
| `opportunity_status_changed`                       | projects                  | opportunityId, from, to                                                              |
| `opportunity_selected`                             | investigation             | opportunityId                                                                        |
| `investigation_started` / `_completed` / `_failed` | investigation             | runId, investigationId, kind, opportunityIds / findings / error                      |
| `finding_created`                                  | investigation, validation | findingId, investigationId, kind, evidenceIds, section                               |
| `brief_created`                                    | investigation             | briefId, version, findings                                                           |
| `decision_recommended`                             | investigation             | decisionId, recommendation, assumptions                                              |
| `decision_selected`                                | decision                  | decisionId, userDecision, agentRecommendation, agreesWithAgent                       |
| `build_package_created`                            | buildPackage              | buildPackageId, decisionId, version, requirements, traced                            |
| `export_generated`                                 | API                       | files                                                                                |
| `validation_started` / `_completed` / `_failed`    | validation                | runId, reviewId, buildPackageId, version / verdict, newEvidence / error              |
| `stage_changed`                                    | all                       | from, to, byUser?                                                                    |

## Example questions this supports

- Which queries produced evidence that ended up cited in a decision? (`query_planned` → `evidence_created` → `finding_created.evidenceIds` → `decision_recommended`)
- Which returned evidence was never used (returned but no `signal_created` references it)?
- Did the human agree with the agent (`decision_selected.agreesWithAgent`)?
- Which evidence did the human actually open before deciding (`evidence_viewed`)?

All of this is derivable with SQL over `events` plus the lineage tables; no analytics pipeline is required.
