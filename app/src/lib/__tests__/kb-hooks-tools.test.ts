// Phase 153-02 — Hooks from catbot-tools.ts tool cases into syncResource.
//
// Proves that 6 direct-DB-write tool cases fire
//   await syncResource(entity, op, row, {author}) + invalidateKbIndex()
// after successful DB commit, and that the pass-through update_cat_paw case
// does NOT fire syncResource directly (the route hook in Plan 03 owns it).
//
// Test layout (T1-T10):
//   T1  create_catbrain        → KB file + index entry
//   T2  create_cat_paw / create_agent (alias) → KB file in resources/catpaws
//   T3  create_connector       → KB file + no config.secret leak
//   T4  create_email_template  → KB file in email-templates + no structure leak
//   T5  update_email_template  → version bump + change_log grows
//   T6  delete_email_template  → status: deprecated on KB (no fs.unlink)
//   T7  update_cat_paw         → NEGATIVE (syncResource NEVER called)
//   T8  syncResource failure   → DB persists, logger.error + markStale,
//                                invalidateKbIndex NOT called
//   T9  invalidateKbIndex success-only
//   T10 Promise.all concurrency (catbrain + catpaw)
//   T11 Promise.all same-table concurrency (2 catbrains, Phase 153-04 Task 1)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// CRITICAL: set up test env BEFORE module imports (same pattern as
// kb-tools-integration.test.ts).
vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  const tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'kbhooks-'));
  process['env']['CATBOT_DB_PATH'] = nodePath.join(tmpDir, 'catbot-test.db');
  process['env']['DATABASE_PATH'] = nodePath.join(tmpDir, 'docflow-test.db');
});

import { executeTool } from '@/lib/services/catbot-tools';
import { invalidateKbIndex } from '@/lib/services/kb-index-cache';
import * as kbIndexCacheModule from '@/lib/services/kb-index-cache';
import * as knowledgeSyncModule from '@/lib/services/knowledge-sync';
import * as kbAuditModule from '@/lib/services/kb-audit';
import * as loggerModule from '@/lib/logger';
import { createFixtureKb } from './kb-test-utils';
import dbModule from '@/lib/db';

function getKbFileContent(kbRoot: string, relPath: string): string {
  return fs.readFileSync(path.join(kbRoot, relPath), 'utf8');
}

function readIndex(kbRoot: string): {
  entries: Array<{ id: string; path: string; subtype?: string }>;
} {
  const raw = fs.readFileSync(path.join(kbRoot, '_index.json'), 'utf8');
  return JSON.parse(raw);
}

describe('KB hook: catbot-tools.ts tool cases call syncResource on DB write (KB-19, KB-21)', () => {
  let tmpRoot: string;
  let kbRoot: string;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kbhooks-'));
    ({ kbRoot } = createFixtureKb(tmpRoot));
    process['env']['KB_ROOT'] = kbRoot;
    invalidateKbIndex();
    originalFetch = global.fetch;

    // Ensure minimal tables exist, then wipe so tests control counts.
    dbModule
      .prepare(
        "CREATE TABLE IF NOT EXISTS cat_paws (id TEXT PRIMARY KEY, name TEXT, avatar_emoji TEXT, mode TEXT, model TEXT, department TEXT, is_active INTEGER, description TEXT, system_prompt TEXT, temperature REAL, max_tokens INTEGER, output_format TEXT, created_at TEXT, updated_at TEXT)",
      )
      .run();
    dbModule
      .prepare(
        'CREATE TABLE IF NOT EXISTS catbrains (id TEXT PRIMARY KEY, name TEXT, purpose TEXT, status TEXT, created_at TEXT, updated_at TEXT)',
      )
      .run();
    dbModule
      .prepare(
        'CREATE TABLE IF NOT EXISTS connectors (id TEXT PRIMARY KEY, name TEXT, type TEXT, config TEXT, is_active INTEGER, times_used INTEGER, test_status TEXT, description TEXT, created_at TEXT, updated_at TEXT)',
      )
      .run();
    dbModule
      .prepare(
        'CREATE TABLE IF NOT EXISTS email_templates (id TEXT PRIMARY KEY, ref_code TEXT, name TEXT, description TEXT, category TEXT, subject TEXT, body TEXT, product TEXT, structure TEXT, html_preview TEXT, is_active INTEGER, times_used INTEGER, created_at TEXT, updated_at TEXT)',
      )
      .run();
    dbModule
      .prepare(
        'CREATE TABLE IF NOT EXISTS template_assets (id TEXT PRIMARY KEY, template_id TEXT, url TEXT)',
      )
      .run();

    dbModule.prepare('DELETE FROM cat_paws').run();
    dbModule.prepare('DELETE FROM catbrains').run();
    dbModule.prepare('DELETE FROM connectors').run();
    dbModule.prepare('DELETE FROM email_templates').run();
    dbModule.prepare('DELETE FROM template_assets').run();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process['env']['KB_ROOT'];
    invalidateKbIndex();
    global.fetch = originalFetch;
  });

  // ──────────────────────────────────────────────────────────────────
  // Hook positives (T1-T6)
  // ──────────────────────────────────────────────────────────────────

  it('T1 create_catbrain writes KB file to resources/catbrains/ and invalidates index', async () => {
    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');
    const invalidateSpy = vi.spyOn(kbIndexCacheModule, 'invalidateKbIndex');

    const res = await executeTool(
      'create_catbrain',
      { name: 'Aurora Knowledge', purpose: 'Testing KB sync hook' },
      'http://test',
      { userId: 'alice', sudoActive: false },
    );
    const result = res.result as { id: string; name: string; status: string };
    expect(result.id).toBeTruthy();

    // syncResource invoked with singular entity + create
    expect(syncSpy).toHaveBeenCalledWith(
      'catbrain',
      'create',
      expect.objectContaining({ id: result.id, name: 'Aurora Knowledge' }),
      expect.objectContaining({ author: 'alice' }),
    );
    expect(invalidateSpy).toHaveBeenCalled();

    // KB file lives under resources/catbrains with correct prefix
    const catbrainsDir = path.join(kbRoot, 'resources', 'catbrains');
    const files = fs.readdirSync(catbrainsDir);
    const shortId = result.id.slice(0, 8);
    const match = files.find((f) => f.startsWith(`${shortId}-`) && f.endsWith('.md'));
    expect(match).toBeTruthy();

    // _index.json includes the new entry. knowledge-sync.ts:920 writes the
    // frontmatter id as `${entity}-${idShort(row.id)}` = `catbrain-<id8>`.
    const idx = readIndex(kbRoot);
    const entry = idx.entries.find((e) => e.id === `catbrain-${shortId}`);
    expect(entry).toBeTruthy();
    expect(entry?.subtype).toBe('catbrain');
  });

  it('T2 create_cat_paw and create_agent alias both write KB files to resources/catpaws/', async () => {
    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    // First as create_cat_paw — pass explicit model to skip resolveAlias
    const res1 = await executeTool(
      'create_cat_paw',
      {
        name: 'Tester',
        description: 'KB hook positive path',
        mode: 'chat',
        model: 'gemini-main',
      },
      'http://test',
      { userId: 'bob', sudoActive: false },
    );
    const id1 = (res1.result as { id: string }).id;

    // Second as create_agent fall-through — pass explicit model
    const res2 = await executeTool(
      'create_agent',
      {
        name: 'Agente Secundario',
        description: 'Another one',
        mode: 'chat',
        model: 'gemini-main',
      },
      'http://test',
      { userId: 'carol', sudoActive: false },
    );
    const id2 = (res2.result as { id: string }).id;

    expect(syncSpy).toHaveBeenCalledWith(
      'catpaw',
      'create',
      expect.objectContaining({ id: id1, name: 'Tester' }),
      expect.objectContaining({ author: 'bob' }),
    );
    expect(syncSpy).toHaveBeenCalledWith(
      'catpaw',
      'create',
      expect.objectContaining({ id: id2, name: 'Agente Secundario' }),
      expect.objectContaining({ author: 'carol' }),
    );

    const catpawsDir = path.join(kbRoot, 'resources', 'catpaws');
    const files = fs.readdirSync(catpawsDir);
    expect(files.filter((f) => f.startsWith(`${id1.slice(0, 8)}-`)).length).toBe(1);
    expect(files.filter((f) => f.startsWith(`${id2.slice(0, 8)}-`)).length).toBe(1);
  });

  it('T3 create_connector writes KB file and never leaks config secrets', async () => {
    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    const res = await executeTool(
      'create_connector',
      {
        name: 'Gmail Prod',
        type: 'gmail',
        config: { secret: 'LEAK-XYZ-nope', api_key: 'LEAK-API-KEY-nope' },
      },
      'http://test',
      { userId: 'dave', sudoActive: false },
    );
    const id = (res.result as { id: string }).id;

    expect(syncSpy).toHaveBeenCalledWith(
      'connector',
      'create',
      expect.objectContaining({ id, name: 'Gmail Prod', type: 'gmail' }),
      expect.objectContaining({ author: 'dave' }),
    );

    // Security canary: config must NEVER appear in KB. FIELDS_FROM_DB.connector
    // does not include 'config' (Phase 150 KB-11 invariant, preserved by
    // Phase 149 service).
    const connectorsDir = path.join(kbRoot, 'resources', 'connectors');
    const files = fs.readdirSync(connectorsDir);
    const fname = files.find((f) => f.startsWith(`${id.slice(0, 8)}-`));
    expect(fname).toBeTruthy();
    const content = getKbFileContent(kbRoot, `resources/connectors/${fname}`);
    expect(content).not.toContain('LEAK-XYZ-nope');
    expect(content).not.toContain('LEAK-API-KEY-nope');
  });

  it('T4 create_email_template writes KB file to resources/email-templates/ and never leaks structure', async () => {
    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    const res = await executeTool(
      'create_email_template',
      {
        name: 'Welcome Beta',
        description: 'Beta welcome email',
        category: 'onboarding',
        structure: {
          sections: {
            header: { rows: [] },
            body: { rows: [{ cells: [{ type: 'text', content: '<html>LEAK-HTML-PAYLOAD</html>' }] }] },
            footer: { rows: [] },
          },
          styles: {
            backgroundColor: '#fff',
            fontFamily: 'Arial',
            primaryColor: '#000',
            textColor: '#111',
            maxWidth: 600,
          },
        },
      },
      'http://test',
      { userId: 'eve', sudoActive: false },
    );
    const id = (res.result as { id: string }).id;

    expect(syncSpy).toHaveBeenCalledWith(
      'template', // ← singular, NOT 'email-template'
      'create',
      expect.objectContaining({ id, name: 'Welcome Beta' }),
      expect.objectContaining({ author: 'eve' }),
    );

    const subdir = path.join(kbRoot, 'resources', 'email-templates');
    const files = fs.readdirSync(subdir);
    const fname = files.find((f) => f.startsWith(`${id.slice(0, 8)}-`));
    expect(fname).toBeTruthy();
    const content = getKbFileContent(kbRoot, `resources/email-templates/${fname}`);
    expect(content).not.toContain('LEAK-HTML-PAYLOAD');
  });

  it('T5 update_email_template bumps version and appends change_log entry', async () => {
    // Seed DB row + matching KB file (syncResource create path first).
    const createRes = await executeTool(
      'create_email_template',
      {
        name: 'Bump Target',
        description: 'original desc',
        category: 'onboarding',
      },
      'http://test',
      { userId: 'eve', sudoActive: false },
    );
    const id = (createRes.result as { id: string }).id;

    const subdir = path.join(kbRoot, 'resources', 'email-templates');
    const files0 = fs.readdirSync(subdir);
    const fname = files0.find((f) => f.startsWith(`${id.slice(0, 8)}-`));
    expect(fname).toBeTruthy();
    const relPath = `resources/email-templates/${fname}`;
    const beforeContent = getKbFileContent(kbRoot, relPath);
    expect(beforeContent).toMatch(/version:\s*1\.0\.0/);
    const beforeLogLines = (beforeContent.match(/^\s+-\s+\{.*version:/gm) || []).length;

    // Update with structural change (description + structure) → triggers bump
    await executeTool(
      'update_email_template',
      {
        templateId: id,
        description: 'updated desc for bump test',
        category: 'transactional',
      },
      'http://test',
      { userId: 'frank', sudoActive: false },
    );

    const afterContent = getKbFileContent(kbRoot, relPath);
    const afterVersionMatch = afterContent.match(/^version:\s*(\d+)\.(\d+)\.(\d+)/m);
    expect(afterVersionMatch).toBeTruthy();
    const [, maj, min, pat] = afterVersionMatch!;
    // Anything greater than 1.0.0 counts (patch, minor, or major all fine)
    const versionNumeric = Number(maj) * 10000 + Number(min) * 100 + Number(pat);
    expect(versionNumeric).toBeGreaterThan(10000);

    const afterLogLines = (afterContent.match(/^\s+-\s+\{.*version:/gm) || []).length;
    expect(afterLogLines).toBeGreaterThanOrEqual(beforeLogLines + 1);
  });

  it('T6 delete_email_template sets status: deprecated on KB file, never fs.unlink', async () => {
    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    // Seed (creates KB via the hook too)
    const createRes = await executeTool(
      'create_email_template',
      { name: 'Doomed Template', description: 'about to die', category: 'general' },
      'http://test',
      { userId: 'eve', sudoActive: false },
    );
    const id = (createRes.result as { id: string }).id;

    const subdir = path.join(kbRoot, 'resources', 'email-templates');
    const filesBefore = fs.readdirSync(subdir);
    const fname = filesBefore.find((f) => f.startsWith(`${id.slice(0, 8)}-`));
    expect(fname).toBeTruthy();
    const relPath = `resources/email-templates/${fname}`;

    // Now delete
    syncSpy.mockClear();
    await executeTool(
      'delete_email_template',
      { templateId: id },
      'http://test',
      { userId: 'eve', sudoActive: false },
    );

    // (a) DB row gone
    const row = dbModule
      .prepare('SELECT * FROM email_templates WHERE id = ?')
      .get(id);
    expect(row).toBeUndefined();

    // (b) KB file still exists on disk (no fs.unlink)
    const filesAfter = fs.readdirSync(subdir);
    expect(filesAfter).toContain(fname);

    // (c) frontmatter has status: deprecated + deprecated_at timestamp + deprecated_by
    const content = getKbFileContent(kbRoot, relPath);
    expect(content).toMatch(/^status:\s*deprecated/m);
    expect(content).toMatch(/^deprecated_at:/m);
    expect(content).toMatch(/^deprecated_by:\s*eve/m);

    // (d) syncResource called with op='delete' and entity='template'
    expect(syncSpy).toHaveBeenCalledWith(
      'template',
      'delete',
      expect.objectContaining({ id }),
      expect.objectContaining({ author: 'eve' }),
    );
  });

  // ──────────────────────────────────────────────────────────────────
  // Negative (T7): update_cat_paw does NOT call syncResource (pass-through)
  // ──────────────────────────────────────────────────────────────────

  it('T7 update_cat_paw does NOT call syncResource directly (pass-through to PATCH route)', async () => {
    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    // Mock the fetch that update_cat_paw uses internally — it must succeed
    // so we prove the tool case ran through the success path.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'fake-id', name: 'Returned Name' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const res = await executeTool(
      'update_cat_paw',
      { catPawId: 'fake-id', description: 'new description' },
      'http://test',
      { userId: 'gina', sudoActive: false },
    );
    const result = res.result as { updated?: boolean; id?: string };
    expect(result.updated).toBe(true);

    // syncResource was NEVER called from the tool case — the route hook
    // in Plan 03 owns this path.
    expect(syncSpy).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────
  // Failure simulation (T8): DB persists, markStale + logger.error fire,
  // invalidateKbIndex NOT called.
  // ──────────────────────────────────────────────────────────────────

  it('T8 syncResource failure: DB row persists, logger.error + markStale fire, invalidateKbIndex NOT called', async () => {
    const syncSpy = vi
      .spyOn(knowledgeSyncModule, 'syncResource')
      .mockRejectedValue(new Error('ENOSPC simulated'));
    const loggerErrorSpy = vi.spyOn(loggerModule.logger, 'error');
    const markStaleSpy = vi.spyOn(kbAuditModule, 'markStale');
    const invalidateSpy = vi.spyOn(kbIndexCacheModule, 'invalidateKbIndex');

    const res = await executeTool(
      'create_catbrain',
      { name: 'Will Fail Sync', purpose: 'should still persist in DB' },
      'http://test',
      { userId: 'harry', sudoActive: false },
    );
    const result = res.result as { id: string };

    // (a) DB row exists despite hook failure
    const row = dbModule
      .prepare('SELECT * FROM catbrains WHERE id = ?')
      .get(result.id);
    expect(row).toBeTruthy();

    // (b) syncResource was attempted (and threw)
    expect(syncSpy).toHaveBeenCalled();

    // (c) logger.error called with source='kb-sync'
    const kbSyncErrorCalls = loggerErrorSpy.mock.calls.filter(
      (c) => c[0] === 'kb-sync',
    );
    expect(kbSyncErrorCalls.length).toBeGreaterThanOrEqual(1);

    // (d) markStale called with reason='create-sync-failed' and ENOSPC error
    expect(markStaleSpy).toHaveBeenCalled();
    const markStaleCall = markStaleSpy.mock.calls[0];
    expect(markStaleCall[1]).toBe('create-sync-failed');
    const details = markStaleCall[2] as { error?: string; db_id?: string; entity?: string };
    expect(details.error).toContain('ENOSPC');
    expect(details.db_id).toBe(result.id);

    // (e) invalidateKbIndex NOT called on failure path
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────
  // Post-success cache invalidation (T9)
  // ──────────────────────────────────────────────────────────────────

  it('T9 invalidateKbIndex is called on success path and skipped on failure path', async () => {
    // Scenario A: success
    const invalidateSpyA = vi.spyOn(kbIndexCacheModule, 'invalidateKbIndex');
    await executeTool(
      'create_catbrain',
      { name: 'Success Case', purpose: 'should invalidate' },
      'http://test',
      { userId: 'alice', sudoActive: false },
    );
    const successCalls = invalidateSpyA.mock.calls.length;
    expect(successCalls).toBeGreaterThanOrEqual(1);

    // Scenario B: failure — new spy chain, force syncResource to throw
    invalidateSpyA.mockRestore();
    vi
      .spyOn(knowledgeSyncModule, 'syncResource')
      .mockRejectedValue(new Error('EACCES simulated'));
    const invalidateSpyB = vi.spyOn(kbIndexCacheModule, 'invalidateKbIndex');

    await executeTool(
      'create_catbrain',
      { name: 'Failure Case', purpose: 'should NOT invalidate' },
      'http://test',
      { userId: 'alice', sudoActive: false },
    );
    expect(invalidateSpyB).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────
  // Concurrency (T10): Promise.all([create_catbrain, create_cat_paw])
  // ──────────────────────────────────────────────────────────────────

  it('T10 Promise.all([create_catbrain, create_cat_paw]) produces 2 KB files + 2 index entries', async () => {
    const [res1, res2] = await Promise.all([
      executeTool(
        'create_catbrain',
        { name: 'Concurrent Brain', purpose: 'Race test' },
        'http://test',
        { userId: 'alice', sudoActive: false },
      ),
      executeTool(
        'create_cat_paw',
        {
          name: 'Concurrent Paw',
          description: 'Race test',
          mode: 'chat',
          model: 'gemini-main',
        },
        'http://test',
        { userId: 'alice', sudoActive: false },
      ),
    ]);
    const id1 = (res1.result as { id: string }).id;
    const id2 = (res2.result as { id: string }).id;

    const catbrainsDir = path.join(kbRoot, 'resources', 'catbrains');
    const catpawsDir = path.join(kbRoot, 'resources', 'catpaws');
    const brainFiles = fs
      .readdirSync(catbrainsDir)
      .filter((f) => f.startsWith(`${id1.slice(0, 8)}-`));
    const pawFiles = fs
      .readdirSync(catpawsDir)
      .filter((f) => f.startsWith(`${id2.slice(0, 8)}-`));
    expect(brainFiles.length).toBe(1);
    expect(pawFiles.length).toBe(1);

    // _index.json grew by at least 2 fresh entries
    const idx = readIndex(kbRoot);
    const brainEntry = idx.entries.find((e) =>
      e.path.endsWith(`/${brainFiles[0]}`) ||
      e.path.endsWith(brainFiles[0]),
    );
    const pawEntry = idx.entries.find((e) =>
      e.path.endsWith(`/${pawFiles[0]}`) ||
      e.path.endsWith(pawFiles[0]),
    );
    expect(brainEntry).toBeTruthy();
    expect(pawEntry).toBeTruthy();
  });

  // ──────────────────────────────────────────────────────────────────
  // Phase 153-04 Task 1 — T11 same-table concurrency on _index.json
  //
  // Rationale (from 153-04-PLAN §Task 1 behavior): mixing entities (T10)
  // exercises two separate subtypes writing at the same time. The stricter
  // invariant is two writes against the SAME table (both catbrains) — this
  // stresses the atomic read-merge-write on _index.json more than T10.
  // ──────────────────────────────────────────────────────────────────

  it('T11 Promise.all of 2 create_catbrain calls → 2 KB files + 2 index entries, no cross-contamination', async () => {
    const [res1, res2] = await Promise.all([
      executeTool(
        'create_catbrain',
        { name: 'BrainA', purpose: 'Same-table race A' },
        'http://test',
        { userId: 'alice', sudoActive: false },
      ),
      executeTool(
        'create_catbrain',
        { name: 'BrainB', purpose: 'Same-table race B' },
        'http://test',
        { userId: 'alice', sudoActive: false },
      ),
    ]);
    const idA = (res1.result as { id: string }).id;
    const idB = (res2.result as { id: string }).id;
    expect(idA).not.toBe(idB);

    const catbrainsDir = path.join(kbRoot, 'resources', 'catbrains');
    const allBrainFiles = fs
      .readdirSync(catbrainsDir)
      .filter((f) => f.endsWith('.md'));
    const brainAFile = allBrainFiles.find((f) => f.startsWith(`${idA.slice(0, 8)}-`));
    const brainBFile = allBrainFiles.find((f) => f.startsWith(`${idB.slice(0, 8)}-`));
    expect(brainAFile).toBeDefined();
    expect(brainBFile).toBeDefined();
    expect(brainAFile).not.toBe(brainBFile);

    // No cross-contamination: each file references only its own id + name.
    const contentA = fs.readFileSync(path.join(catbrainsDir, brainAFile!), 'utf8');
    const contentB = fs.readFileSync(path.join(catbrainsDir, brainBFile!), 'utf8');
    expect(contentA).toContain('BrainA');
    expect(contentA).not.toContain('BrainB');
    expect(contentB).toContain('BrainB');
    expect(contentB).not.toContain('BrainA');

    // _index.json must contain BOTH entries — atomic read-merge-write invariant.
    const idx = readIndex(kbRoot);
    const entryA = idx.entries.find((e) =>
      e.path.endsWith(`/${brainAFile}`) || e.path.endsWith(brainAFile!),
    );
    const entryB = idx.entries.find((e) =>
      e.path.endsWith(`/${brainBFile}`) || e.path.endsWith(brainBFile!),
    );
    expect(entryA).toBeTruthy();
    expect(entryB).toBeTruthy();
    // Ids in _index.json follow 'catbrain-<id8>' shape (per knowledge-sync.ts:920).
    expect(entryA!.id).toBe(`catbrain-${idA.slice(0, 8)}`);
    expect(entryB!.id).toBe(`catbrain-${idB.slice(0, 8)}`);
  });
});

