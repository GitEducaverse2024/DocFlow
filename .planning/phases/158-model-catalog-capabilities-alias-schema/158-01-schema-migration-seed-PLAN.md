---
phase: 158-model-catalog-capabilities-alias-schema
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/src/lib/db.ts
  - app/src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts
autonomous: true
requirements:
  - CAT-01
  - CAT-02
  - CFG-01
must_haves:
  truths:
    - "model_intelligence has columns is_local INTEGER, supports_reasoning INTEGER, max_tokens_cap INTEGER"
    - "model_aliases has columns reasoning_effort TEXT (CHECK off/low/medium/high/null), max_tokens INTEGER, thinking_budget INTEGER"
    - "Seed marks claude-opus-4-6 / claude-sonnet-4-6 / gemini-2.5-pro with supports_reasoning=1 and the correct max_tokens_cap"
    - "Seed marks all provider='ollama' rows with is_local=1 and the rest with is_local=0"
    - "All six ALTERs are idempotent: re-executing db.ts bootstrap twice produces no schema changes on the second run"
    - "Existing rows in model_intelligence do NOT mutate outside of the new-column defaults (tier, cost_tier, capabilities TEXT intact byte-identical)"
    - "Existing callers of model_aliases that only read {alias, model_key, is_active} continue to work (NULL defaults preserve semantics)"
  artifacts:
    - path: "app/src/lib/db.ts"
      provides: "6 ALTER TABLE statements + UPDATE seed block for v30.0 capabilities"
      contains: "ALTER TABLE model_intelligence ADD COLUMN supports_reasoning"
    - path: "app/src/lib/db.ts"
      provides: "model_aliases capability columns"
      contains: "ALTER TABLE model_aliases ADD COLUMN reasoning_effort"
    - path: "app/src/lib/db.ts"
      provides: "Seed UPDATE block (reasoning + is_local)"
      contains: "UPDATE model_intelligence SET is_local=1 WHERE provider='ollama'"
    - path: "app/src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts"
      provides: "Vitest coverage for migration idempotency + seed correctness"
      min_lines: 80
  key_links:
    - from: "app/src/lib/db.ts (ALTER block)"
      to: "PRAGMA table_info(model_intelligence)"
      via: "SQLite ALTER TABLE ADD COLUMN executed at bootstrap"
      pattern: "ALTER TABLE model_intelligence ADD COLUMN (is_local|supports_reasoning|max_tokens_cap)"
    - from: "app/src/lib/db.ts (seed block)"
      to: "model_intelligence row for anthropic/claude-opus-4-6"
      via: "UPDATE WHERE model_key=? (no-op if row absent, set if present)"
      pattern: "UPDATE model_intelligence SET supports_reasoning=1, max_tokens_cap="
---

<objective>
Extender la capa schema del catálogo de modelos para soportar capabilities de reasoning y classification local-vs-paid. Añade 3 columnas a `model_intelligence` (`is_local`, `supports_reasoning`, `max_tokens_cap`) y 3 columnas a `model_aliases` (`reasoning_effort`, `max_tokens`, `thinking_budget`), todas inline en el bootstrap de `app/src/lib/db.ts`, idempotentes via try/catch patrón v8.0+. Aplica seed inline para marcar Opus/Sonnet/Gemini 2.5 Pro como reasoning-capable con sus max_tokens_cap respectivos, y todos los `provider='ollama'` como `is_local=1`.

Purpose: El schema es el fundamento inmutable para Phases 159 (passthrough), 160 (CatBot tools) y 161 (UI). Sin este schema las tools no pueden consultar `supports_reasoning`, el PATCH `/api/alias-routing` no puede persistir `reasoning_effort`, y la UI no puede renderizar el dropdown condicional. Pure data plumbing — sin cambios de runtime LLM aún.

Output: `db.ts` con 6 ALTER idempotentes + bloque UPDATE de seed; test Vitest con 4 describe blocks (migration idempotency, seed values, CHECK constraint, back-compat no-mutate).
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/158-model-catalog-capabilities-alias-schema/158-CONTEXT.md
@app/src/lib/db.ts
@app/src/lib/services/__tests__/alias-routing.test.ts
@app/src/lib/__tests__/kb-sync-db-source.test.ts

<interfaces>
<!-- Current model_intelligence schema (db.ts:4800-4816). DO NOT modify these columns — add new ones only. -->

```sql
CREATE TABLE IF NOT EXISTS model_intelligence (
  id TEXT PRIMARY KEY,
  model_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'Libre',   -- ORTHOGONAL to is_local. tier = Elite/Pro/Libre. DO NOT TOUCH.
  best_use TEXT,
  capabilities TEXT,                    -- JSON string. DO NOT EXTEND. Use new scalar columns instead.
  cost_tier TEXT DEFAULT 'free',        -- premium/high/medium/low/free. ORTHOGONAL. DO NOT TOUCH.
  cost_notes TEXT,
  scores TEXT,
  status TEXT DEFAULT 'active',
  auto_created INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

<!-- Current model_aliases schema (db.ts:4820-4828). DO NOT modify these columns. -->

```sql
CREATE TABLE IF NOT EXISTS model_aliases (
  alias TEXT PRIMARY KEY,
  model_key TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

<!-- Existing seed (app/src/lib/services/mid.ts:223-369) — `seedModels()` inserts 18 rows the first time the table is empty.
     Our UPDATE seed runs on every bootstrap AFTER the ALTERs and after mid.seedModels() has had a chance to populate rows. -->

<!-- Existing idempotent ALTER pattern in db.ts (repeated ~60 times). Example at line ~1900:
     try { db.exec('ALTER TABLE sources ADD COLUMN size_bytes INTEGER'); } catch {}
     On second run, catch swallows "duplicate column" error silently. -->

<!-- Vitest + better-sqlite3 + tmpfile pattern: see app/src/lib/__tests__/kb-sync-db-source.test.ts lines 30-45 (Database, fs, os). -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: ALTER TABLE migration inline en db.ts bootstrap</name>
  <files>app/src/lib/db.ts</files>
  <behavior>
    - Test 1: Tras ejecutar el bootstrap de db.ts sobre DB vacía, `PRAGMA table_info(model_intelligence)` devuelve las columnas `is_local` (INTEGER, default 0), `supports_reasoning` (INTEGER, default 0) y `max_tokens_cap` (INTEGER, nullable) además de las existentes.
    - Test 2: Tras ejecutar el bootstrap de db.ts sobre DB vacía, `PRAGMA table_info(model_aliases)` devuelve `reasoning_effort` (TEXT, nullable), `max_tokens` (INTEGER, nullable), `thinking_budget` (INTEGER, nullable).
    - Test 3: Re-ejecutar el bootstrap una segunda vez sobre la misma DB NO lanza excepción y NO cambia el schema (idempotencia).
    - Test 4: El CHECK constraint de `reasoning_effort` rechaza `'invalid'` con `SQLITE_CONSTRAINT_CHECK` y acepta `'off'`, `'low'`, `'medium'`, `'high'`, y `NULL`.
    - Test 5: Filas preexistentes en `model_intelligence` (insertadas ANTES del ALTER, simulando upgrade en producción) mantienen sus valores de `tier`, `cost_tier`, `capabilities` byte-identical tras correr el ALTER.
  </behavior>
  <action>
Añadir bloque de ALTER TABLE inline en `app/src/lib/db.ts` inmediatamente después de la sentencia `CREATE TABLE IF NOT EXISTS model_aliases` (actualmente línea 4828, antes del comentario `// System alerts table (Phase 128)`).

**Estructura exacta a insertar (seguir el patrón idempotente v8.0+ usado ~60 veces en db.ts):**

```typescript
// Phase 158 (v30.0): Model Catalog Capabilities + Alias Schema
// Additive, idempotent migration. Each ALTER wrapped in try/catch — catch swallows
// "duplicate column" error on re-run (standard pattern, see lines 1900, 2100, etc.).

// model_intelligence: capabilities (is_local, supports_reasoning, max_tokens_cap)
try { db.exec(`ALTER TABLE model_intelligence ADD COLUMN is_local INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE model_intelligence ADD COLUMN supports_reasoning INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE model_intelligence ADD COLUMN max_tokens_cap INTEGER`); } catch {}

// model_aliases: per-alias reasoning config (reasoning_effort, max_tokens, thinking_budget)
// reasoning_effort uses a CHECK constraint — must be added via ALTER with care.
try {
  db.exec(`ALTER TABLE model_aliases ADD COLUMN reasoning_effort TEXT CHECK (reasoning_effort IN ('off','low','medium','high') OR reasoning_effort IS NULL)`);
} catch {}
try { db.exec(`ALTER TABLE model_aliases ADD COLUMN max_tokens INTEGER`); } catch {}
try { db.exec(`ALTER TABLE model_aliases ADD COLUMN thinking_budget INTEGER`); } catch {}
```

**Reglas duras:**
1. NO tocar las columnas existentes `tier`, `cost_tier`, `capabilities` de `model_intelligence`. Son ortogonales a `is_local` — tier sigue siendo Elite/Pro/Libre (performance tier), cost_tier sigue siendo premium/high/medium/low/free, capabilities sigue siendo JSON TEXT arbitrario. `is_local` es booleano nuevo "corre en servidor del usuario".
2. NO crear directorio `app/src/lib/db-migrations/`. El schema vive inline en db.ts siguiendo el patrón v8.0+ establecido.
3. NO usar `IF NOT EXISTS` en ALTER TABLE — SQLite no lo soporta para ADD COLUMN. Usar try/catch (patrón ya usado ~60 veces en db.ts).
4. NO añadir una columna `tier` nueva con CHECK(tier IN ('paid','local')) al `model_intelligence` — la columna `tier` ya existe como Elite/Pro/Libre y el override del user (CONTEXT.md) explícitamente elige `is_local INTEGER DEFAULT 0` en vez de eso, para cero regresión.
5. `reasoning_effort` CHECK permite NULL explícitamente — `NULL` es el default que preserva comportamiento actual byte-identical para los 8 aliases existentes (catbot, chat-rag, agent-task, canvas-agent, canvas-writer, canvas-classifier, canvas-formatter, embed).

**Decisión locked por user (CONTEXT.md):**
- Usar `is_local INTEGER DEFAULT 0` (no columna `tier` adicional con CHECK paid/local — el ROADMAP sugería esa forma pero CONTEXT la override por cero regresión).
- ALTER inline en db.ts bootstrap (no subdirectorio db-migrations/ — el ROADMAP la sugería pero CONTEXT la override por consistencia).

**Ubicación exacta del insert:** después de línea 4828 del archivo actual (cierre del CREATE TABLE model_aliases), antes del comentario de línea 4830 `// System alerts table (Phase 128)`. Añade un comentario de bloque `// Phase 158 (v30.0): Model Catalog Capabilities + Alias Schema`.
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm run test:unit -- src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts -t "schema migration"</automated>
  </verify>
  <done>
    - 6 ALTER statements inline en db.ts entre líneas ~4828 y la siguiente tabla.
    - Todas envueltas en try/catch individual (patrón idempotente).
    - Tests del describe "schema migration" (Test 1, 2, 3, 4, 5) pasan en verde.
    - `cd app && npm run lint` exit 0 (ESLint no-unused-vars estricto — ver feedback_unused_imports_build.md).
    - No se ha tocado ninguna columna existente (tier, cost_tier, capabilities intactas).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Seed UPDATE inline (reasoning flags + is_local + max_tokens_cap)</name>
  <files>app/src/lib/db.ts</files>
  <behavior>
    - Test 6: Tras bootstrap completo (incluyendo `seedModels()` de mid.ts), `SELECT supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key='anthropic/claude-opus-4-6'` devuelve `(1, 32000)`. Nota: si la fila no existe (mid.ts seed actual usa `claude-opus-4` sin `-6`), el UPDATE es un no-op de 0 changes y el test tolera la ausencia con `row IS NULL`.
    - Test 7: `SELECT supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key='anthropic/claude-sonnet-4-6'` devuelve `(1, 64000)` si existe, tolera ausencia.
    - Test 8: `SELECT supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key='google/gemini-2.5-pro'` devuelve `(1, 65536)`.
    - Test 9: `SELECT COUNT(*) FROM model_intelligence WHERE provider='ollama' AND is_local=1` coincide con `SELECT COUNT(*) FROM model_intelligence WHERE provider='ollama'` (todos los Ollama marcados local).
    - Test 10: `SELECT COUNT(*) FROM model_intelligence WHERE provider!='ollama' AND is_local=0` coincide con `SELECT COUNT(*) FROM model_intelligence WHERE provider!='ollama'` (todos los non-Ollama marcados paid).
    - Test 11: Segunda ejecución del bootstrap no cambia resultados (seed idempotente — es el mismo UPDATE).
  </behavior>
  <action>
Añadir bloque de UPDATE inline en `app/src/lib/db.ts` INMEDIATAMENTE después del bloque de ALTERs de Task 1 (mismo comentario de sección "Phase 158"). El bloque UPDATE corre en CADA bootstrap, por diseño idempotente (mismo input → mismo output).

```typescript
// Phase 158 seed: mark reasoning-capable models and local vs paid.
// Runs on every bootstrap — idempotent by definition (same UPDATE, same result).
// If a model_key does not exist in model_intelligence (e.g. seed in mid.ts uses a
// different key variant), the UPDATE is a no-op of 0 changes — safe.
try {
  // is_local: flip every ollama row to local. All others default to 0 (set explicitly for clarity).
  db.exec(`UPDATE model_intelligence SET is_local = 1 WHERE provider = 'ollama'`);
  db.exec(`UPDATE model_intelligence SET is_local = 0 WHERE provider != 'ollama'`);

  // Reasoning-capable models (user-locked per CONTEXT.md § Seed values).
  // Claude Opus 4.6: max_tokens_cap=32000 per user decision.
  //   (Anthropic docs list 128000 for opus-4-6. User chose 32000; see CONTEXT.md Decisions
  //    "Seed values". Honored as locked. Downstream UI and tools MUST respect 32000.)
  db.exec(`UPDATE model_intelligence SET supports_reasoning = 1, max_tokens_cap = 32000 WHERE model_key = 'anthropic/claude-opus-4-6'`);
  // Claude Sonnet 4.6: max_tokens_cap=64000 per user decision (matches Anthropic docs).
  db.exec(`UPDATE model_intelligence SET supports_reasoning = 1, max_tokens_cap = 64000 WHERE model_key = 'anthropic/claude-sonnet-4-6'`);
  // Gemini 2.5 Pro: max_tokens_cap=65536 per user decision (matches ai.google.dev docs).
  db.exec(`UPDATE model_intelligence SET supports_reasoning = 1, max_tokens_cap = 65536 WHERE model_key = 'google/gemini-2.5-pro'`);

  // max_tokens_cap for non-reasoning models (Claude's Discretion per CONTEXT.md).
  // Values sourced from vendor docs 2026-04 or conservative-safe defaults.
  db.exec(`UPDATE model_intelligence SET max_tokens_cap = 8192  WHERE model_key = 'anthropic/claude-haiku-3.5'`);
  db.exec(`UPDATE model_intelligence SET max_tokens_cap = 16384 WHERE model_key = 'openai/gpt-4o'`);
  db.exec(`UPDATE model_intelligence SET max_tokens_cap = 16384 WHERE model_key = 'openai/gpt-4o-mini'`);
  db.exec(`UPDATE model_intelligence SET max_tokens_cap = 65536 WHERE model_key = 'google/gemini-2.5-flash'`);
  // Ollama local models — all default to 8192 unless a 32K-context entry exists.
  db.exec(`UPDATE model_intelligence SET max_tokens_cap = 32768 WHERE model_key IN ('ollama/qwen3:32b','ollama/qwen3:8b','ollama/mistral:7b')`);
  db.exec(`UPDATE model_intelligence SET max_tokens_cap = 8192  WHERE model_key IN ('ollama/gemma3:4b','ollama/gemma3:12b','ollama/gemma3:27b','ollama/gemma4:27b','ollama/gemma4:2b','ollama/gemma4:e4b','ollama/gemma4:31b','ollama/llama3.3:70b')`);
} catch (e) { logger.error('system', 'Phase 158 seed update error', { error: (e as Error).message }); }
```

**Reglas duras:**
1. NO usar cláusula `WHERE supports_reasoning IS NULL`. El seed es canónico — sobrescribir valores manuales es comportamiento aceptado por CONTEXT.md ("si el user editó manualmente, el seed lo sobreescribe").
2. UPDATE corre en CADA bootstrap (idempotente por diseño — mismo valor → misma fila).
3. UPDATE cuyo `model_key` no existe es un no-op silencioso de 0 changes. Esto es tolerancia deseada: si `mid.ts` seedea `claude-opus-4` (sin `-6`) y no `claude-opus-4-6`, el UPDATE no afecta nada y el sistema sigue funcional — Phase 160 detectará la ausencia vía `get_catbot_llm` y el user podrá corregirlo. NO abortar si una fila falta.
4. NO tocar `tier` ni `cost_tier` — ortogonales (locked por CONTEXT.md).
5. Envolver el bloque completo en try/catch con `logger.error` para no romper bootstrap ante un error DB raro (consistent con pattern `Maquetador skill seed error` en línea 4796 de db.ts).

**Valor 32000 para Opus 4.6 es locked por user** (investigación durante planning mostró 128000 en docs, pero CONTEXT.md lo fija en 32000 — esta es la canonical per project instructions).
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm run test:unit -- src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts -t "seed"</automated>
  </verify>
  <done>
    - Bloque UPDATE inline en db.ts inmediatamente tras el bloque ALTER de Task 1.
    - Tests del describe "seed" (Tests 6-11) pasan en verde.
    - El UPDATE sobre model_keys ausentes es no-op silencioso (0 changes aceptado).
    - `cd app && npm run lint` exit 0.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Test Vitest tmpfile DB — migration + seed + back-compat</name>
  <files>app/src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts</files>
  <behavior>
    - Vitest file con 4 describe blocks:
      1. "schema migration" (Tests 1-5 de Task 1): PRAGMA table_info coincide para ambas tablas, idempotencia, CHECK constraint, no-mutate de filas pre-existentes.
      2. "seed" (Tests 6-11 de Task 2): valores esperados en Opus/Sonnet/Gemini/Flash/GPT-4o/Ollama, UPDATE no-op en model_key ausente, idempotencia.
      3. "back-compat no-mutate": filas existentes en model_intelligence con valores manuales de `tier`='Elite'/'Pro'/'Libre' y `cost_tier`='premium'/'high'/'low'/'free' MANTIENEN sus valores post-ALTER (solo las 3 columnas nuevas se añaden con defaults).
      4. "alias defaults preserved": los 8 aliases existentes (catbot, chat-rag, agent-task, canvas-agent, canvas-writer, canvas-classifier, canvas-formatter, embed) — si se insertan ANTES del ALTER, post-ALTER sus columnas `reasoning_effort`, `max_tokens`, `thinking_budget` son todas NULL (defaults nullable preservan comportamiento byte-identical).
  </behavior>
  <action>
Crear `app/src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts` siguiendo el patrón de `app/src/lib/__tests__/kb-sync-db-source.test.ts` (usa `Database` de better-sqlite3 + tmpfile en os.tmpdir()).

**Estructura del archivo:**

```typescript
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
  const file = path.join(os.tmpdir(), `docflow-v30-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

function applyV30Schema(db: Database.Database): void {
  // Debe mantenerse byte-identical con el bloque Phase 158 de db.ts (Task 1 + 2).
  try { db.exec(`ALTER TABLE model_intelligence ADD COLUMN is_local INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE model_intelligence ADD COLUMN supports_reasoning INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE model_intelligence ADD COLUMN max_tokens_cap INTEGER`); } catch {}
  try { db.exec(`ALTER TABLE model_aliases ADD COLUMN reasoning_effort TEXT CHECK (reasoning_effort IN ('off','low','medium','high') OR reasoning_effort IS NULL)`); } catch {}
  try { db.exec(`ALTER TABLE model_aliases ADD COLUMN max_tokens INTEGER`); } catch {}
  try { db.exec(`ALTER TABLE model_aliases ADD COLUMN thinking_budget INTEGER`); } catch {}
}

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

function seedBaselineMidRows(db: Database.Database): void {
  const rows = [
    ['mid-opus-46',    'anthropic/claude-opus-4-6',   'Claude Opus 4.6',    'anthropic', 'Elite', 'premium'],
    ['mid-sonnet-46',  'anthropic/claude-sonnet-4-6', 'Claude Sonnet 4.6',  'anthropic', 'Elite', 'high'],
    ['mid-gemini-pro', 'google/gemini-2.5-pro',       'Gemini 2.5 Pro',     'google',    'Elite', 'high'],
    ['mid-gpt4o',      'openai/gpt-4o',               'GPT-4o',             'openai',    'Pro',   'medium'],
    ['mid-gemma3-4b',  'ollama/gemma3:4b',            'Gemma 3 4B',         'ollama',    'Libre', 'free'],
    ['mid-qwen3-32b',  'ollama/qwen3:32b',            'Qwen 3 32B',         'ollama',    'Pro',   'free'],
  ];
  const stmt = db.prepare(`INSERT INTO model_intelligence (id, model_key, display_name, provider, tier, cost_tier) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const r of rows) stmt.run(...r);
}

function seedBaselineAliases(db: Database.Database): void {
  const stmt = db.prepare(`INSERT INTO model_aliases (alias, model_key) VALUES (?, ?)`);
  for (const alias of ['catbot','chat-rag','agent-task','canvas-agent','canvas-writer','canvas-classifier','canvas-formatter','embed']) {
    stmt.run(alias, 'gemini-main');
  }
}

describe('Phase 158 — Model Catalog Capabilities + Alias Schema', () => {
  let db: Database.Database;
  let file: string;

  beforeEach(() => { ({ db, file } = makeTmpDb()); });
  afterEach(() => { db.close(); fs.existsSync(file) && fs.unlinkSync(file); });

  describe('schema migration', () => {
    it('Test 1 — model_intelligence gana 3 columnas nuevas', () => {
      applyV30Schema(db);
      const cols = db.prepare(`PRAGMA table_info(model_intelligence)`).all() as { name: string; type: string; dflt_value: unknown; notnull: number }[];
      const names = cols.map(c => c.name);
      expect(names).toContain('is_local');
      expect(names).toContain('supports_reasoning');
      expect(names).toContain('max_tokens_cap');
      expect(cols.find(c => c.name === 'is_local')?.type).toBe('INTEGER');
      expect(cols.find(c => c.name === 'supports_reasoning')?.type).toBe('INTEGER');
      expect(cols.find(c => c.name === 'max_tokens_cap')?.type).toBe('INTEGER');
    });

    it('Test 2 — model_aliases gana 3 columnas nuevas', () => {
      applyV30Schema(db);
      const cols = db.prepare(`PRAGMA table_info(model_aliases)`).all() as { name: string; type: string }[];
      const names = cols.map(c => c.name);
      expect(names).toContain('reasoning_effort');
      expect(names).toContain('max_tokens');
      expect(names).toContain('thinking_budget');
    });

    it('Test 3 — ALTER es idempotente (2da ejecución no lanza)', () => {
      applyV30Schema(db);
      expect(() => applyV30Schema(db)).not.toThrow();
      // Columna count sigue siendo 13+3=16 para model_intelligence (no duplica)
      const cols = db.prepare(`PRAGMA table_info(model_intelligence)`).all() as unknown[];
      const colsCount = cols.length;
      applyV30Schema(db);
      expect((db.prepare(`PRAGMA table_info(model_intelligence)`).all() as unknown[]).length).toBe(colsCount);
    });

    it('Test 4 — CHECK constraint de reasoning_effort rechaza invalid, acepta enumerados y NULL', () => {
      applyV30Schema(db);
      seedBaselineAliases(db);
      // NULL (default)
      expect(() => db.prepare(`UPDATE model_aliases SET reasoning_effort = NULL WHERE alias='catbot'`).run()).not.toThrow();
      // enumerados válidos
      for (const v of ['off','low','medium','high']) {
        expect(() => db.prepare(`UPDATE model_aliases SET reasoning_effort = ? WHERE alias='catbot'`).run(v)).not.toThrow();
      }
      // invalid rechazado
      expect(() => db.prepare(`UPDATE model_aliases SET reasoning_effort = 'extreme' WHERE alias='catbot'`).run()).toThrow();
    });

    it('Test 5 — filas pre-existentes NO mutan tras ALTER', () => {
      seedBaselineMidRows(db);
      const pre = db.prepare(`SELECT model_key, tier, cost_tier, capabilities FROM model_intelligence WHERE model_key='anthropic/claude-opus-4-6'`).get() as Record<string, unknown>;
      applyV30Schema(db);
      const post = db.prepare(`SELECT model_key, tier, cost_tier, capabilities FROM model_intelligence WHERE model_key='anthropic/claude-opus-4-6'`).get() as Record<string, unknown>;
      expect(post).toEqual(pre);
    });
  });

  describe('seed', () => {
    it('Test 6 — Claude Opus 4.6 marcado con supports_reasoning=1 y max_tokens_cap=32000', () => {
      applyV30Schema(db);
      seedBaselineMidRows(db);
      applyV30Seed(db);
      const row = db.prepare(`SELECT supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key='anthropic/claude-opus-4-6'`).get() as { supports_reasoning: number; max_tokens_cap: number } | undefined;
      expect(row).toBeDefined();
      expect(row!.supports_reasoning).toBe(1);
      expect(row!.max_tokens_cap).toBe(32000);
    });

    it('Test 7 — Claude Sonnet 4.6 marcado supports_reasoning=1 max_tokens_cap=64000', () => {
      applyV30Schema(db);
      seedBaselineMidRows(db);
      applyV30Seed(db);
      const row = db.prepare(`SELECT supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key='anthropic/claude-sonnet-4-6'`).get() as { supports_reasoning: number; max_tokens_cap: number };
      expect(row.supports_reasoning).toBe(1);
      expect(row.max_tokens_cap).toBe(64000);
    });

    it('Test 8 — Gemini 2.5 Pro marcado supports_reasoning=1 max_tokens_cap=65536', () => {
      applyV30Schema(db);
      seedBaselineMidRows(db);
      applyV30Seed(db);
      const row = db.prepare(`SELECT supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key='google/gemini-2.5-pro'`).get() as { supports_reasoning: number; max_tokens_cap: number };
      expect(row.supports_reasoning).toBe(1);
      expect(row.max_tokens_cap).toBe(65536);
    });

    it('Test 9 — todos los provider=ollama marcados is_local=1', () => {
      applyV30Schema(db);
      seedBaselineMidRows(db);
      applyV30Seed(db);
      const totalOllama = (db.prepare(`SELECT COUNT(*) as c FROM model_intelligence WHERE provider='ollama'`).get() as { c: number }).c;
      const localOllama = (db.prepare(`SELECT COUNT(*) as c FROM model_intelligence WHERE provider='ollama' AND is_local=1`).get() as { c: number }).c;
      expect(totalOllama).toBeGreaterThan(0);
      expect(localOllama).toBe(totalOllama);
    });

    it('Test 10 — todos los provider!=ollama marcados is_local=0', () => {
      applyV30Schema(db);
      seedBaselineMidRows(db);
      applyV30Seed(db);
      const nonOllama = (db.prepare(`SELECT COUNT(*) as c FROM model_intelligence WHERE provider!='ollama'`).get() as { c: number }).c;
      const paidNonOllama = (db.prepare(`SELECT COUNT(*) as c FROM model_intelligence WHERE provider!='ollama' AND is_local=0`).get() as { c: number }).c;
      expect(paidNonOllama).toBe(nonOllama);
    });

    it('Test 11 — seed es idempotente (2da ejecución mismo resultado)', () => {
      applyV30Schema(db);
      seedBaselineMidRows(db);
      applyV30Seed(db);
      const snapshot = db.prepare(`SELECT model_key, supports_reasoning, max_tokens_cap, is_local FROM model_intelligence ORDER BY model_key`).all();
      applyV30Seed(db);
      const snapshot2 = db.prepare(`SELECT model_key, supports_reasoning, max_tokens_cap, is_local FROM model_intelligence ORDER BY model_key`).all();
      expect(snapshot2).toEqual(snapshot);
    });

    it('Test 11b — seed no aborta si model_key no existe en model_intelligence (no-op silencioso)', () => {
      applyV30Schema(db);
      // NO seedBaselineMidRows — tabla vacía
      expect(() => applyV30Seed(db)).not.toThrow();
      expect((db.prepare(`SELECT COUNT(*) as c FROM model_intelligence`).get() as { c: number }).c).toBe(0);
    });
  });

  describe('back-compat no-mutate', () => {
    it('Test 12 — capabilities TEXT (JSON) intacto tras ALTER+seed', () => {
      seedBaselineMidRows(db);
      db.prepare(`UPDATE model_intelligence SET capabilities = '["function_calling","thinking","200k_context"]' WHERE model_key='anthropic/claude-opus-4-6'`).run();
      applyV30Schema(db);
      applyV30Seed(db);
      const cap = (db.prepare(`SELECT capabilities FROM model_intelligence WHERE model_key='anthropic/claude-opus-4-6'`).get() as { capabilities: string }).capabilities;
      expect(cap).toBe('["function_calling","thinking","200k_context"]');
    });

    it('Test 13 — tier y cost_tier originales preservados tras ALTER+seed', () => {
      seedBaselineMidRows(db);
      applyV30Schema(db);
      applyV30Seed(db);
      const row = db.prepare(`SELECT tier, cost_tier FROM model_intelligence WHERE model_key='anthropic/claude-opus-4-6'`).get() as { tier: string; cost_tier: string };
      expect(row.tier).toBe('Elite');
      expect(row.cost_tier).toBe('premium');
    });
  });

  describe('alias defaults preserved', () => {
    it('Test 14 — 8 aliases existentes tienen reasoning_effort, max_tokens, thinking_budget como NULL tras ALTER', () => {
      seedBaselineAliases(db);
      applyV30Schema(db);
      const rows = db.prepare(`SELECT alias, reasoning_effort, max_tokens, thinking_budget FROM model_aliases ORDER BY alias`).all() as { alias: string; reasoning_effort: string | null; max_tokens: number | null; thinking_budget: number | null }[];
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
      const row = db.prepare(`SELECT alias, model_key, is_active FROM model_aliases WHERE alias='catbot'`).get() as { alias: string; model_key: string; is_active: number };
      expect(row.model_key).toBe('gemini-main');
      expect(row.is_active).toBe(1);
    });
  });
});
```

**Reglas duras:**
1. Helper `applyV30Schema` y `applyV30Seed` deben ser **byte-identical** con el código en db.ts (copiar exacto). Si cambias uno, actualiza el otro. Documentar esta duplicación en el JSDoc del archivo de test.
2. No importar db.ts directamente — side effects (crea/abre `data/docflow.db` producción, corre TODO el bootstrap que toca ~100 tablas, inserta skills, etc.) rompen el test.
3. Usar `os.tmpdir()` + cleanup en `afterEach` (patrón visto en `kb-sync-db-source.test.ts`).
4. NO mockear db.ts (patrón de `alias-routing.test.ts`) — aquí queremos un SQLite **real** para validar el CHECK constraint real y el comportamiento real de ALTER.
5. Los tests cubren exactamente los 4 test scenarios listados en CONTEXT.md (migration, seed, shape + back-compat), más idempotencia explícita.
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm run test:unit -- src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts</automated>
  </verify>
  <done>
    - Archivo creado con 4 describe blocks y ~15 tests.
    - Todos pasan con `npm run test:unit -- src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts`.
    - Test file es self-contained (no importa db.ts directamente).
    - `cd app && npm run lint` exit 0.
  </done>
</task>

</tasks>

<verification>
## Phase-level verification (ejecutar en orden)

1. **Vitest — unit tests:**
   ```bash
   cd app && npm run test:unit -- src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts
   ```
   Esperado: ~15 tests green, 0 skipped relevantes, 0 failing.

2. **Lint + build local (regresión):**
   ```bash
   cd app && npm run lint && npm run build
   ```
   Esperado: exit 0 ambos. Si build falla con error de unused import o tipo, arreglar antes de marcar done (patrón feedback_unused_imports_build.md).

3. **Inspección manual del schema contra DB real (verificación en container):**
   ```bash
   docker compose build --no-cache && docker compose up -d
   docker exec docflow-app sqlite3 /app/data/docflow.db "PRAGMA table_info(model_intelligence);" | grep -E "is_local|supports_reasoning|max_tokens_cap"
   docker exec docflow-app sqlite3 /app/data/docflow.db "PRAGMA table_info(model_aliases);" | grep -E "reasoning_effort|max_tokens|thinking_budget"
   ```
   Esperado: 3 columnas listadas para cada PRAGMA.

4. **Seed real en container:**
   ```bash
   docker exec docflow-app sqlite3 /app/data/docflow.db "SELECT model_key, supports_reasoning, max_tokens_cap, is_local FROM model_intelligence WHERE provider='ollama' LIMIT 3;"
   docker exec docflow-app sqlite3 /app/data/docflow.db "SELECT model_key, supports_reasoning, max_tokens_cap FROM model_intelligence WHERE supports_reasoning=1;"
   ```
   Esperado: todos los Ollama con `is_local=1`; el SELECT de reasoning devuelve 0 o más filas según si mid.ts tiene las model_keys `claude-opus-4-6`/`sonnet-4-6`/`gemini-2.5-pro` seedeadas (aceptado si no las tiene — Phase 158 es schema-only, Phase 160 podrá corregir via `set_model_capability` si se añade).

5. **Regresión — consumers existentes del alias_routing:**
   ```bash
   cd app && npm run test:unit -- src/lib/services/__tests__/alias-routing.test.ts
   ```
   Esperado: todos verdes (las columnas nuevas son NULL por default, el código existente que solo lee `.model_key`/`.is_active` no rompe).
</verification>

<success_criteria>
Medibles:
- [ ] `PRAGMA table_info(model_intelligence)` en DB de prod contiene 3 columnas nuevas (is_local, supports_reasoning, max_tokens_cap) — CAT-01
- [ ] `PRAGMA table_info(model_aliases)` en DB de prod contiene 3 columnas nuevas (reasoning_effort, max_tokens, thinking_budget) — CFG-01
- [ ] `SELECT COUNT(*) WHERE provider='ollama' AND is_local=1` = `SELECT COUNT(*) WHERE provider='ollama'` — CAT-02 Ollama branch
- [ ] `SELECT * WHERE model_key='anthropic/claude-opus-4-6' AND supports_reasoning=1 AND max_tokens_cap=32000` devuelve 1 fila SI mid.ts tiene esa key seedeada; no-op aceptado en caso contrario — CAT-02 reasoning branch
- [ ] Vitest file `model-catalog-capabilities-v30.test.ts` con ~15 tests verdes
- [ ] `npm run build` exit 0 (regresión build)
- [ ] `npm run test:unit -- alias-routing` exit 0 (regresión alias-routing)
- [ ] Bootstrap idempotente: 2º arranque del container sin cambios de schema (verified via `PRAGMA table_info` pre/post)
</success_criteria>

<output>
After completion, create `.planning/phases/158-model-catalog-capabilities-alias-schema/158-01-SUMMARY.md`
</output>
