// Phase 156-01 — KB sync hooks for /api/canvas POST/PATCH/DELETE routes (KB-40).
//
// Proves that the 3 canvas route handlers fire
//   await syncResource('canvas', op, row, {author: 'api:canvas.<METHOD>'})
//   + invalidateKbIndex()
// after their DB write succeeds, and that failures leave HTTP response shape
// untouched while writing a _sync_failures.md row.
//
// Test layout (T1-T5):
//   T1  POST /api/canvas            → 201 + syncResource('canvas','create') + KB file
//   T2  PATCH /api/canvas/[id]      → 200 + syncResource('canvas','update') + version bump
//   T3  DELETE /api/canvas/[id]     → 200 + syncResource('canvas','delete') + status: deprecated
//   T4  Failure path on POST        → 201 still + markStale fires + invalidateKbIndex NOT called
//   T5  PATCH noop short-circuit    → updates.length === 1 → no syncResource call
//
// Mirror pattern: kb-hooks-api-routes.test.ts (Phase 153). Wave 0 RED: these
// assertions WILL fail until Task 2 wires the canvas routes through syncResource.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// CRITICAL: set up test env BEFORE module imports (same pattern as
// kb-hooks-api-routes.test.ts).
vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  const tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'canvas-api-kb-sync-'));
  process['env']['DATABASE_PATH'] = nodePath.join(tmpDir, 'docflow-test.db');
  process['env']['CATBOT_DB_PATH'] = nodePath.join(tmpDir, 'catbot-test.db');
});

// Silence logger but keep spy-able.
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { NextRequest } from 'next/server';
import { POST as postCanvas } from '@/app/api/canvas/route';
import { PATCH as patchCanvas, DELETE as deleteCanvas } from '@/app/api/canvas/[id]/route';
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

function makeReq(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

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
// Table schema fixture — inline per RESEARCH §P-Q2 (no shared-helper refactor)
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KB hook: canvas API route handlers call syncResource on DB write (KB-40)', () => {
  let tmpRoot: string;
  let kbRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-api-kb-sync-'));
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
  // T1 POST hook
  // ──────────────────────────────────────────────────────────────────

  it("T1 POST /api/canvas fires syncResource('canvas','create') with author api:canvas.POST", async () => {
    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');
    const invalidateSpy = vi.spyOn(kbIndexCacheModule, 'invalidateKbIndex');

    const req = makeReq('http://localhost/api/canvas', 'POST', {
      name: 'Test Canvas',
      description: 'Canvas for POST hook test',
      mode: 'mixed',
    });
    const res = await postCanvas(req);
    expect(res.status).toBe(201);

    const body = (await res.json()) as { id: string; redirectUrl: string };
    expect(body.id).toBeTruthy();
    expect(body.redirectUrl).toBe(`/canvas/${body.id}`);

    expect(syncSpy).toHaveBeenCalledWith(
      'canvas',
      'create',
      expect.objectContaining({ id: body.id, name: 'Test Canvas' }),
      expect.objectContaining({ author: 'api:canvas.POST' }),
    );
    expect(invalidateSpy).toHaveBeenCalled();

    // KB file should exist under resources/canvases/<id8>-<slug>.md
    const fname = findKbFile(kbRoot, 'canvases', body.id);
    expect(fname).toBeTruthy();

    const content = readKbFile(kbRoot, `resources/canvases/${fname}`);
    expect(content).toMatch(/^status:\s*active/m);
  });

  // ──────────────────────────────────────────────────────────────────
  // T2 PATCH hook + version bump
  // ──────────────────────────────────────────────────────────────────

  it("T2 PATCH /api/canvas/[id] fires syncResource('canvas','update') with version bump", async () => {
    // Seed via POST so the KB file already exists
    const postRes = await postCanvas(
      makeReq('http://localhost/api/canvas', 'POST', {
        name: 'Patch Target Canvas',
        description: 'original',
        mode: 'mixed',
      }),
    );
    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as { id: string };

    const fname = findKbFile(kbRoot, 'canvases', created.id);
    expect(fname).toBeTruthy();
    const relPath = `resources/canvases/${fname}`;
    const beforeContent = readKbFile(kbRoot, relPath);
    expect(beforeContent).toMatch(/version:\s*1\.0\.0/);
    const beforeLogLines = (beforeContent.match(/^\s+-\s+\{.*version:/gm) || []).length;

    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    const patchRes = await patchCanvas(
      makeReq(`http://localhost/api/canvas/${created.id}`, 'PATCH', {
        description: 'updated — PATCH hook test',
      }),
      { params: { id: created.id } },
    );
    expect(patchRes.status).toBe(200);

    expect(syncSpy).toHaveBeenCalledWith(
      'canvas',
      'update',
      expect.objectContaining({ id: created.id }),
      expect.objectContaining({ author: 'api:canvas.PATCH' }),
    );

    const afterContent = readKbFile(kbRoot, relPath);
    const versionMatch = afterContent.match(/^version:\s*(\d+)\.(\d+)\.(\d+)/m);
    expect(versionMatch).toBeTruthy();
    const [, maj, min, pat] = versionMatch!;
    expect(Number(maj) * 10000 + Number(min) * 100 + Number(pat)).toBeGreaterThan(10000);

    const afterLogLines = (afterContent.match(/^\s+-\s+\{.*version:/gm) || []).length;
    expect(afterLogLines).toBeGreaterThanOrEqual(beforeLogLines + 1);
    expect(afterContent).toContain('api:canvas.PATCH');
  });

  // ──────────────────────────────────────────────────────────────────
  // T3 DELETE hook + soft-delete (status: deprecated)
  // ──────────────────────────────────────────────────────────────────

  it("T3 DELETE /api/canvas/[id] fires syncResource('canvas','delete') and leaves KB file with status: deprecated", async () => {
    // Seed via POST so the KB file exists before DELETE
    const postRes = await postCanvas(
      makeReq('http://localhost/api/canvas', 'POST', {
        name: 'Doomed Canvas',
        description: 'will be soft-deleted',
        mode: 'mixed',
      }),
    );
    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as { id: string };

    const fname = findKbFile(kbRoot, 'canvases', created.id);
    expect(fname).toBeTruthy();
    const relPath = `resources/canvases/${fname}`;

    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    const delRes = await deleteCanvas(
      makeReq(`http://localhost/api/canvas/${created.id}`, 'DELETE'),
      { params: { id: created.id } },
    );
    expect(delRes.status).toBe(200);

    expect(syncSpy).toHaveBeenCalledWith(
      'canvas',
      'delete',
      expect.objectContaining({ id: created.id }),
      expect.objectContaining({ author: 'api:canvas.DELETE' }),
    );

    // KB file still exists (soft-delete — never fs.unlink)
    expect(fs.existsSync(path.join(kbRoot, relPath))).toBe(true);

    const content = readKbFile(kbRoot, relPath);
    expect(content).toMatch(/^status:\s*deprecated/m);
    expect(content).toMatch(/^deprecated_at:/m);
  });

  // ──────────────────────────────────────────────────────────────────
  // T4 Failure path: syncResource throws → HTTP 201 unchanged + markStale
  // ──────────────────────────────────────────────────────────────────

  it('T4 POST failure path: syncResource throws → HTTP still 201 + markStale fires + invalidateKbIndex NOT called', async () => {
    vi.spyOn(knowledgeSyncModule, 'syncResource').mockRejectedValue(
      new Error('sync boom — simulated'),
    );
    const loggerErrorSpy = vi.spyOn(loggerModule.logger, 'error');
    const markStaleSpy = vi.spyOn(kbAuditModule, 'markStale');
    const invalidateSpy = vi.spyOn(kbIndexCacheModule, 'invalidateKbIndex');

    const req = makeReq('http://localhost/api/canvas', 'POST', {
      name: 'Will Fail Sync Canvas',
      mode: 'mixed',
    });
    const res = await postCanvas(req);
    // HTTP invariant — 201 even when hook fails
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; redirectUrl: string };
    expect(body.id).toBeTruthy();

    // DB persisted — source of truth wins
    const row = dbModule.prepare('SELECT id FROM canvases WHERE id = ?').get(body.id);
    expect(row).toBeTruthy();

    // logger.error called with source='kb-sync'
    const kbSyncErrorCalls = loggerErrorSpy.mock.calls.filter(c => c[0] === 'kb-sync');
    expect(kbSyncErrorCalls.length).toBeGreaterThanOrEqual(1);

    // markStale called with correct reason
    expect(markStaleSpy).toHaveBeenCalled();
    const markStaleCall = markStaleSpy.mock.calls[0];
    expect(markStaleCall[1]).toBe('create-sync-failed');
    const details = markStaleCall[2] as { error?: string; db_id?: string; entity?: string };
    expect(details.error).toContain('sync boom');
    expect(details.db_id).toBe(body.id);
    expect(details.entity).toBe('canvases');

    // invalidateKbIndex NOT called on failure path
    expect(invalidateSpy).not.toHaveBeenCalled();

    // _sync_failures.md file created
    const failPath = path.join(kbRoot, '_sync_failures.md');
    expect(fs.existsSync(failPath)).toBe(true);
    const failContent = fs.readFileSync(failPath, 'utf8');
    expect(failContent).toContain('create-sync-failed');
    expect(failContent).toContain('canvases');
    expect(failContent).toContain(body.id);
  });

  // ──────────────────────────────────────────────────────────────────
  // T5 PATCH noop short-circuit — only updated_at added → no hook call
  // ──────────────────────────────────────────────────────────────────

  it('T5 PATCH with empty body (only updated_at) short-circuits: syncResource NOT called', async () => {
    // Seed via POST
    const postRes = await postCanvas(
      makeReq('http://localhost/api/canvas', 'POST', {
        name: 'Noop PATCH Target',
        mode: 'mixed',
      }),
    );
    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as { id: string };

    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    // Empty body — route's short-circuit at updates.length === 1 kicks in
    // (only updated_at would be pushed). No real update happens → no hook fires.
    const patchRes = await patchCanvas(
      makeReq(`http://localhost/api/canvas/${created.id}`, 'PATCH', {}),
      { params: { id: created.id } },
    );
    expect(patchRes.status).toBe(200);

    // syncResource MUST NOT be called on the noop path
    expect(syncSpy).not.toHaveBeenCalled();
  });
});
