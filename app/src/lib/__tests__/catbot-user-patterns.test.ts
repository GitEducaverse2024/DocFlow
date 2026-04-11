import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ---------------------------------------------------------------------------
// LEARN-01 + LEARN-03: schema migrations
//
// Tests the low-level DB artifacts:
//   - user_interaction_patterns table in catbot.db (LEARN-03)
//   - "Protocolo de creacion de CatPaw" seed in skills table of docflow.db (LEARN-01)
//
// Cross-db sanity: imports of catbot-db and db MUST coexist without breaking
// each other.
// ---------------------------------------------------------------------------

// Use a temp catbot.db so tests never touch production data. vi.hoisted runs
// BEFORE any module imports so the env var is set before catbot-db.ts
// initializes.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catbot-user-patterns-test-'));
process['env']['CATBOT_DB_PATH'] = path.join(tmpDir, 'catbot-test.db');

// Import both DBs AFTER the env var is set
import catbotDbDefault, { catbotDb } from '@/lib/catbot-db';
import db from '@/lib/db';

describe('LEARN-03: user_interaction_patterns schema (catbot.db)', () => {
  it('creates the user_interaction_patterns table with the expected columns', () => {
    // Module init should have created the table on import.
    const cols = catbotDb
      .prepare("PRAGMA table_info(user_interaction_patterns)")
      .all() as Array<{ name: string; type: string; dflt_value: unknown }>;

    expect(cols.length).toBeGreaterThan(0);

    const colNames = cols.map((c) => c.name);
    expect(colNames).toEqual(
      expect.arrayContaining([
        'id',
        'user_id',
        'pattern_type',
        'pattern_key',
        'pattern_value',
        'confidence',
        'last_seen',
        'created_at',
      ]),
    );
  });

  it('has indexes for user_id and (user_id, pattern_type)', () => {
    const indexes = catbotDb
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='user_interaction_patterns'")
      .all() as Array<{ name: string }>;
    const names = indexes.map((i) => i.name);
    expect(names).toEqual(
      expect.arrayContaining(['idx_user_patterns_user', 'idx_user_patterns_type']),
    );
  });

  it('supports insert and read of a simple pattern row', () => {
    const now = new Date().toISOString();
    catbotDb
      .prepare(
        `INSERT INTO user_interaction_patterns
           (id, user_id, pattern_type, pattern_key, pattern_value, confidence, last_seen, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('pat1', 'u1', 'delivery_preference', 'recipients', 'antonio+fen', 3, now, now);

    const row = catbotDb
      .prepare('SELECT * FROM user_interaction_patterns WHERE id = ?')
      .get('pat1') as {
        id: string;
        user_id: string;
        pattern_type: string;
        pattern_key: string;
        pattern_value: string;
        confidence: number;
      } | undefined;

    expect(row).toBeDefined();
    expect(row?.user_id).toBe('u1');
    expect(row?.pattern_type).toBe('delivery_preference');
    expect(row?.pattern_key).toBe('recipients');
    expect(row?.pattern_value).toBe('antonio+fen');
    expect(row?.confidence).toBe(3);
  });

  it('default export of catbot-db is the same catbotDb instance', () => {
    expect(catbotDbDefault).toBe(catbotDb);
  });
});

describe("LEARN-01: 'Protocolo de creacion de CatPaw' skill seed (docflow.db)", () => {
  it('seeds a single row with category=system and canonical id', () => {
    const rows = db
      .prepare(
        "SELECT id, name, category, instructions FROM skills WHERE id = 'skill-system-catpaw-protocol-v1'",
      )
      .all() as Array<{ id: string; name: string; category: string; instructions: string }>;

    // Idempotent seed: import db.ts twice (which has already happened by now)
    // and still expect exactly one row.
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Protocolo de creacion de CatPaw');
    expect(rows[0].category).toBe('system');
  });

  it('instructions contain the 5 PASO sections and ROL/MISION/PROCESO/CASOS/OUTPUT marker', () => {
    const row = db
      .prepare(
        "SELECT instructions FROM skills WHERE id = 'skill-system-catpaw-protocol-v1'",
      )
      .get() as { instructions: string } | undefined;

    expect(row).toBeDefined();
    const instructions = row!.instructions;
    expect(instructions).toContain('PASO 1');
    expect(instructions).toContain('PASO 2');
    expect(instructions).toContain('PASO 3');
    expect(instructions).toContain('PASO 4');
    expect(instructions).toContain('PASO 5');
    expect(instructions).toContain('ROL');
    expect(instructions).toContain('MISION');
    expect(instructions).toContain('PROCESO');
    expect(instructions).toContain('CASOS');
    expect(instructions).toContain('OUTPUT');
    expect(instructions).toContain('create_cat_paw');
  });

  it('seed is idempotent — re-running the INSERT OR IGNORE does not duplicate', () => {
    // Re-run the same seed shape to confirm idempotence at runtime level.
    // The canonical id MUST stay the same so INSERT OR IGNORE catches it.
    const before = (db
      .prepare("SELECT COUNT(*) AS c FROM skills WHERE id = 'skill-system-catpaw-protocol-v1'")
      .get() as { c: number }).c;

    db.prepare(
      `INSERT OR IGNORE INTO skills
         (id, name, description, category, tags, instructions, output_template,
          example_input, example_output, constraints, source, version, author,
          is_featured, times_used, created_at, updated_at)
         VALUES (?, ?, ?, 'system', ?, ?, '', '', '', '', 'built-in', '1.0', 'DoCatFlow',
                 1, 0, ?, ?)`,
    ).run(
      'skill-system-catpaw-protocol-v1',
      'Duplicate attempt',
      'should be ignored',
      JSON.stringify([]),
      'dupe',
      new Date().toISOString(),
      new Date().toISOString(),
    );

    const after = (db
      .prepare("SELECT COUNT(*) AS c FROM skills WHERE id = 'skill-system-catpaw-protocol-v1'")
      .get() as { c: number }).c;

    expect(before).toBe(1);
    expect(after).toBe(1);
  });
});

describe('Cross-db sanity', () => {
  it('catbot-db schema changes do not break docflow.db skill seed (and viceversa)', () => {
    // We have both imports live (@/lib/catbot-db AND @/lib/db) without either
    // module crashing. Assert both handles answer a trivial PRAGMA.
    expect(() => catbotDb.prepare('SELECT 1 AS one').get()).not.toThrow();
    expect(() => db.prepare('SELECT 1 AS one').get()).not.toThrow();
  });
});
