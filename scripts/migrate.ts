import { openDb } from '../src/db/client';
import { loadConfig } from '../src/server/config';

const cfg = loadConfig();
openDb({ path: cfg.dbPath });
console.log(`migrated ${cfg.dbPath}`);
