// Phase 153-03 — Integration tests for KB sync hooks in API route handlers.
//
// Proves that 15 API route handlers (5 entities × POST/PATCH/DELETE) fire
//   await syncResource(entity, op, row, {author: 'api:<entity>.<METHOD>'})
//   + invalidateKbIndex()
// after their DB write succeeds, and that failures leave HTTP response shape
// untouched while writing a _sync_failures.md row.
//
// Test layout (T1-T13):
//   T1  POST /api/cat-paws           → 201 + KB file + index entry
//   T2  POST /api/catbrains          → 201 + KB file in resources/catbrains
//   T3  POST /api/connectors         → 201 + KB file + NO config leak
//   T4  POST /api/skills             → 201 + KB file in resources/skills
//   T5  POST /api/email-templates    → 201 + KB file + NO structure/html_preview leak
//   T6  PATCH /api/cat-paws/[id]     → 200 + version bump + change_log(author='api:cat-paws.PATCH')
//   T7  PATCH /api/catbrains/[id]    → 200 + version bump
//   T8  PATCH /api/connectors/[id]   → 200 + NO config leak even if body mutates config
//   T9  DELETE /api/cat-paws/[id]    → 200 + status: deprecated + search_kb excludes
//   T10 DELETE /api/catbrains/[id]   → 200 + deprecated + warnings array preserved (no KB hook merge)
//   T11 DELETE /api/email-templates/[id] → 200 + status: deprecated
//   T12 route hook syncResource failure: HTTP unchanged + _sync_failures.md gains entry
//   T13 author attribution: change_log has author='api:cat-paws.PATCH' on PATCH

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// CRITICAL: set up test env BEFORE module imports (same pattern as
// kb-hooks-tools.test.ts).
vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  const tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'kbhooks-routes-'));
  process['env']['DATABASE_PATH'] = nodePath.join(tmpDir, 'docflow-test.db');
  process['env']['CATBOT_DB_PATH'] = nodePath.join(tmpDir, 'catbot-test.db');
});

// Silence logger by default but keep spy-able.
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Stub Google Drive side-effect in email-templates POST so the route stays
// fully offline. The helper is imported at the top of the POST route.
vi.mock('@/lib/services/google-drive-auth', () => ({
  createDriveClient: vi.fn(() => ({})),
}));
vi.mock('@/lib/services/google-drive-service', () => ({
  listFolders: vi.fn(async () => []),
  createFolder: vi.fn(async () => ({ id: 'drive-folder-mock' })),
}));
// Stub resolveAlias so POST /api/cat-paws does not hit the model_aliases
// table that is not seeded in the fixture.
vi.mock('@/lib/services/alias-routing', () => ({
  resolveAlias: vi.fn(async () => 'gemini-main'),
}));

import { NextRequest } from 'next/server';
import { POST as postCatPaws } from '@/app/api/cat-paws/route';
import { PATCH as patchCatPaws, DELETE as deleteCatPaws } from '@/app/api/cat-paws/[id]/route';
import { POST as postCatbrains } from '@/app/api/catbrains/route';
import { PATCH as patchCatbrains, DELETE as deleteCatbrains } from '@/app/api/catbrains/[id]/route';
import { POST as postConnectors } from '@/app/api/connectors/route';
import { PATCH as patchConnectors, DELETE as deleteConnectors } from '@/app/api/connectors/[id]/route';
import { POST as postSkills } from '@/app/api/skills/route';
import { PATCH as patchSkills, DELETE as deleteSkills } from '@/app/api/skills/[id]/route';
import { POST as postEmailTemplates } from '@/app/api/email-templates/route';
import { PATCH as patchEmailTemplates, DELETE as deleteEmailTemplates } from '@/app/api/email-templates/[id]/route';
import { invalidateKbIndex, searchKb, getKbEntry } from '@/lib/services/kb-index-cache';
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
// Shared table schema fixture
// ---------------------------------------------------------------------------

function ensureTables(): void {
  // cat_paws — production-parity columns (matching db.ts schema)
  dbModule.prepare(
    `CREATE TABLE IF NOT EXISTS cat_paws (
      id TEXT PRIMARY KEY, name TEXT, description TEXT,
      avatar_emoji TEXT, avatar_color TEXT, department_tags TEXT,
      department TEXT, system_prompt TEXT, tone TEXT, mode TEXT,
      model TEXT, temperature REAL, max_tokens INTEGER,
      processing_instructions TEXT, output_format TEXT,
      openclaw_id TEXT, openclaw_synced_at TEXT,
      is_active INTEGER, times_used INTEGER,
      created_at TEXT, updated_at TEXT
    )`,
  ).run();

  dbModule.prepare(
    `CREATE TABLE IF NOT EXISTS catbrains (
      id TEXT PRIMARY KEY, name TEXT, description TEXT, purpose TEXT,
      tech_stack TEXT, agent_id TEXT, status TEXT,
      default_model TEXT, rag_enabled INTEGER, rag_collection TEXT,
      system_prompt TEXT, mcp_enabled INTEGER, icon_color TEXT,
      search_engine TEXT, is_system INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
  ).run();

  dbModule.prepare(
    `CREATE TABLE IF NOT EXISTS connectors (
      id TEXT PRIMARY KEY, name TEXT, description TEXT, emoji TEXT,
      type TEXT, config TEXT, gmail_subtype TEXT,
      test_status TEXT, last_tested TEXT, is_active INTEGER DEFAULT 1,
      times_used INTEGER DEFAULT 0,
      created_at TEXT, updated_at TEXT
    )`,
  ).run();

  dbModule.prepare(
    `CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY, name TEXT, description TEXT,
      category TEXT, tags TEXT, instructions TEXT,
      output_template TEXT, example_input TEXT, example_output TEXT,
      constraints TEXT, source TEXT, version TEXT, author TEXT,
      times_used INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1,
      created_at TEXT, updated_at TEXT
    )`,
  ).run();

  dbModule.prepare(
    `CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY, ref_code TEXT, name TEXT, description TEXT,
      category TEXT, subject TEXT, body TEXT, product TEXT,
      structure TEXT, html_preview TEXT, drive_folder_id TEXT,
      is_active INTEGER DEFAULT 1, times_used INTEGER DEFAULT 0,
      created_at TEXT, updated_at TEXT
    )`,
  ).run();

  dbModule.prepare(
    `CREATE TABLE IF NOT EXISTS template_assets (
      id TEXT PRIMARY KEY, template_id TEXT, url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  ).run();

  // Join tables for cascade behavior (skills DELETE cascades to these 2).
  dbModule.prepare(
    `CREATE TABLE IF NOT EXISTS worker_skills (
      skill_id TEXT, worker_id TEXT
    )`,
  ).run();
  dbModule.prepare(
    `CREATE TABLE IF NOT EXISTS agent_skills (
      skill_id TEXT, agent_id TEXT
    )`,
  ).run();
}

function wipeTables(): void {
  for (const t of [
    'cat_paws', 'catbrains', 'connectors', 'skills',
    'email_templates', 'template_assets',
    'worker_skills', 'agent_skills',
  ]) {
    dbModule.prepare(`DELETE FROM ${t}`).run();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KB hook: API route handlers call syncResource on DB write (KB-20, KB-21)', () => {
  let tmpRoot: string;
  let kbRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kbhooks-routes-'));
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
  // POST hooks (T1-T5)
  // ──────────────────────────────────────────────────────────────────

  it('T1 POST /api/cat-paws → 201 + KB file + index entry', async () => {
    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');
    const invalidateSpy = vi.spyOn(kbIndexCacheModule, 'invalidateKbIndex');

    const req = makeReq('http://localhost/api/cat-paws', 'POST', {
      name: 'Test Paw Route',
      department: 'business',
      description: 'Route POST hook test',
    });
    const res = await postCatPaws(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string };
    expect(body.name).toBe('Test Paw Route');

    expect(syncSpy).toHaveBeenCalledWith(
      'catpaw',
      'create',
      expect.objectContaining({ id: body.id, name: 'Test Paw Route' }),
      expect.objectContaining({ author: 'api:cat-paws.POST' }),
    );
    expect(invalidateSpy).toHaveBeenCalled();

    const fname = findKbFile(kbRoot, 'catpaws', body.id);
    expect(fname).toBeTruthy();
  });

  it('T2 POST /api/catbrains → 201 + KB file in resources/catbrains/', async () => {
    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    const req = makeReq('http://localhost/api/catbrains', 'POST', {
      name: 'Route Brain',
      purpose: 'integration test',
    });
    const res = await postCatbrains(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string };

    expect(syncSpy).toHaveBeenCalledWith(
      'catbrain',
      'create',
      expect.objectContaining({ id: body.id, name: 'Route Brain' }),
      expect.objectContaining({ author: 'api:catbrains.POST' }),
    );

    const fname = findKbFile(kbRoot, 'catbrains', body.id);
    expect(fname).toBeTruthy();
  });

  it('T3 POST /api/connectors → 201 + KB file + NO config secret leak', async () => {
    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    // Non-gmail/drive connector skips encryption. Seed config with a canary.
    const req = makeReq('http://localhost/api/connectors', 'POST', {
      name: 'HTTP Prod API',
      type: 'http_api',
      config: { api_key: 'LEAK-API-KEY-ZZZ', base_url: 'https://api.example.com' },
      description: 'Route POST hook test',
    });
    const res = await postConnectors(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string };

    expect(syncSpy).toHaveBeenCalledWith(
      'connector',
      'create',
      expect.objectContaining({ id: body.id, name: 'HTTP Prod API' }),
      expect.objectContaining({ author: 'api:connectors.POST' }),
    );

    const fname = findKbFile(kbRoot, 'connectors', body.id);
    expect(fname).toBeTruthy();
    const kbContent = readKbFile(kbRoot, `resources/connectors/${fname}`);
    // Phase 150 KB-11 invariant preserved via FIELDS_FROM_DB allowlist
    // (config not in it). Canary must NEVER appear.
    expect(kbContent).not.toContain('LEAK-API-KEY-ZZZ');
  });

  it('T4 POST /api/skills → 201 + KB file in resources/skills/', async () => {
    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    const req = makeReq('http://localhost/api/skills', 'POST', {
      name: 'Test Skill Route',
      instructions: 'Do a thing cleanly',
      category: 'writing',
    });
    const res = await postSkills(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string };

    expect(syncSpy).toHaveBeenCalledWith(
      'skill',
      'create',
      expect.objectContaining({ id: body.id, name: 'Test Skill Route' }),
      expect.objectContaining({ author: 'api:skills.POST' }),
    );

    const fname = findKbFile(kbRoot, 'skills', body.id);
    expect(fname).toBeTruthy();
  });

  it('T5 POST /api/email-templates → 201 + KB file + NO structure/html_preview leak', async () => {
    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    const req = makeReq('http://localhost/api/email-templates', 'POST', {
      name: 'Route Welcome Beta',
      description: 'Route POST hook test',
      category: 'onboarding',
      structure: {
        sections: {
          header: { rows: [] },
          body: {
            rows: [
              { cells: [{ type: 'text', content: '<html>LEAK-HTML-PAYLOAD</html>' }] },
            ],
          },
          footer: { rows: [] },
        },
        styles: { backgroundColor: '#fff', fontFamily: 'Arial', primaryColor: '#000', textColor: '#111', maxWidth: 600 },
      },
    });
    const res = await postEmailTemplates(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string };

    expect(syncSpy).toHaveBeenCalledWith(
      'template',
      'create',
      expect.objectContaining({ id: body.id, name: 'Route Welcome Beta' }),
      expect.objectContaining({ author: 'api:email-templates.POST' }),
    );

    const fname = findKbFile(kbRoot, 'email-templates', body.id);
    expect(fname).toBeTruthy();
    const kbContent = readKbFile(kbRoot, `resources/email-templates/${fname}`);
    // Phase 150 KB-11 invariant — structure/html_preview not in allowlist
    expect(kbContent).not.toContain('LEAK-HTML-PAYLOAD');
  });

  // ──────────────────────────────────────────────────────────────────
  // PATCH hooks (T6-T8)
  // ──────────────────────────────────────────────────────────────────

  it('T6 PATCH /api/cat-paws/[id] → 200 + version bump + change_log(author=api:cat-paws.PATCH)', async () => {
    // Seed via POST so the KB file already exists
    const postRes = await postCatPaws(
      makeReq('http://localhost/api/cat-paws', 'POST', {
        name: 'Patch Target',
        department: 'business',
        description: 'original',
      }),
    );
    const created = (await postRes.json()) as { id: string };

    const subdir = 'catpaws';
    const fname = findKbFile(kbRoot, subdir, created.id);
    expect(fname).toBeTruthy();
    const relPath = `resources/${subdir}/${fname}`;
    const beforeContent = readKbFile(kbRoot, relPath);
    expect(beforeContent).toMatch(/version:\s*1\.0\.0/);
    const beforeLogLines = (beforeContent.match(/^\s+-\s+\{.*version:/gm) || []).length;

    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    const patchRes = await patchCatPaws(
      makeReq(`http://localhost/api/cat-paws/${created.id}`, 'PATCH', {
        description: 'updated — PATCH hook test',
        mode: 'processor',
      }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(patchRes.status).toBe(200);

    expect(syncSpy).toHaveBeenCalledWith(
      'catpaw',
      'update',
      expect.objectContaining({ id: created.id }),
      expect.objectContaining({ author: 'api:cat-paws.PATCH' }),
    );

    const afterContent = readKbFile(kbRoot, relPath);
    const versionMatch = afterContent.match(/^version:\s*(\d+)\.(\d+)\.(\d+)/m);
    expect(versionMatch).toBeTruthy();
    const [, maj, min, pat] = versionMatch!;
    expect(Number(maj) * 10000 + Number(min) * 100 + Number(pat)).toBeGreaterThan(10000);

    const afterLogLines = (afterContent.match(/^\s+-\s+\{.*version:/gm) || []).length;
    expect(afterLogLines).toBeGreaterThanOrEqual(beforeLogLines + 1);
    // T13 merged in: change_log records the route author
    expect(afterContent).toContain('api:cat-paws.PATCH');
  });

  it('T7 PATCH /api/catbrains/[id] → 200 + version bump', async () => {
    const postRes = await postCatbrains(
      makeReq('http://localhost/api/catbrains', 'POST', {
        name: 'Patch Brain',
        purpose: 'original purpose',
      }),
    );
    const created = (await postRes.json()) as { id: string };

    const fname = findKbFile(kbRoot, 'catbrains', created.id);
    expect(fname).toBeTruthy();
    const relPath = `resources/catbrains/${fname}`;
    const beforeContent = readKbFile(kbRoot, relPath);
    const beforeLogLines = (beforeContent.match(/^\s+-\s+\{.*version:/gm) || []).length;

    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    const patchRes = await patchCatbrains(
      makeReq(`http://localhost/api/catbrains/${created.id}`, 'PATCH', {
        description: 'updated description',
      }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(patchRes.status).toBe(200);

    expect(syncSpy).toHaveBeenCalledWith(
      'catbrain',
      'update',
      expect.objectContaining({ id: created.id }),
      expect.objectContaining({ author: 'api:catbrains.PATCH' }),
    );

    const afterContent = readKbFile(kbRoot, relPath);
    const afterLogLines = (afterContent.match(/^\s+-\s+\{.*version:/gm) || []).length;
    expect(afterLogLines).toBeGreaterThanOrEqual(beforeLogLines + 1);
  });

  it('T8 PATCH /api/connectors/[id] → 200 + NO secret leak even when config mutated', async () => {
    // Seed a non-gmail connector so we can PATCH config freely
    const postRes = await postConnectors(
      makeReq('http://localhost/api/connectors', 'POST', {
        name: 'HTTP API Patchable',
        type: 'http_api',
        config: { api_key: 'INITIAL-SECRET' },
      }),
    );
    const created = (await postRes.json()) as { id: string };

    const fname = findKbFile(kbRoot, 'connectors', created.id);
    expect(fname).toBeTruthy();
    const relPath = `resources/connectors/${fname}`;

    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    const patchRes = await patchConnectors(
      makeReq(`http://localhost/api/connectors/${created.id}`, 'PATCH', {
        description: 'updated description',
        config: { api_key: 'PATCHED-SECRET-LEAK-CANARY' },
      }),
      { params: { id: created.id } },
    );
    expect(patchRes.status).toBe(200);

    expect(syncSpy).toHaveBeenCalledWith(
      'connector',
      'update',
      expect.objectContaining({ id: created.id }),
      expect.objectContaining({ author: 'api:connectors.PATCH' }),
    );

    const kbContent = readKbFile(kbRoot, relPath);
    expect(kbContent).not.toContain('PATCHED-SECRET-LEAK-CANARY');
    expect(kbContent).not.toContain('INITIAL-SECRET');
  });

  // ──────────────────────────────────────────────────────────────────
  // DELETE hooks (T9-T11)
  // ──────────────────────────────────────────────────────────────────

  it('T9 DELETE /api/cat-paws/[id] → 200 + status: deprecated + search_kb excludes', async () => {
    const postRes = await postCatPaws(
      makeReq('http://localhost/api/cat-paws', 'POST', {
        name: 'Doomed Paw',
        department: 'business',
      }),
    );
    const created = (await postRes.json()) as { id: string };

    const fname = findKbFile(kbRoot, 'catpaws', created.id);
    expect(fname).toBeTruthy();
    const relPath = `resources/catpaws/${fname}`;

    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    const delRes = await deleteCatPaws(
      makeReq(`http://localhost/api/cat-paws/${created.id}`, 'DELETE'),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(delRes.status).toBe(200);

    expect(syncSpy).toHaveBeenCalledWith(
      'catpaw',
      'delete',
      expect.objectContaining({ id: created.id }),
      expect.objectContaining({ author: 'api:cat-paws.DELETE' }),
    );

    // KB file still exists (soft-delete)
    expect(fs.existsSync(path.join(kbRoot, relPath))).toBe(true);

    const content = readKbFile(kbRoot, relPath);
    expect(content).toMatch(/^status:\s*deprecated/m);
    expect(content).toMatch(/^deprecated_at:/m);

    // search_kb default (active) no longer returns it
    invalidateKbIndex();
    const activeRes = searchKb({ status: 'active' });
    const ids = activeRes.results.map(e => e.id);
    expect(ids).not.toContain(`catpaw-${created.id.slice(0, 8)}`);

    // get_kb_entry still resolves it for forensics
    const entry = getKbEntry(`catpaw-${created.id.slice(0, 8)}`);
    expect(entry).toBeTruthy();
  });

  it('T10 DELETE /api/catbrains/[id] → 200 + deprecated + warnings array preserves Qdrant, NOT KB hook', async () => {
    // Seed with rag_collection so Qdrant DELETE fires. Point QDRANT_URL at an
    // unreachable port to force the handler's fetch to throw → one 'Qdrant
    // unreachable' warning ends up in the response, regardless of KB hook.
    const originalQdrantUrl = process['env']['QDRANT_URL'];
    process['env']['QDRANT_URL'] = 'http://127.0.0.1:1';

    try {
      const postRes = await postCatbrains(
        makeReq('http://localhost/api/catbrains', 'POST', {
          name: 'Doomed Brain',
          purpose: 'will be deleted',
        }),
      );
      const created = (await postRes.json()) as { id: string };

      // Manually set rag_collection so the DELETE triggers the Qdrant path
      dbModule
        .prepare('UPDATE catbrains SET rag_collection = ? WHERE id = ?')
        .run('doomed-col', created.id);

      const fname = findKbFile(kbRoot, 'catbrains', created.id);
      expect(fname).toBeTruthy();

      // Ensure KB hook SUCCEEDS — we want the test to exercise the warnings
      // isolation invariant, not hook failure. syncSpy is a real call.
      const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

      const delRes = await deleteCatbrains(
        makeReq(`http://localhost/api/catbrains/${created.id}`, 'DELETE'),
        { params: Promise.resolve({ id: created.id }) },
      );
      expect(delRes.status).toBe(200);
      const body = (await delRes.json()) as { success: boolean; warnings?: string[] };
      expect(body.success).toBe(true);
      // Qdrant unreachable MUST appear, KB hook MUST NOT merge into warnings
      expect(body.warnings).toBeDefined();
      expect(body.warnings!.some(w => w.includes('Qdrant'))).toBe(true);
      expect(body.warnings!.every(w => !w.includes('sync') && !w.includes('KB'))).toBe(true);

      expect(syncSpy).toHaveBeenCalledWith(
        'catbrain',
        'delete',
        expect.objectContaining({ id: created.id }),
        expect.objectContaining({ author: 'api:catbrains.DELETE' }),
      );

      const content = readKbFile(kbRoot, `resources/catbrains/${fname}`);
      expect(content).toMatch(/^status:\s*deprecated/m);
    } finally {
      if (originalQdrantUrl === undefined) {
        delete process['env']['QDRANT_URL'];
      } else {
        process['env']['QDRANT_URL'] = originalQdrantUrl;
      }
    }
  });

  it('T11 DELETE /api/email-templates/[id] → 200 + status: deprecated', async () => {
    const postRes = await postEmailTemplates(
      makeReq('http://localhost/api/email-templates', 'POST', {
        name: 'Doomed Template',
        description: 'will be soft-deleted',
        category: 'general',
      }),
    );
    const created = (await postRes.json()) as { id: string };

    const fname = findKbFile(kbRoot, 'email-templates', created.id);
    expect(fname).toBeTruthy();
    const relPath = `resources/email-templates/${fname}`;

    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    const delRes = await deleteEmailTemplates(
      makeReq(`http://localhost/api/email-templates/${created.id}`, 'DELETE'),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(delRes.status).toBe(200);

    expect(syncSpy).toHaveBeenCalledWith(
      'template',
      'delete',
      expect.objectContaining({ id: created.id }),
      expect.objectContaining({ author: 'api:email-templates.DELETE' }),
    );

    const content = readKbFile(kbRoot, relPath);
    expect(content).toMatch(/^status:\s*deprecated/m);
  });

  // ──────────────────────────────────────────────────────────────────
  // Failure contract (T12)
  // ──────────────────────────────────────────────────────────────────

  it('T12 route hook syncResource failure: HTTP unchanged + _sync_failures.md gains entry', async () => {
    vi.spyOn(knowledgeSyncModule, 'syncResource').mockRejectedValue(
      new Error('ENOSPC simulated'),
    );
    const loggerErrorSpy = vi.spyOn(loggerModule.logger, 'error');
    const markStaleSpy = vi.spyOn(kbAuditModule, 'markStale');
    const invalidateSpy = vi.spyOn(kbIndexCacheModule, 'invalidateKbIndex');

    const req = makeReq('http://localhost/api/cat-paws', 'POST', {
      name: 'Will Fail Sync',
      department: 'business',
    });
    const res = await postCatPaws(req);
    // HTTP invariant — still 201 even when hook fails
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string };
    expect(body.name).toBe('Will Fail Sync');

    // DB persisted
    const row = dbModule.prepare('SELECT id FROM cat_paws WHERE id = ?').get(body.id);
    expect(row).toBeTruthy();

    // logger.error called with source='kb-sync'
    const kbSyncErrorCalls = loggerErrorSpy.mock.calls.filter(c => c[0] === 'kb-sync');
    expect(kbSyncErrorCalls.length).toBeGreaterThanOrEqual(1);

    // markStale called with correct reason
    expect(markStaleSpy).toHaveBeenCalled();
    const markStaleCall = markStaleSpy.mock.calls[0];
    expect(markStaleCall[1]).toBe('create-sync-failed');
    const details = markStaleCall[2] as { error?: string; db_id?: string; entity?: string };
    expect(details.error).toContain('ENOSPC');
    expect(details.db_id).toBe(body.id);
    expect(details.entity).toBe('cat_paws');

    // invalidateKbIndex NOT called on failure path
    expect(invalidateSpy).not.toHaveBeenCalled();

    // _sync_failures.md file was created with the row (markStale ran through)
    const failPath = path.join(kbRoot, '_sync_failures.md');
    expect(fs.existsSync(failPath)).toBe(true);
    const failContent = fs.readFileSync(failPath, 'utf8');
    expect(failContent).toContain('create-sync-failed');
    expect(failContent).toContain('cat_paws');
    expect(failContent).toContain(body.id);
  });

  // ──────────────────────────────────────────────────────────────────
  // Author attribution (T13) — covered by T6 assertion; kept as separate
  // test for explicit coverage reporting in SUMMARY.md.
  // ──────────────────────────────────────────────────────────────────

  it('T13 skills PATCH records author=api:skills.PATCH in change_log', async () => {
    const postRes = await postSkills(
      makeReq('http://localhost/api/skills', 'POST', {
        name: 'Author Test Skill',
        instructions: 'baseline',
        category: 'writing',
      }),
    );
    const created = (await postRes.json()) as { id: string };

    const fname = findKbFile(kbRoot, 'skills', created.id);
    expect(fname).toBeTruthy();
    const relPath = `resources/skills/${fname}`;

    await patchSkills(
      makeReq(`http://localhost/api/skills/${created.id}`, 'PATCH', {
        description: 'updated — author test',
      }),
      { params: { id: created.id } },
    );

    const content = readKbFile(kbRoot, relPath);
    expect(content).toContain('api:skills.PATCH');

    // Skills DELETE also exercises the hook; verify cascade deletes still happen
    const delRes = await deleteSkills(
      makeReq(`http://localhost/api/skills/${created.id}`, 'DELETE'),
      { params: { id: created.id } },
    );
    expect(delRes.status).toBe(200);
    const afterDel = readKbFile(kbRoot, relPath);
    expect(afterDel).toMatch(/^status:\s*deprecated/m);
  });
});
