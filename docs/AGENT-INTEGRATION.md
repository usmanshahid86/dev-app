# Agent integration

## Boundary

`src/providers/agent/AgentProvider.ts`:

```ts
interface AgentOperation<I, O> {
  name;
  description;
  output: ZodType<O>;
  buildPrompt(input: I): { system; user };
  effort?;
}
interface AgentProvider {
  name;
  isDemo;
  run(op, input): Promise<{ output: O; provider; meta }>;
  healthCheck();
}
```

Workflows call `providers.agent.run(op, input)`. The domain never stores provider messages; only validated `output` objects flow into persistence, after a second validation pass in the workflow (unknown evidence/signal/finding ids are dropped).

## Operations (`providers/agent/ops/index.ts`)

| Operation                             | Input                                                              | Output                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `planDiscovery`                       | profile, maxQueries                                                | queries `{query, family, purpose}` across signal families (not "ideas")                                          |
| `extractSignals`                      | profile, evidence batch (id/url/title/snippet/query)               | signals `{type, observation, inference, affectedUser, uncertainty, confidence, evidenceIds}`                     |
| `clusterSignals`                      | signals                                                            | clusters `{label, description, rationale, signalIds}`                                                            |
| `generateOpportunities`               | profile, clusters with signals+evidence                            | opportunity cards with six categorical dimensions, `seeded` flag for the developer's own direction               |
| `planInvestigation`                   | opportunity, kind (comparative/deep), maxQueries                   | targeted queries                                                                                                 |
| `compareOpportunities`                | 2–3 candidates with evidence                                       | findings + one comparison row per opportunity + neutral summary                                                  |
| `synthesizeBrief`                     | profile, opportunity, evidence                                     | findings (sourced_fact / inference) + 12 sections citing `[F:key]`                                               |
| `recommendDecision`                   | opportunity, findings, brief                                       | BUILD/INVESTIGATE_FURTHER/PIVOT/REJECT + assumptions with evidence for/against + unknowns + what would change it |
| `generateBuildPackage`                | opportunity, human decision, assumptions, findings, brief, profile | build package sections + requirements linked to assumption/finding ids                                           |
| `planValidation` / `reviewValidation` | assumptions, old+new evidence, what we built                       | queries; assumption statuses + verdict CONTINUE/CHANGE_WEDGE/PIVOT/STOP                                          |

Every prompt shares one system preamble: separate what sources say from what is inferred; never invent ids, URLs, numbers or quotes; say when evidence is thin. Finding prompts additionally require verbatim excerpts, which are validated programmatically (docs/EVIDENCE-PIPELINE.md §7) — the agent's labels are never trusted for support level. JSON Schemas are generated from the Zod outputs (`structured.ts`).

Every agent call goes through `workflows/runs.ts::runAgent`, which retries once on a retryable failure (malformed structured output, timeout) and records `agent_retry` on the run.

## Providers

### `claude-cli` (default real adapter on this machine)

```
claude -p --output-format json --json-schema <schema> --tools "" --no-session-persistence \
       --setting-sources "" --model <CLAUDE_MODEL> --system-prompt <system>   <<< <user prompt on stdin>
```

Reads `structured_output` from the `result` message (the CLI validates against the schema), then re-validates with Zod. Uses the user's existing Claude Code login (no API key needed). `CLAUDECODE`/`CLAUDE_CODE_CHILD_SESSION` are stripped from the child env so it can run from inside a Claude Code session. Verified live: `planDiscovery` with `sonnet` ≈ 4 s, $0.023. Model reasoning is never read or stored.

### `anthropic-api`

`@anthropic-ai/sdk` `messages.parse` with `output_config.format = zodOutputFormat(op.output)` and `effort` from the op. Needs `ANTHROPIC_API_KEY` (or an `ant auth login` profile). Typed error mapping (auth / rate limit / connection) into `AgentProviderError`. Not exercised live in this pass (no key present).

### `fixture`

Deterministic canned reasoning over the demo corpus (`fixtures/demo/themes.ts`). It resolves evidence by URL to the ids it is given, so lineage is real; content is tagged `[DEMO]`. It intentionally produces no card for the webhook theme (strong incumbent) and no card when a direction seed matches nothing.

## Failure handling

`AgentProviderError{code: unavailable|malformed_output|timeout|auth|unknown, retryable}`. Any failure fails the run with the message recorded; partial artifacts (queries, evidence, signals, clusters) remain. Nothing is invented to fill a failed call (`tests/workflows/failures.test.ts`).

## Not done yet

- One retry only; no repair prompt that feeds validation errors back to the model.
- No prompt caching / batching for the API adapter.
- Effort/model selection per op is a hint only.
- Source classification is rule-based; no agent fallback for `other`.
