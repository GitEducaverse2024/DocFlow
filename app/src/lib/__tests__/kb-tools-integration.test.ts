import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Set up test env BEFORE module imports.
// CRITICAL: the DB module (app/src/lib/db.ts:6) reads `DATABASE_PATH`, NOT
// `DB_PATH`. Hoisting `DB_PATH` is a no-op and would cause seed writes to hit
// the real host docflow.db. Also hoist `CATBOT_DB_PATH` to redirect the
// Catbot-specific sqlite (catbot-db) away from the real host file.
vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  const tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'kbintg-'));
  process['env']['CATBOT_DB_PATH'] = nodePath.join(tmpDir, 'catbot-test.db');
  // Redirect main DB to tmp so seed rows don't pollute real docflow.db.
  // db.ts reads `DATABASE_PATH` (not `DB_PATH`) — using the wrong name is a
  // silent no-op and opens the real DB at data/docflow.db.
  process['env']['DATABASE_PATH'] = nodePath.join(tmpDir, 'docflow-test.db');
});

import { executeTool } from '@/lib/services/catbot-tools';
import { invalidateKbIndex } from '@/lib/services/kb-index-cache';
import { createFixtureKb } from './kb-test-utils';
import dbModule from '@/lib/db';

describe('list_* tools inject kb_entry (KB-17 integration)', () => {
  let tmpRoot: string;
  let kbRoot: string;
  let originalFetch: typeof global.fetch;

  // IDs must match createFixtureKb's source_of_truth values exactly:
  const CATPAW_DB_ID = 'aaa11111-1111-1111-1111-111111111111';
  const CATBRAIN_DB_ID = 'ccc33333-3333-3333-3333-333333333333';
  const SKILL_DB_ID = 'writer-skill';
  const TEMPLATE_DB_ID = 'tpl-welcome';
  const CANVAS_DB_ID = 'ddd44444-4444-4444-4444-444444444444';

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kbintg-'));
    ({ kbRoot } = createFixtureKb(tmpRoot));
    process['env']['KB_ROOT'] = kbRoot;
    invalidateKbIndex();
    // Warning 5 — save global.fetch BEFORE any test mocks it so afterEach
    // can restore it (vitest does NOT reset global.fetch between describes).
    originalFetch = global.fetch;

    // Ensure the minimal tables we need for list_* tests exist, then wipe.
    dbModule.prepare("CREATE TABLE IF NOT EXISTS cat_paws (id TEXT PRIMARY KEY, name TEXT, avatar_emoji TEXT, mode TEXT, model TEXT, department TEXT, is_active INTEGER, description TEXT, system_prompt TEXT, temperature REAL, max_tokens INTEGER, output_format TEXT, created_at TEXT, updated_at TEXT)").run();
    dbModule.prepare('CREATE TABLE IF NOT EXISTS cat_paw_skills (paw_id TEXT, skill_id TEXT)').run();
    dbModule.prepare('CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, name TEXT, description TEXT, category TEXT, tags TEXT, source TEXT, is_featured INTEGER)').run();
    dbModule.prepare('CREATE TABLE IF NOT EXISTS catbrains (id TEXT PRIMARY KEY, name TEXT, status TEXT, created_at TEXT, updated_at TEXT)').run();
    dbModule.prepare('CREATE TABLE IF NOT EXISTS email_templates (id TEXT PRIMARY KEY, ref_code TEXT, name TEXT, description TEXT, category TEXT, is_active INTEGER, times_used INTEGER, created_at TEXT, updated_at TEXT)').run();
    dbModule.prepare('DELETE FROM cat_paws').run();
    dbModule.prepare('DELETE FROM cat_paw_skills').run();
    dbModule.prepare('DELETE FROM skills').run();
    dbModule.prepare('DELETE FROM catbrains').run();
    dbModule.prepare('DELETE FROM email_templates').run();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process['env']['KB_ROOT'];
    invalidateKbIndex();
    // Warning 5 — restore global.fetch so other test suites don't inherit a
    // stale vi.fn() mock (canvas_list + any future fetch-mocking describe).
    global.fetch = originalFetch;
  });

  describe('list_cat_paws', () => {
    it('returns rows with kb_entry resolved for matching DB id and null for orphan rows', async () => {
      dbModule
        .prepare("INSERT INTO cat_paws (id, name, mode, model, department, is_active, description, created_at, updated_at) VALUES (?, 'Test', 'chat', 'gemini-main', 'other', 1, 'desc', '2026-01-01', '2026-01-01')")
        .run(CATPAW_DB_ID);
      dbModule
        .prepare("INSERT INTO cat_paws (id, name, mode, model, department, is_active, description, created_at, updated_at) VALUES (?, 'Orphan', 'chat', 'gemini-main', 'other', 1, 'desc', '2026-01-01', '2026-01-01')")
        .run('orphan-no-kb-file');

      const res = await executeTool('list_cat_paws', {}, 'http://test');
      const rows = res.result as Array<{ id: string; kb_entry: string | null }>;
      const matched = rows.find(r => r.id === CATPAW_DB_ID);
      const orphan = rows.find(r => r.id === 'orphan-no-kb-file');
      expect(matched?.kb_entry).toBe('resources/catpaws/aaa11111-test-catpaw.md');
      expect(orphan?.kb_entry).toBeNull();
    });
  });

  describe('list_catbrains', () => {
    it('returns rows with kb_entry', async () => {
      dbModule
        .prepare('INSERT INTO catbrains (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(CATBRAIN_DB_ID, 'Test', 'active', '2026-01-01', '2026-01-01');
      dbModule
        .prepare('INSERT INTO catbrains (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run('orphan-catbrain', 'Orphan', 'active', '2026-01-01', '2026-01-01');

      const res = await executeTool('list_catbrains', {}, 'http://test');
      const rows = res.result as Array<{ id: string; kb_entry: string | null }>;
      const matched = rows.find(r => r.id === CATBRAIN_DB_ID);
      const orphan = rows.find(r => r.id === 'orphan-catbrain');
      expect(matched?.kb_entry).toBe('resources/catbrains/ccc33333-test-catbrain.md');
      expect(orphan?.kb_entry).toBeNull();
    });
  });

  describe('list_skills', () => {
    it('returns {count, skills[]} with kb_entry on each skill', async () => {
      dbModule
        .prepare('INSERT INTO skills (id, name, description, category, tags, source, is_featured, instructions) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
        .run(SKILL_DB_ID, 'Writer', 'Writer skill', 'writing', '[]', 'system', 'test instructions');
      dbModule
        .prepare('INSERT INTO skills (id, name, description, category, tags, source, is_featured, instructions) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
        .run('orphan-skill', 'Orphan', 'Orphan skill', 'writing', '[]', 'user', 'orphan instructions');

      const res = await executeTool('list_skills', {}, 'http://test');
      const shape = res.result as { count: number; skills: Array<{ id: string; kb_entry: string | null }> };
      expect(typeof shape.count).toBe('number');
      const matched = shape.skills.find(s => s.id === SKILL_DB_ID);
      const orphan = shape.skills.find(s => s.id === 'orphan-skill');
      expect(matched?.kb_entry).toBe('resources/skills/test-skill-writer.md');
      expect(orphan?.kb_entry).toBeNull();
    });
  });

  describe('list_email_templates', () => {
    it('returns rows with kb_entry', async () => {
      dbModule
        .prepare('INSERT INTO email_templates (id, ref_code, name, description, category, is_active, times_used, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)')
        .run(TEMPLATE_DB_ID, 'Pro-X', 'Welcome', 'Welcome email', 'onboarding', '2026-01-01', '2026-01-01');
      dbModule
        .prepare('INSERT INTO email_templates (id, ref_code, name, description, category, is_active, times_used, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)')
        .run('orphan-template', 'Orph-1', 'Orphan', 'Orphan email', 'onboarding', '2026-01-01', '2026-01-01');

      const res = await executeTool('list_email_templates', {}, 'http://test');
      const rows = res.result as Array<{ id: string; kb_entry: string | null }>;
      const matched = rows.find(r => r.id === TEMPLATE_DB_ID);
      const orphan = rows.find(r => r.id === 'orphan-template');
      expect(matched?.kb_entry).toBe('resources/email-templates/tpl-test-welcome.md');
      expect(orphan?.kb_entry).toBeNull();
    });
  });

  describe('canvas_list', () => {
    it('fetches /api/canvas and injects kb_entry on each item (both matched and orphan)', async () => {
      // Warning 5: use test-scoped mock. originalFetch saved in beforeEach,
      // restored in afterEach. No leakage to other test suites.
      const mockCanvases = [
        { id: CANVAS_DB_ID, name: 'Test' },
        { id: 'orphan-canvas', name: 'Orphan' },
      ];
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockCanvases,
      }) as unknown as typeof fetch;

      const res = await executeTool('canvas_list', {}, 'http://test');
      const rows = res.result as Array<{ id: string; kb_entry: string | null }>;
      expect(rows.find(r => r.id === CANVAS_DB_ID)?.kb_entry).toBe(
        'resources/canvases/ddd44444-test-canvas.md',
      );
      expect(rows.find(r => r.id === 'orphan-canvas')?.kb_entry).toBeNull();
      // NOTE: afterEach restores global.fetch = originalFetch — no cleanup needed here.
    });
  });

  describe('cache efficiency', () => {
    it('two list_cat_paws calls within 60s produce single _index.json read', async () => {
      dbModule
        .prepare("INSERT INTO cat_paws (id, name, mode, model, department, is_active, description, created_at, updated_at) VALUES (?, 'T', 'chat', 'gemini', 'other', 1, '', '2026-01-01', '2026-01-01')")
        .run(CATPAW_DB_ID);

      const readSpy = vi.spyOn(fs, 'readFileSync');
      await executeTool('list_cat_paws', {}, 'http://test');
      const callsFirst = readSpy.mock.calls.filter(c => String(c[0]).endsWith('_index.json')).length;
      await executeTool('list_cat_paws', {}, 'http://test');
      const callsSecond = readSpy.mock.calls.filter(c => String(c[0]).endsWith('_index.json')).length;
      expect(callsSecond).toBe(callsFirst); // no additional read within TTL
      readSpy.mockRestore();
    });
  });
});
