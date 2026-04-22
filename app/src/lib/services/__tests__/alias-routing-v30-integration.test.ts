import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * Phase 161-04 — VER-04 integration test
 *
 * Proves the end-to-end config roundtrip contract of v30.0:
 *   updateAlias(alias, key, {reasoning_effort, max_tokens, thinking_budget})
 *     -> row persists in model_aliases
 *     -> resolveAliasConfig(alias) returns {model, reasoning_effort, max_tokens, thinking_budget}
 *
 * Covers 3 scenarios:
 *   1. Direct service call (updateAlias + resolveAliasConfig)
 *   2. HTTP path (PATCH /api/alias-routing handler + resolveAliasConfig)
 *   3. Null reset semantics (PATCH with explicit nulls clears the 3 reasoning fields)
 *
 * Isolation strategy:
 *   - In-memory better-sqlite3 per-test (beforeEach: new DB, apply schema, reseed).
 *   - vi.mock('@/lib/db') returns the shared in-memory instance.
 *   - vi.mock('@/lib/services/discovery') stubs getInventory to return target model available.
 *   - vi.mock('@/lib/services/mid') stubs getAll (empty; happy path skips MID fallback).
 *   - vi.mock('@/lib/logger') silences output.
 *   - vi.resetModules() + dynamic import inside each it() so the @/lib/db mock is applied
 *     before alias-routing.ts + route.ts are evaluated.
 *
 * Fixture: catbot alias -> anthropic/claude-opus-4-6 with reasoning config
 *          {reasoning_effort: 'high', max_tokens: 32000, thinking_budget: 16000}
 *          per CONTEXT.md § VER-04.
 */

// ---- In-memory DB holder (populated in beforeEach, consumed by vi.mock below) ----

let testDb: Database.Database;

// ---- Mocks ----

vi.mock('@/lib/db', () => ({
  // Return a proxy that delegates to whatever testDb is at the time prepare/exec is called.
  // This lets beforeEach swap the DB per-test without re-mocking.
  default: new Proxy({}, {
    get(_target, prop) {
      if (!testDb) throw new Error('testDb not initialized — beforeEach did not run');
      const value = (testDb as unknown as Record<string, unknown>)[prop as string];
      if (typeof value === 'function') {
        return value.bind(testDb);
      }
      return value;
    },
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockGetInventory = vi.fn();
vi.mock('@/lib/services/discovery', () => ({
  getInventory: (...args: unknown[]) => mockGetInventory(...args),
}));

const mockGetMidAll = vi.fn();
vi.mock('@/lib/services/mid', () => ({
  getAll: (...args: unknown[]) => mockGetMidAll(...args),
}));

vi.mock('@/lib/cache', () => ({
  cacheGet: vi.fn().mockReturnValue(null),
  cacheSet: vi.fn(),
}));

// ---- Schema helpers (byte-identical to db.ts bootstrap, mirrors model-catalog-capabilities-v30.test.ts) ----

function applyBaselineSchema(db: Database.Database): void {
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
}

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

function seedFixture(db: Database.Database): void {
  // catbot alias starts pointing at gemini-main with NULL reasoning config
  db.prepare(
    `INSERT INTO model_aliases (alias, model_key, description, is_active, reasoning_effort, max_tokens, thinking_budget)
     VALUES (?, ?, ?, 1, NULL, NULL, NULL)`
  ).run('catbot', 'gemini-main', 'CatBot assistant');

  // target model: anthropic/claude-opus-4-6 (Elite tier, reasoning, 32k cap)
  db.prepare(
    `INSERT INTO model_intelligence
       (id, model_key, display_name, provider, tier, status, is_local, supports_reasoning, max_tokens_cap)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'mid-opus-4-6',
    'anthropic/claude-opus-4-6',
    'Claude Opus 4.6',
    'anthropic',
    'Elite',
    'active',
    0,
    1,
    32000,
  );
}

function stubInventoryWithOpus(): void {
  mockGetInventory.mockResolvedValue({
    models: [
      { id: 'anthropic/claude-opus-4-6', model_id: 'claude-opus-4-6', provider: 'anthropic' },
      { id: 'gemini-main', model_id: 'gemini-main', provider: 'google' },
    ],
    providers: [],
    timestamp: new Date().toISOString(),
    cached: false,
  });
}

// ---- Tests ----

describe('VER-04 — alias-routing v30 config roundtrip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Fresh in-memory DB per test — zero shared state
    testDb = new Database(':memory:');
    applyBaselineSchema(testDb);
    applyV30Schema(testDb);
    seedFixture(testDb);

    stubInventoryWithOpus();
    mockGetMidAll.mockReturnValue([]);

    // Clean env for deterministic resolveAliasConfig fallback chain
    delete process['env']['CHAT_MODEL'];
    delete process['env']['EMBEDDING_MODEL'];
  });

  afterEach(() => {
    if (testDb) testDb.close();
  });

  it('direct service: updateAlias then resolveAliasConfig returns all 4 fields', async () => {
    const { updateAlias, resolveAliasConfig } = await import('@/lib/services/alias-routing');

    updateAlias('catbot', 'anthropic/claude-opus-4-6', {
      reasoning_effort: 'high',
      max_tokens: 32000,
      thinking_budget: 16000,
    });

    const cfg = await resolveAliasConfig('catbot');

    expect(cfg).toEqual({
      model: 'anthropic/claude-opus-4-6',
      reasoning_effort: 'high',
      max_tokens: 32000,
      thinking_budget: 16000,
    });

    // Sanity: the row on disk matches what resolveAliasConfig observed.
    const row = testDb.prepare(
      'SELECT model_key, reasoning_effort, max_tokens, thinking_budget FROM model_aliases WHERE alias = ?'
    ).get('catbot') as {
      model_key: string;
      reasoning_effort: string | null;
      max_tokens: number | null;
      thinking_budget: number | null;
    };
    expect(row.model_key).toBe('anthropic/claude-opus-4-6');
    expect(row.reasoning_effort).toBe('high');
    expect(row.max_tokens).toBe(32000);
    expect(row.thinking_budget).toBe(16000);
  });

  it('HTTP PATCH roundtrip: PATCH /api/alias-routing persists, then resolveAliasConfig returns all 4', async () => {
    const { PATCH } = await import('@/app/api/alias-routing/route');
    const { resolveAliasConfig } = await import('@/lib/services/alias-routing');

    const req = new Request('http://x/api/alias-routing', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        alias: 'catbot',
        model_key: 'anthropic/claude-opus-4-6',
        reasoning_effort: 'high',
        max_tokens: 32000,
        thinking_budget: 16000,
      }),
    });

    // Next.js route handlers accept NextRequest; a plain Request satisfies the runtime shape
    // used by route.ts (only body.json() is consumed).
    const res = await PATCH(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);

    const payload = await res.json();
    expect(payload).toMatchObject({
      updated: expect.objectContaining({
        alias: 'catbot',
        model_key: 'anthropic/claude-opus-4-6',
      }),
    });

    const cfg = await resolveAliasConfig('catbot');
    expect(cfg).toEqual({
      model: 'anthropic/claude-opus-4-6',
      reasoning_effort: 'high',
      max_tokens: 32000,
      thinking_budget: 16000,
    });
  });

  it('null reset semantics: PATCH with explicit nulls clears the 3 reasoning fields', async () => {
    const { PATCH } = await import('@/app/api/alias-routing/route');
    const { updateAlias, resolveAliasConfig } = await import('@/lib/services/alias-routing');

    // First, set full config.
    updateAlias('catbot', 'anthropic/claude-opus-4-6', {
      reasoning_effort: 'high',
      max_tokens: 32000,
      thinking_budget: 16000,
    });

    // Confirm seed state before the reset.
    const before = await resolveAliasConfig('catbot');
    expect(before.reasoning_effort).toBe('high');
    expect(before.max_tokens).toBe(32000);
    expect(before.thinking_budget).toBe(16000);

    // Now PATCH with explicit nulls — should take the extended path (hasOwnProperty gate)
    // and clear the 3 reasoning columns while preserving model_key.
    const req = new Request('http://x/api/alias-routing', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        alias: 'catbot',
        model_key: 'anthropic/claude-opus-4-6',
        reasoning_effort: null,
        max_tokens: null,
        thinking_budget: null,
      }),
    });
    const res = await PATCH(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);

    const after = await resolveAliasConfig('catbot');
    expect(after).toEqual({
      model: 'anthropic/claude-opus-4-6',
      reasoning_effort: null,
      max_tokens: null,
      thinking_budget: null,
    });

    // Sanity: the row on disk has NULLs (not stringified 'null').
    const row = testDb.prepare(
      'SELECT reasoning_effort, max_tokens, thinking_budget FROM model_aliases WHERE alias = ?'
    ).get('catbot') as {
      reasoning_effort: string | null;
      max_tokens: number | null;
      thinking_budget: number | null;
    };
    expect(row.reasoning_effort).toBeNull();
    expect(row.max_tokens).toBeNull();
    expect(row.thinking_budget).toBeNull();
  });
});
