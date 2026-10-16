import { describe, it, expect } from 'vitest';
import { mkdtempSync, copyFileSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openDb } from '@db/client';
import { Repositories } from '@db/repositories';
import { randomUUID } from 'node:crypto';

const MIG = resolve('src/db/migrations');

/** Build a migrations folder containing only the V0 migration. */
function v0MigrationsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'v0mig-'));
  mkdirSync(join(dir, 'meta'));
  copyFileSync(join(MIG, '0000_init.sql'), join(dir, '0000_init.sql'));
  const journal = JSON.parse(readFileSync(join(MIG, 'meta', '_journal.json'), 'utf8'));
  journal.entries = journal.entries.filter((e: any) => e.idx === 0);
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify(journal));
  return dir;
}

describe('database migrations', () => {
  it('fresh install applies all migrations and backfill is a no-op', () => {
    const { db, sqlite } = openDb({ path: ':memory:' });
    const repos = new Repositories(db);
    expect(repos.listProjects()).toEqual([]);
    const cols = sqlite
      .prepare("PRAGMA table_info('evidence')")
      .all()
      .map((c: any) => c.name);
    expect(cols).toEqual(
      expect.arrayContaining(['canonical_url', 'domain', 'category', 'fetch_status', 'text_hash']),
    );
    expect(
      sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='evidence_discoveries'")
        .get(),
    ).toBeTruthy();
  });

  it('upgrades a V0 database: V0 rows get canonical urls, categories and first-discovery rows', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'v0db-')), 'v0.sqlite');
    // 1) create a V0-schema database and insert V0-shaped rows via raw SQL (as V0 would have).
    const v0 = openDb({ path: file, migrationsDir: v0MigrationsDir(), skipBackfill: true });
    const sq = v0.sqlite;
    const pid = `prj_${randomUUID().slice(0, 16)}`;
    sq.prepare(
      'INSERT INTO projects (id,title,created_at,updated_at,stage,mode,discovery_profile,selected_opportunity_id,decision_status) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(pid, 'V0 project', 'now', 'now', 'OPPORTUNITIES_READY', 'real', '{}', null, 'none');
    sq.prepare(
      'INSERT INTO research_runs (id,project_id,kind,target_ids,status,stage,budget,search_provider,agent_provider,progress,error,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      'run_v0',
      pid,
      'discovery',
      '[]',
      'completed',
      'done',
      '{"maxQueries":12,"maxResultsPerQuery":8}',
      'jevlin',
      'claude-cli',
      '{"queriesPlanned":1,"queriesCompleted":1,"queriesFailed":0,"evidenceCount":2,"signalCount":1}',
      null,
      'now',
      'now',
    );
    sq.prepare(
      'INSERT INTO research_queries (id,project_id,run_id,query,family,purpose,provider,status,executed_at,duration_ms,result_count,raw_response_id,error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      'qry_v0',
      pid,
      'run_v0',
      'q',
      'pain_workaround',
      'p',
      'jevlin',
      'completed',
      'now',
      10,
      2,
      null,
      null,
    );
    sq.prepare(
      'INSERT INTO evidence (id,project_id,query_id,url,title,snippet,position,provider_meta,provider,retrieved_at,full_text,is_demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      'ev_v0a',
      pid,
      'qry_v0',
      'https://WWW.Example.com/pricing?utm_source=x',
      'Pricing',
      'snippet',
      0,
      '{"foundBy":["serper"]}',
      'jevlin',
      'now',
      null,
      0,
    );
    sq.prepare(
      'INSERT INTO evidence (id,project_id,query_id,url,title,snippet,position,provider_meta,provider,retrieved_at,full_text,is_demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      'ev_v0b',
      pid,
      'qry_v0',
      'https://github.com/o/r/issues/1',
      'Issue',
      'snippet',
      1,
      null,
      'jevlin',
      'now',
      'old full text',
      0,
    );
    sq.prepare(
      'INSERT INTO signals (id,project_id,run_id,type,observation,inference,affected_user,uncertainty,confidence,evidence_ids,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      'sig_v0',
      pid,
      'run_v0',
      'repeated_pain',
      'obs',
      'inf',
      null,
      'u',
      'medium',
      '["ev_v0a","ev_v0b"]',
      'now',
    );
    sq.close();

    // 2) open with the full migration set (what V0.1 does on startup).
    const { db, sqlite } = openDb({ path: file });
    const repos = new Repositories(db);
    const ev = repos.listEvidence(pid).sort((a, b) => a.id.localeCompare(b.id));
    expect(ev[0]).toMatchObject({
      id: 'ev_v0a',
      canonicalUrl: 'https://example.com/pricing',
      domain: 'example.com',
      category: 'pricing',
      fetchStatus: 'snippet_only',
    });
    expect(ev[1]).toMatchObject({
      id: 'ev_v0b',
      category: 'issue_tracker',
      fetchStatus: 'fetched',
      fullText: 'old full text',
    });
    const discs = repos.listDiscoveries(pid);
    expect(discs).toHaveLength(2);
    expect(discs.find((d) => d.evidenceId === 'ev_v0a')).toMatchObject({
      queryId: 'qry_v0',
      runId: 'run_v0',
      position: 0,
      provider: 'jevlin',
      url: 'https://WWW.Example.com/pricing?utm_source=x',
    });
    const sig = repos.listSignals(pid)[0]!;
    expect(sig).toMatchObject({
      kind: 'raw',
      componentSignalIds: [],
      stats: null,
      evidenceIds: ['ev_v0a', 'ev_v0b'],
    });
    const run = repos.getRun('run_v0')!;
    expect(run.budget.maxPageFetches).toBe(0);
    expect(run.progress.pageFetchesSelected).toBe(0);
    // pre-tracking rows read as unknown, never as a fabricated status
    expect(run.progress.retrieval).toBeNull();
    expect(repos.listQueries(pid)[0]!.failureCode).toBeNull();
    // 3) re-opening is idempotent (no duplicate discoveries).
    sqlite.close();
    const again = openDb({ path: file });
    expect(new Repositories(again.db).listDiscoveries(pid)).toHaveLength(2);
    again.sqlite.close();
  });
});
