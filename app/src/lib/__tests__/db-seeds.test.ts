import { describe, it, expect, beforeAll, vi } from 'vitest';
import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Phase 160 Wave 0 — TOOL-04 seed assertion
//
// Tests that the "Operador de Modelos" system skill (id
// `skill-system-modelos-operador-v1`) is present in the `skills` table
// after `@/lib/db` boot — i.e. Plan 160-04 has seeded it idempotently like
// the `skill-system-catpaw-protocol-v1` row.
//
// db.ts reads `DATABASE_PATH` (not CATBOT_DB_PATH) for the main docflow DB
// — hoist it to a tmp file so this test never touches production data.
// ---------------------------------------------------------------------------

vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  const tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'docflow-seeds-test-'));
  process['env']['DATABASE_PATH'] = nodePath.join(tmpDir, 'docflow-test.db');
  process['env']['CATBOT_DB_PATH'] = nodePath.join(tmpDir, 'catbot-test.db');
});

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let db: Database.Database;

beforeAll(async () => {
  // Import after env vars set so db.ts bootstraps against the tmp file.
  const mod = await import('@/lib/db');
  db = mod.default as unknown as Database.Database;
});

describe('db seeds — Phase 160 (Operador de Modelos skill)', () => {
  it('Operador de Modelos skill: row exists with category=system', () => {
    const row = db
      .prepare('SELECT id, name, category, instructions FROM skills WHERE id = ?')
      .get('skill-system-modelos-operador-v1') as
      | { id: string; name: string; category: string; instructions: string }
      | undefined;

    expect(row).toBeDefined();
    expect(row?.id).toBe('skill-system-modelos-operador-v1');
    expect(row?.name).toBe('Operador de Modelos');
    expect(row?.category).toBe('system');
  });

  it('Operador de Modelos skill: instructions contain protocol markers', () => {
    const row = db
      .prepare('SELECT instructions FROM skills WHERE id = ?')
      .get('skill-system-modelos-operador-v1') as { instructions: string } | undefined;

    expect(row?.instructions).toBeTruthy();
    const instr = row!.instructions;
    // 4 required substrings per VALIDATION.md Per-Task Verification Map.
    expect(instr).toMatch(/tarea ligera/i);
    expect(instr).toMatch(/Opus/);
    expect(instr).toMatch(/Gemini 2\.5 Pro/);
    expect(instr).toMatch(/reasoning_effort/);
  });
});

// Sanity: unrelated assertion to verify the test module actually initialises
// the DB tables (seed presence is gated on that).
describe('db seeds — infrastructure sanity', () => {
  it('skills table exists in bootstrapped docflow.db', () => {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='skills'",
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe('skills');
  });
});
