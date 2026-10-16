/**
 * Derive retrieval status for investigations that predate tracking, from persisted query rows and
 * search_failed events. Preview by default; `--apply` writes. Idempotent; each change is audited as
 * a retrieval_backfilled event.   Usage: npm run backfill:retrieval -- [--apply] [--project <id>]
 */
import { loadConfig } from '../src/server/config';
import { openDb } from '../src/db/client';
import { Repositories } from '../src/db/repositories';
import { Telemetry } from '../src/telemetry/events';
import { buildProviders } from '../src/providers/index';
import { planRetrievalBackfill, applyRetrievalBackfill } from '../src/workflows/backfillRetrieval';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const project = args.includes('--project') ? args[args.indexOf('--project') + 1] : undefined;
const config = loadConfig();
const { db } = openDb({ path: config.dbPath });
const repos = new Repositories(db);
const ctx = { repos, telemetry: new Telemetry(repos), providers: buildProviders(config), config };
const changes = planRetrievalBackfill(ctx, project);
console.log(
  `${apply ? 'APPLYING' : 'PREVIEW'} — ${changes.length} investigation(s) would change (${config.dbPath})`,
);
for (const c of changes) {
  console.log(`\n${c.investigationId} (run ${c.runId})`);
  console.log(`  status:    ${c.before.status} → ${c.after.status}`);
  console.log(
    `  retrieval: ${c.before.retrieval ?? 'null'} → ${c.after.retrieval}  (${c.after.retrievalNote})`,
  );
  for (const [opp, o] of Object.entries(c.after.candidateRetrieval))
    console.log(
      `  ${opp}: ${o.succeeded}/${o.planned} executed, ${o.rateLimited} rate-limited, ${o.transportFailed} transport, ${o.otherFailed} other, ${o.skipped} skipped`,
    );
  console.log(
    `  derivation: ${c.derivation.queries} queries; failure codes from rows ${c.derivation.failureCodesFromRows}, from events ${c.derivation.failureCodesFromEvents}, unclassified ${c.derivation.unclassifiedFailures}`,
  );
}
if (apply) console.log(`\napplied ${applyRetrievalBackfill(ctx, changes)} change(s)`);
else if (changes.length) console.log('\n(no changes written; re-run with --apply)');
