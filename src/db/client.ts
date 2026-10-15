import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';
import { backfillV01 } from './backfill';

export type Db = BetterSQLite3Database<typeof schema>;

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations');

export interface OpenDbOptions {
  /** File path, or ':memory:' for tests. */
  path: string;
  /** Apply migrations on open (default true). */
  migrate?: boolean;
  /** Test hook: alternative migrations folder (e.g. V0-only). */
  migrationsDir?: string;
  /** Test hook: skip the post-migration data backfill. */
  skipBackfill?: boolean;
}

export function openDb(opts: OpenDbOptions): { db: Db; sqlite: Database.Database } {
  if (opts.path !== ':memory:') mkdirSync(dirname(resolve(opts.path)), { recursive: true });
  const sqlite = new Database(opts.path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  if (opts.migrate !== false) {
    migrate(db, { migrationsFolder: opts.migrationsDir ?? MIGRATIONS_DIR });
    if (!opts.skipBackfill) backfillV01(db);
  }
  return { db, sqlite };
}
