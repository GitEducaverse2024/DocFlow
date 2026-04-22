import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Phase 158 — Model Catalog Capabilities + Alias Schema
 *
 * Verifica que las ALTER + UPDATE inline del bootstrap de db.ts:
 *   1. Añaden 3 columnas a model_intelligence (is_local, supports_reasoning, max_tokens_cap).
 *   2. Añaden 3 columnas a model_aliases (reasoning_effort con CHECK, max_tokens, thinking_budget).
 *   3. Seed marca Claude Opus/Sonnet 4.6 y Gemini 2.5 Pro como reasoning-capable.
 *   4. Seed marca todos los provider='ollama' como is_local=1.
 *   5. Son idempotentes (2da ejecución no rompe ni muta).
 *   6. Preservan byte-identical las filas pre-existentes (back-compat).
 *
 * El test replica el bootstrap DDL/seed en una DB tmpfile porque importar
 * db.ts directamente ejecuta side-effects sobre data/docflow.db (producción).
 * Las sentencias ALTER/UPDATE bajo test se mantienen en sincronía con db.ts
 * manualmente — cuando cambies db.ts, actualiza el helper `applyV30Schema`.
 */

// Helpers (inline — replica el DDL crítico de db.ts relacionado con v30.0)

function makeTmpDb(): { db: Database.Database; file: string } {
  const file = path.join(
    os.tmpdir(),
    `docflow-v30-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  );
  const db = new Database(file);
  // Crear tablas v25.1 baseline (antes del ALTER v30.0)
  db.exec(`
    CREATE TABLE model_intelligence (
      id TEXT PRIMARY KEY,
      model_key TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      provider TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'Libre',
      best_use TEXT,
      capabilities TEXT,
      cost_tier TEXT DEFAULT 'free',
      cost_notes TEXT,
      scores TEXT,
      status TEXT DEFAULT 'active',
      auto_created INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE model_aliases (
      alias TEXT PRIMARY KEY,
      model_key TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  return { db, file };
}

/**
 * applyV30Schema — MUST remain byte-identical with the Phase 158 block in
 * app/src/lib/db.ts (Task 1 ALTERs). When you change db.ts, update this.
 */
function applyV30Schema(db: Database.Database): void {
  try { db.exec(`ALTER TABLE model_intelligence ADD COLUMN is_local INTEGER DEFAULT 0`); } catch { /* idempotent */ }
  try { db.exec(`ALTER TABLE model_intelligence ADD COLUMN supports_reasoning INTEGER DEFAULT 0`); } catch { /* idempotent */ }
  try { db.exec(`ALTER TABLE model_intelligence ADD COLUMN max_tokens_cap INTEGER`); } catch { /* idempotent */ }
  try {
    db.exec(`ALTER TABLE model_aliases ADD COLUMN reasoning_effort TEXT CHECK (reasoning_effort IN ('off','low','medium','high') OR reasoning_effort IS NULL)`);
  } catch { /* idempotent */ }
  try { db.exec(`ALTER TABLE model_aliases ADD COLUMN max_tokens INTEGER`); } catch { /* idempotent */ }
  try { db.exec(`ALTER TABLE model_aliases ADD COLUMN thinking_budget INTEGER`); } catch { /* idempotent */ }
}

/**
 * applyV30Seed — MUST remain byte-identical with the Phase 158 seed block in
 * app/src/lib/db.ts (Task 2 UPDATEs). When you change db.ts, update this.
 */
function applyV30Seed(db: Database.Database): void {
  db.exec(`UPDATE model_intelligence SET is_local = 1 WHERE provider = 'ollama'`);
  db.exec(`UPDATE model_intelligence SET is_local = 0 WHERE provider != 'ollama'`);
  db.exec(`UPDATE model_intelligence SET supports_reasoning = 1, max_tokens_cap = 32000 WHERE model_key = 'anthropic/claude-opus-4-6'`);
  db.exec(`UPDATE model_intelligence SET supports_reasoning = 1, max_tokens_cap = 64000 WHERE model_key = 'anthropic/claude-sonnet-4-6'`);
  db.exec(`UPDATE model_intelligence SET supports_reasoning = 1, max_tokens_cap = 65536 WHERE model_key = 'google/gemini-2.5-pro'`);
  db.exec(`UPDATE model_intelligence SET max_tokens_cap = 8192  WHERE model_key = 'anthropic/claude-haiku-3.5'`);
  db.exec(`UPDATE model_intelligence SET max_tokens_cap = 16384 WHERE model_key = 'openai/gpt-4o'`);
  db.exec(`UPDATE model_intelligence SET max_tokens_cap = 16384 WHERE model_key = 'openai/gpt-4o-mini'`);
  db.exec(`UPDATE model_intelligence SET max_tokens_cap = 65536 WHERE model_key = 'google/gemini-2.5-flash'`);
  db.exec(`UPDATE model_intelligence SET max_tokens_cap = 32768 WHERE model_key IN ('ollama/qwen3:32b','ollama/qwen3:8b','ollama/mistral:7b')`);
  db.exec(`UPDATE model_intelligence SET max_tokens_cap = 8192  WHERE model_key IN ('ollama/gemma3:4b','ollama/gemma3:12b','ollama/gemma3:27b','ollama/gemma4:27b','ollama/gemma4:2b','ollama/gemma4:e4b','ollama/gemma4:31b','ollama/llama3.3:70b')`);
}

/**
 * applyV30ShortcutSeed — Phase 161 (v30.0): LiteLLM shortcut alias rows.
 * MUST remain byte-identical with the Phase 161 block in app/src/lib/db.ts.
 * When you change db.ts, update this helper.
 *
 * Resolves namespace mismatch between LiteLLM gateway shortcuts and
 * model_intelligence.model_key FQNs (see STATE.md v30.0 blocker).
 * Tactical seed; resolver layer deferred to v30.1.
 *
 * INSERT OR IGNORE preserves pre-existing rows (e.g. manually edited by user).
 * UPDATE then forces canonical capabilities (same pattern as Phase 158 canonical UPDATE).
 */
function applyV30ShortcutSeed(db: Database.Database): void {
  db.exec(`INSERT OR IGNORE INTO model_intelligence (model_key, provider, tier, display_name, best_use, cost_notes, capabilities, status, is_local, supports_reasoning, max_tokens_cap)
           VALUES ('claude-opus', 'anthropic', 'Elite', 'Claude Opus (shortcut)', 'LiteLLM shortcut → anthropic/claude-opus-4-6', 'Paid — razonamiento', '["reasoning","tools","vision"]', 'active', 0, 1, 32000)`);
  db.exec(`INSERT OR IGNORE INTO model_intelligence (model_key, provider, tier, display_name, best_use, cost_notes, capabilities, status, is_local, supports_reasoning, max_tokens_cap)
           VALUES ('claude-sonnet', 'anthropic', 'Pro', 'Claude Sonnet (shortcut)', 'LiteLLM shortcut → anthropic/claude-sonnet-4-6', 'Paid — razonamiento', '["reasoning","tools","vision"]', 'active', 0, 1, 64000)`);
  db.exec(`INSERT OR IGNORE INTO model_intelligence (model_key, provider, tier, display_name, best_use, cost_notes, capabilities, status, is_local, supports_reasoning, max_tokens_cap)
           VALUES ('gemini-main', 'google', 'Elite', 'Gemini 2.5 Pro (shortcut)', 'LiteLLM shortcut → google/gemini-2.5-pro', 'Paid — razonamiento', '["reasoning","tools","vision"]', 'active', 0, 1, 65536)`);
  db.exec(`INSERT OR IGNORE INTO model_intelligence (model_key, provider, tier, display_name, best_use, cost_notes, capabilities, status, is_local, supports_reasoning, max_tokens_cap)
           VALUES ('gemma-local', 'ollama', 'Libre', 'Gemma 3 Local (shortcut)', 'LiteLLM shortcut → ollama/gemma3', 'Libre — local', '["local"]', 'active', 1, 0, 8192)`);
  // Canonical UPDATE — forces capabilities even if row pre-existed with stale values.
  db.exec(`UPDATE model_intelligence SET is_local = 0, supports_reasoning = 1, max_tokens_cap = 32000, provider = 'anthropic' WHERE model_key = 'claude-opus'`);
  db.exec(`UPDATE model_intelligence SET is_local = 0, supports_reasoning = 1, max_tokens_cap = 64000, provider = 'anthropic' WHERE model_key = 'claude-sonnet'`);
  db.exec(`UPDATE model_intelligence SET is_local = 0, supports_reasoning = 1, max_tokens_cap = 65536, provider = 'google' WHERE model_key = 'gemini-main'`);
  db.exec(`UPDATE model_intelligence SET is_local = 1, supports_reasoning = 0, max_tokens_cap = 8192,  provider = 'ollama'    WHERE model_key = 'gemma-local'`);
}

function seedBaselineMidRows(db: Database.Database): void {
  const rows: Array<[string, string, string, string, string, string]> = [
    ['mid-opus-46',    'anthropic/claude-opus-4-6',   'Claude Opus 4.6',   'anthropic', 'Elite', 'premium'],
    ['mid-sonnet-46',  'anthropic/claude-sonnet-4-6', 'Claude Sonnet 4.6', 'anthropic', 'Elite', 'high'],
    ['mid-gemini-pro', 'google/gemini-2.5-pro',       'Gemini 2.5 Pro',    'google',    'Elite', 'high'],
    ['mid-gpt4o',      'openai/gpt-4o',               'GPT-4o',            'openai',    'Pro',   'medium'],
    ['mid-gemma3-4b',  'ollama/gemma3:4b',            'Gemma 3 4B',        'ollama',    'Libre', 'free'],
    ['mid-qwen3-32b',  'ollama/qwen3:32b',            'Qwen 3 32B',        'ollama',    'Pro',   'free'],
  ];
  const stmt = db.prepare(
    `INSERT INTO model_intelligence (id, model_key, display_name, provider, tier, cost_tier) VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const r of rows) stmt.run(...r);
}

function seedBaselineAliases(db: Database.Database): void {
  const stmt = db.prepare(`INSERT INTO model_aliases (alias, model_key) VALUES (?, ?)`);
  for (const alias of [
    'catbot',
    'chat-rag',
    'agent-task',
    'canvas-agent',
    'canvas-writer',
    'canvas-classifier',
    'canvas-formatter',
    'embed',
  ]) {
    stmt.run(alias, 'gemini-main');
  }
}

describe('Phase 158 — Model Catalog Capabilities + Alias Schema', () => {
  let db: Database.Database;
  let file: string;

  beforeEach(() => {
    const tmp = makeTmpDb();
    db = tmp.db;
    file = tmp.file;
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });

  describe('schema migration', () => {
    it('Test 1 — model_intelligence gana 3 columnas nuevas', () => {
      applyV30Schema(db);
      const cols = db.prepare(`PRAGMA table_info(model_intelligence)`).all() as Array<{
        name: string;
        type: string;
        dflt_value: unknown;
        notnull: number;
      }>;
      const names = cols.map((c) => c.name);
      expect(names).toContain('is_local');
      expect(names).toContain('supports_reasoning');
      expect(names).toContain('max_tokens_cap');
      expect(cols.find((c) => c.name === 'is_local')?.type).toBe('INTEGER');
      expect(cols.find((c) => c.name === 'supports_reasoning')?.type).toBe('INTEGER');
      expect(cols.find((c) => c.name === 'max_tokens_cap')?.type).toBe('INTEGER');
    });

    it('Test 2 — model_aliases gana 3 columnas nuevas', () => {
      applyV30Schema(db);
      const cols = db.prepare(`PRAGMA table_info(model_aliases)`).all() as Array<{
        name: string;
        type: string;
      }>;
      const names = cols.map((c) => c.name);
      expect(names).toContain('reasoning_effort');
      expect(names).toContain('max_tokens');
      expect(names).toContain('thinking_budget');
    });

    it('Test 3 — ALTER es idempotente (2da ejecución no lanza)', () => {
      applyV30Schema(db);
      expect(() => applyV30Schema(db)).not.toThrow();
      const cols = db.prepare(`PRAGMA table_info(model_intelligence)`).all() as unknown[];
      const colsCount = cols.length;
      applyV30Schema(db);
      expect((db.prepare(`PRAGMA table_info(model_intelligence)`).all() as unknown[]).length).toBe(
        colsCount
      );
    });

    it('Test 4 — CHECK constraint de reasoning_effort rechaza invalid, acepta enumerados y NULL', () => {
      applyV30Schema(db);
      seedBaselineAliases(db);
      expect(() =>
        db.prepare(`UPDATE model_aliases SET reasoning_effort = NULL WHERE alias='catbot'`).run()
      ).not.toThrow();
      for (const v of ['off', 'low', 'medium', 'high']) {
        expect(() =>
          db.prepare(`UPDATE model_aliases SET reasoning_effort = ? WHERE alias='catbot'`).run(v)
        ).not.toThrow();
      }
      expect(() =>
        db
          .prepare(`UPDATE model_aliases SET reasoning_effort = 'extreme' WHERE alias='catbot'`)
          .run()
      ).toThrow();
    });

    it('Test 5 — filas pre-existentes NO mutan tras ALTER', () => {
      seedBaselineMidRows(db);
      const pre = db
        .prepare(
          `SELECT model_key, tier, cost_tier, capabilities FROM model_intelligence WHERE model_key='anthropic/claude-opus-4-6'`
        )
        .get() as Record<string, unknown>;
      applyV30Schema(db);
      const post = db
        .prepare(
          `SELECT model_key, tier, cost_tier, capabilities FROM model_intelligence WHERE model_key='anthropic/claude-opus-4-6'`
        )
        .get() as Record<string, unknown>;
      expect(post).toEqual(pre);
    });
  });

  describe('seed', () => {
    it('Test 6 — Claude Opus 4.6 marcado con supports_reasoning=1 y max_tokens_cap=32000', () => {
      applyV30Schema(db);
      seedBaselineMidRows(db);
      applyV30Seed(db);
      const row = db
        .prepare(
          `SELECT supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key='anthropic/claude-opus-4-6'`
        )
        .get() as { supports_reasoning: number; max_tokens_cap: number } | undefined;
      expect(row).toBeDefined();
      expect(row!.supports_reasoning).toBe(1);
      expect(row!.max_tokens_cap).toBe(32000);
    });

    it('Test 7 — Claude Sonnet 4.6 marcado supports_reasoning=1 max_tokens_cap=64000', () => {
      applyV30Schema(db);
      seedBaselineMidRows(db);
      applyV30Seed(db);
      const row = db
        .prepare(
          `SELECT supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key='anthropic/claude-sonnet-4-6'`
        )
        .get() as { supports_reasoning: number; max_tokens_cap: number };
      expect(row.supports_reasoning).toBe(1);
      expect(row.max_tokens_cap).toBe(64000);
    });

    it('Test 8 — Gemini 2.5 Pro marcado supports_reasoning=1 max_tokens_cap=65536', () => {
      applyV30Schema(db);
      seedBaselineMidRows(db);
      applyV30Seed(db);
      const row = db
        .prepare(
          `SELECT supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key='google/gemini-2.5-pro'`
        )
        .get() as { supports_reasoning: number; max_tokens_cap: number };
      expect(row.supports_reasoning).toBe(1);
      expect(row.max_tokens_cap).toBe(65536);
    });

    it('Test 9 — todos los provider=ollama marcados is_local=1', () => {
      applyV30Schema(db);
      seedBaselineMidRows(db);
      applyV30Seed(db);
      const totalOllama = (
        db
          .prepare(`SELECT COUNT(*) as c FROM model_intelligence WHERE provider='ollama'`)
          .get() as { c: number }
      ).c;
      const localOllama = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM model_intelligence WHERE provider='ollama' AND is_local=1`
          )
          .get() as { c: number }
      ).c;
      expect(totalOllama).toBeGreaterThan(0);
      expect(localOllama).toBe(totalOllama);
    });

    it('Test 10 — todos los provider!=ollama marcados is_local=0', () => {
      applyV30Schema(db);
      seedBaselineMidRows(db);
      applyV30Seed(db);
      const nonOllama = (
        db
          .prepare(`SELECT COUNT(*) as c FROM model_intelligence WHERE provider!='ollama'`)
          .get() as { c: number }
      ).c;
      const paidNonOllama = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM model_intelligence WHERE provider!='ollama' AND is_local=0`
          )
          .get() as { c: number }
      ).c;
      expect(paidNonOllama).toBe(nonOllama);
    });

    it('Test 11 — seed es idempotente (2da ejecución mismo resultado)', () => {
      applyV30Schema(db);
      seedBaselineMidRows(db);
      applyV30Seed(db);
      const snapshot = db
        .prepare(
          `SELECT model_key, supports_reasoning, max_tokens_cap, is_local FROM model_intelligence ORDER BY model_key`
        )
        .all();
      applyV30Seed(db);
      const snapshot2 = db
        .prepare(
          `SELECT model_key, supports_reasoning, max_tokens_cap, is_local FROM model_intelligence ORDER BY model_key`
        )
        .all();
      expect(snapshot2).toEqual(snapshot);
    });

    it('Test 11b — seed no aborta si model_key no existe en model_intelligence (no-op silencioso)', () => {
      applyV30Schema(db);
      // NO seedBaselineMidRows — tabla vacía
      expect(() => applyV30Seed(db)).not.toThrow();
      expect(
        (db.prepare(`SELECT COUNT(*) as c FROM model_intelligence`).get() as { c: number }).c
      ).toBe(0);
    });
  });

  describe('back-compat no-mutate', () => {
    it('Test 12 — capabilities TEXT (JSON) intacto tras ALTER+seed', () => {
      seedBaselineMidRows(db);
      db.prepare(
        `UPDATE model_intelligence SET capabilities = '["function_calling","thinking","200k_context"]' WHERE model_key='anthropic/claude-opus-4-6'`
      ).run();
      applyV30Schema(db);
      applyV30Seed(db);
      const cap = (
        db
          .prepare(
            `SELECT capabilities FROM model_intelligence WHERE model_key='anthropic/claude-opus-4-6'`
          )
          .get() as { capabilities: string }
      ).capabilities;
      expect(cap).toBe('["function_calling","thinking","200k_context"]');
    });

    it('Test 13 — tier y cost_tier originales preservados tras ALTER+seed', () => {
      seedBaselineMidRows(db);
      applyV30Schema(db);
      applyV30Seed(db);
      const row = db
        .prepare(
          `SELECT tier, cost_tier FROM model_intelligence WHERE model_key='anthropic/claude-opus-4-6'`
        )
        .get() as { tier: string; cost_tier: string };
      expect(row.tier).toBe('Elite');
      expect(row.cost_tier).toBe('premium');
    });
  });

  describe('alias defaults preserved', () => {
    it('Test 14 — 8 aliases existentes tienen reasoning_effort, max_tokens, thinking_budget como NULL tras ALTER', () => {
      seedBaselineAliases(db);
      applyV30Schema(db);
      const rows = db
        .prepare(
          `SELECT alias, reasoning_effort, max_tokens, thinking_budget FROM model_aliases ORDER BY alias`
        )
        .all() as Array<{
        alias: string;
        reasoning_effort: string | null;
        max_tokens: number | null;
        thinking_budget: number | null;
      }>;
      expect(rows.length).toBe(8);
      for (const r of rows) {
        expect(r.reasoning_effort).toBeNull();
        expect(r.max_tokens).toBeNull();
        expect(r.thinking_budget).toBeNull();
      }
    });

    it('Test 15 — model_key y is_active originales intactos tras ALTER', () => {
      seedBaselineAliases(db);
      applyV30Schema(db);
      const row = db
        .prepare(`SELECT alias, model_key, is_active FROM model_aliases WHERE alias='catbot'`)
        .get() as { alias: string; model_key: string; is_active: number };
      expect(row.model_key).toBe('gemini-main');
      expect(row.is_active).toBe(1);
    });
  });

  /**
   * Phase 161 (v30.0): LiteLLM shortcut seed.
   * Adds shortcut alias rows (`claude-opus`, `claude-sonnet`, `gemini-main`, `gemma-local`)
   * to model_intelligence so that /api/models + /api/aliases + CatBot list_llm_models
   * return non-null capabilities for the ids actually exposed by the LiteLLM gateway.
   * Resolves STATE.md-documented namespace mismatch tactically.
   */
  describe('Phase 161 — LiteLLM shortcut seed', () => {
    it('Test 16 — seeds claude-opus shortcut with reasoning capabilities', () => {
      applyV30Schema(db);
      applyV30Seed(db);
      applyV30ShortcutSeed(db);
      const row = db
        .prepare(
          `SELECT provider, is_local, supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key = 'claude-opus'`
        )
        .get() as
        | {
            provider: string;
            is_local: number;
            supports_reasoning: number;
            max_tokens_cap: number;
          }
        | undefined;
      expect(row).toBeDefined();
      expect(row!.provider).toBe('anthropic');
      expect(row!.is_local).toBe(0);
      expect(row!.supports_reasoning).toBe(1);
      expect(row!.max_tokens_cap).toBe(32000);
    });

    it('Test 17 — seeds claude-sonnet shortcut with reasoning capabilities', () => {
      applyV30Schema(db);
      applyV30Seed(db);
      applyV30ShortcutSeed(db);
      const row = db
        .prepare(
          `SELECT provider, is_local, supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key = 'claude-sonnet'`
        )
        .get() as {
        provider: string;
        is_local: number;
        supports_reasoning: number;
        max_tokens_cap: number;
      };
      expect(row.provider).toBe('anthropic');
      expect(row.is_local).toBe(0);
      expect(row.supports_reasoning).toBe(1);
      expect(row.max_tokens_cap).toBe(64000);
    });

    it('Test 18 — seeds gemini-main shortcut with reasoning capabilities', () => {
      applyV30Schema(db);
      applyV30Seed(db);
      applyV30ShortcutSeed(db);
      const row = db
        .prepare(
          `SELECT provider, is_local, supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key = 'gemini-main'`
        )
        .get() as {
        provider: string;
        is_local: number;
        supports_reasoning: number;
        max_tokens_cap: number;
      };
      expect(row.provider).toBe('google');
      expect(row.is_local).toBe(0);
      expect(row.supports_reasoning).toBe(1);
      expect(row.max_tokens_cap).toBe(65536);
    });

    it('Test 19 — seeds gemma-local shortcut as local non-reasoning', () => {
      applyV30Schema(db);
      applyV30Seed(db);
      applyV30ShortcutSeed(db);
      const row = db
        .prepare(
          `SELECT provider, is_local, supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key = 'gemma-local'`
        )
        .get() as {
        provider: string;
        is_local: number;
        supports_reasoning: number;
        max_tokens_cap: number;
      };
      expect(row.provider).toBe('ollama');
      expect(row.is_local).toBe(1);
      expect(row.supports_reasoning).toBe(0);
      expect(row.max_tokens_cap).toBe(8192);
    });

    it('Test 20 — shortcut seed is idempotent (2 consecutive runs produce identical state)', () => {
      applyV30Schema(db);
      applyV30Seed(db);
      applyV30ShortcutSeed(db);
      applyV30ShortcutSeed(db);
      const count = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM model_intelligence WHERE model_key = 'claude-opus'`
          )
          .get() as { c: number }
      ).c;
      expect(count).toBe(1);
      // Snapshot equality across all 4 shortcut rows after 2nd run
      const snapshot = db
        .prepare(
          `SELECT model_key, provider, is_local, supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key IN ('claude-opus','claude-sonnet','gemini-main','gemma-local') ORDER BY model_key`
        )
        .all();
      applyV30ShortcutSeed(db);
      const snapshot2 = db
        .prepare(
          `SELECT model_key, provider, is_local, supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key IN ('claude-opus','claude-sonnet','gemini-main','gemma-local') ORDER BY model_key`
        )
        .all();
      expect(snapshot2).toEqual(snapshot);
    });

    it('Test 21 — shortcut seed does not corrupt existing FQN rows', () => {
      applyV30Schema(db);
      // Pre-insert FQN row with a custom cost_notes to prove INSERT OR IGNORE does not
      // touch a different PK and UPDATE targets only the shortcut model_key.
      db.prepare(
        `INSERT INTO model_intelligence (id, model_key, display_name, provider, tier, cost_notes) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        'mid-opus-46',
        'anthropic/claude-opus-4-6',
        'Claude Opus 4.6',
        'anthropic',
        'Elite',
        'pre-existing'
      );
      applyV30Seed(db);
      applyV30ShortcutSeed(db);
      const fqnRow = db
        .prepare(
          `SELECT cost_notes FROM model_intelligence WHERE model_key = 'anthropic/claude-opus-4-6'`
        )
        .get() as { cost_notes: string };
      expect(fqnRow.cost_notes).toBe('pre-existing');
      // Shortcut row is independent with its own cost_notes
      const shortcutRow = db
        .prepare(
          `SELECT cost_notes FROM model_intelligence WHERE model_key = 'claude-opus'`
        )
        .get() as { cost_notes: string };
      expect(shortcutRow.cost_notes).toBe('Paid — razonamiento');
    });
  });
});
