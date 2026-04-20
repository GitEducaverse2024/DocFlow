// Phase 156-01 — KB sync hook for delete_catflow sudo tool (KB-41).
//
// Proves that the `delete_catflow` sudo tool case (default path, no purge)
// soft-deletes via syncResource('canvas','delete',{id}) instead of hard-DELETE,
// leaving the KB file with status: deprecated and deprecated_by: catbot-sudo:delete_catflow.
//
// Test layout (T1-T5):
//   T1  soft-delete with confirmed:true  → DB row gone + KB file deprecated +
//                                          syncResource called + author catbot-sudo:delete_catflow
//   T2  confirmed:false                  → CONFIRM_REQUIRED + DB row intact + no syncResource
//   T3  AMBIGUOUS identifier             → 2 canvases same prefix → no delete, no syncResource
//   T4  purge:true hard-delete opt-in    → DB DELETE + syncResource NOT called
//   T5  syncResource throws              → DB row still deleted + markStale fires
//                                          + details.entity === 'canvases'
//
// Mirror pattern: kb-hooks-tools.test.ts (Phase 153 tool-case). Wave 0 RED:
// these assertions WILL fail until Task 3 migrates deleteCatFlow to async +
// soft-delete via syncResource.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// CRITICAL: set up test env BEFORE module imports (mirror kb-hooks-tools.test.ts).
vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  const tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'catbot-sudo-delete-'));
  process['env']['DATABASE_PATH'] = nodePath.join(tmpDir, 'docflow-test.db');
  process['env']['CATBOT_DB_PATH'] = nodePath.join(tmpDir, 'catbot-test.db');
});

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { executeSudoTool } from '@/lib/services/catbot-sudo-tools';
import { syncResource } from '@/lib/services/knowledge-sync';
import { invalidateKbIndex } from '@/lib/services/kb-index-cache';
import * as kbIndexCacheModule from '@/lib/services/kb-index-cache';
import * as knowledgeSyncModule from '@/lib/services/knowledge-sync';
import * as kbAuditModule from '@/lib/services/kb-audit';
import * as loggerModule from '@/lib/logger';
import { createFixtureKb } from './kb-test-utils';
import dbModule from '@/lib/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readKbFile(kbRoot: string, relPath: string): string {
  return fs.readFileSync(path.join(kbRoot, relPath), 'utf8');
}

function findKbFile(kbRoot: string, subdir: string, id: string): string | undefined {
  const dir = path.join(kbRoot, 'resources', subdir);
  if (!fs.existsSync(dir)) return undefined;
  const files = fs.readdirSync(dir);
  return files.find(f => f.startsWith(`${id.slice(0, 8)}-`) && f.endsWith('.md'));
}

// ---------------------------------------------------------------------------
// Table schema fixture — inline per RESEARCH §P-Q2
// ---------------------------------------------------------------------------

function ensureTables(): void {
  // db.ts bootstrap has a known ordering quirk (ALTER runs before CREATE for
  // canvases on fresh DB), so the listen_mode/node_count/external_input
  // columns may be missing. Idempotently patch the schema here.
  dbModule.prepare(
    `CREATE TABLE IF NOT EXISTS canvases (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      emoji TEXT,
      mode TEXT,
      status TEXT,
      thumbnail TEXT,
      tags TEXT,
      is_template INTEGER,
      flow_data TEXT,
      created_at TEXT,
      updated_at TEXT
    )`,
  ).run();
  try { dbModule.exec('ALTER TABLE canvases ADD COLUMN listen_mode INTEGER DEFAULT 0'); } catch { /* exists */ }
  try { dbModule.exec('ALTER TABLE canvases ADD COLUMN external_input TEXT'); } catch { /* exists */ }
  try { dbModule.exec('ALTER TABLE canvases ADD COLUMN next_run_at TEXT'); } catch { /* exists */ }
  try { dbModule.exec('ALTER TABLE canvases ADD COLUMN node_count INTEGER DEFAULT 1'); } catch { /* exists */ }

  dbModule.prepare(
    `CREATE TABLE IF NOT EXISTS canvas_runs (
      id TEXT PRIMARY KEY,
      canvas_id TEXT,
      status TEXT,
      started_at TEXT,
      created_at TEXT
    )`,
  ).run();
}

function wipeTables(): void {
  for (const t of ['canvases', 'canvas_runs']) {
    dbModule.prepare(`DELETE FROM ${t}`).run();
  }
}

/**
 * Seed a canvas both in DB and in KB filesystem so tests can exercise the
 * soft-delete path end-to-end (markDeprecated rewrites the existing file).
 * Returns the canvas id used.
 */
async function seedCanvas(
  name: string,
  overrides?: { id?: string },
): Promise<string> {
  const id = overrides?.id ?? `cv-${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}`;
  const now = new Date().toISOString();
  dbModule.prepare(
    `INSERT INTO canvases (id, name, description, emoji, mode, status, flow_data, is_template, node_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'idle', ?, 0, 1, ?, ?)`,
  ).run(
    id,
    name,
    'seeded for test',
    '🔷',
    'mixed',
    JSON.stringify({ nodes: [], edges: [] }),
    now,
    now,
  );

  // Materialize the KB file via syncResource so markDeprecated can find it.
  const row = dbModule.prepare('SELECT * FROM canvases WHERE id = ?').get(id) as Record<string, unknown> & { id: string };
  await syncResource('canvas', 'create', row, { author: 'test:seed', kbRoot: process['env']['KB_ROOT'] });
  invalidateKbIndex();
  return id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KB hook: delete_catflow sudo tool soft-delete via syncResource (KB-41)', () => {
  let tmpRoot: string;
  let kbRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'catbot-sudo-delete-'));
    ({ kbRoot } = createFixtureKb(tmpRoot));
    process['env']['KB_ROOT'] = kbRoot;
    invalidateKbIndex();
    ensureTables();
    wipeTables();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process['env']['KB_ROOT'];
    invalidateKbIndex();
  });

  // ──────────────────────────────────────────────────────────────────
  // T1 soft-delete with confirmed:true — the KB-41 happy path
  // ──────────────────────────────────────────────────────────────────

  it('T1 soft-delete with confirmed:true → DB row gone + KB deprecated + syncResource called', async () => {
    const id = await seedCanvas('Test156 Sudo Delete');
    const fname = findKbFile(kbRoot, 'canvases', id);
    expect(fname).toBeTruthy();
    const relPath = `resources/canvases/${fname}`;

    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');
    const invalidateSpy = vi.spyOn(kbIndexCacheModule, 'invalidateKbIndex');
    const markStaleSpy = vi.spyOn(kbAuditModule, 'markStale');

    const res = await executeSudoTool('delete_catflow', {
      identifier: id,
      confirmed: true,
    });

    const result = res.result as { status?: string; deleted?: { id: string; name: string } };
    expect(result.status).toBe('DELETED');
    expect(result.deleted?.id).toBe(id);

    // DB row gone (source-of-truth wins)
    const row = dbModule.prepare('SELECT id FROM canvases WHERE id = ?').get(id);
    expect(row).toBeUndefined();

    // syncResource called with 'canvas','delete',{id},hookCtx(catbot-sudo:delete_catflow)
    expect(syncSpy).toHaveBeenCalledWith(
      'canvas',
      'delete',
      expect.objectContaining({ id }),
      expect.objectContaining({ author: 'catbot-sudo:delete_catflow' }),
    );
    expect(invalidateSpy).toHaveBeenCalled();
    expect(markStaleSpy).not.toHaveBeenCalled();

    // KB file still exists with status: deprecated + deprecated_by
    expect(fs.existsSync(path.join(kbRoot, relPath))).toBe(true);
    const content = readKbFile(kbRoot, relPath);
    expect(content).toMatch(/^status:\s*deprecated/m);
    expect(content).toMatch(/^deprecated_by:\s*catbot-sudo:delete_catflow/m);
  });

  // ──────────────────────────────────────────────────────────────────
  // T2 CONFIRM_REQUIRED — confirmed:false / missing → preview only
  // ──────────────────────────────────────────────────────────────────

  it('T2 confirmed:false returns CONFIRM_REQUIRED: DB intact + syncResource NOT called', async () => {
    const id = await seedCanvas('Preview Only Canvas');
    const fname = findKbFile(kbRoot, 'canvases', id);
    expect(fname).toBeTruthy();

    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    const res = await executeSudoTool('delete_catflow', {
      identifier: id,
      // confirmed omitted
    });

    const result = res.result as { status?: string; preview?: unknown };
    expect(result.status).toBe('CONFIRM_REQUIRED');
    expect(result.preview).toBeTruthy();

    // DB row intact
    const row = dbModule.prepare('SELECT id FROM canvases WHERE id = ?').get(id);
    expect(row).toBeTruthy();

    // syncResource NOT called
    expect(syncSpy).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────
  // T3 AMBIGUOUS — 2 canvases with matching LIKE prefix
  // ──────────────────────────────────────────────────────────────────

  it('T3 AMBIGUOUS identifier: 2 matches → no delete, no syncResource', async () => {
    await seedCanvas('Fichajes Controller A');
    await seedCanvas('Fichajes Controller B');

    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    const res = await executeSudoTool('delete_catflow', {
      identifier: 'Fichajes',
      confirmed: true,
    });

    const result = res.result as { status?: string; matches?: Array<{ id: string; name: string }> };
    expect(result.status).toBe('AMBIGUOUS');
    expect(Array.isArray(result.matches)).toBe(true);
    expect(result.matches!.length).toBeGreaterThanOrEqual(2);

    // Both canvases still exist
    const remaining = dbModule.prepare('SELECT COUNT(*) as c FROM canvases').get() as { c: number };
    expect(remaining.c).toBe(2);

    // No syncResource invocation
    expect(syncSpy).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────
  // T4 purge:true hard-delete opt-in — NO syncResource call
  // ──────────────────────────────────────────────────────────────────

  it('T4 purge:true hard-delete path: DB DELETE executed but syncResource NOT called', async () => {
    const id = await seedCanvas('Purge Target Canvas');

    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');
    const invalidateSpy = vi.spyOn(kbIndexCacheModule, 'invalidateKbIndex');

    const res = await executeSudoTool('delete_catflow', {
      identifier: id,
      confirmed: true,
      purge: true,
    });

    const result = res.result as { status?: string; deleted?: { id: string } };
    expect(result.status).toBe('DELETED');
    expect(result.deleted?.id).toBe(id);

    // DB row gone
    const row = dbModule.prepare('SELECT id FROM canvases WHERE id = ?').get(id);
    expect(row).toBeUndefined();

    // syncResource explicitly SKIPPED on purge path
    expect(syncSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────
  // T5 Failure path: syncResource throws → DB still deleted + markStale
  // ──────────────────────────────────────────────────────────────────

  it('T5 syncResource throws during soft-delete: DB row still deleted + markStale fires', async () => {
    const id = await seedCanvas('Fail Sync Sudo Canvas');

    // Mock after seeding so seedCanvas itself succeeds
    vi.spyOn(knowledgeSyncModule, 'syncResource').mockRejectedValue(
      new Error('sync boom — sudo tool path'),
    );
    const loggerErrorSpy = vi.spyOn(loggerModule.logger, 'error');
    const markStaleSpy = vi.spyOn(kbAuditModule, 'markStale');
    const invalidateSpy = vi.spyOn(kbIndexCacheModule, 'invalidateKbIndex');

    const res = await executeSudoTool('delete_catflow', {
      identifier: id,
      confirmed: true,
    });

    const result = res.result as { status?: string; deleted?: { id: string } };
    // Hard-delete already ran before the hook — DB-wins guarantee
    expect(result.status).toBe('DELETED');
    expect(result.deleted?.id).toBe(id);

    const row = dbModule.prepare('SELECT id FROM canvases WHERE id = ?').get(id);
    expect(row).toBeUndefined();

    // logger.error called with source='kb-sync'
    const kbSyncErrorCalls = loggerErrorSpy.mock.calls.filter(c => c[0] === 'kb-sync');
    expect(kbSyncErrorCalls.length).toBeGreaterThanOrEqual(1);

    // markStale called with delete-sync-failed
    expect(markStaleSpy).toHaveBeenCalled();
    const markStaleCall = markStaleSpy.mock.calls[0];
    expect(markStaleCall[1]).toBe('delete-sync-failed');
    const details = markStaleCall[2] as { error?: string; db_id?: string; entity?: string };
    expect(details.error).toContain('sync boom');
    expect(details.db_id).toBe(id);
    expect(details.entity).toBe('canvases');

    // invalidateKbIndex NOT called on failure path
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
