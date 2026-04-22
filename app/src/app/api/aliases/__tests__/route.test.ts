import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----
// Pattern: mirrors app/src/app/api/models/__tests__/route.test.ts and
// alias-routing.test.ts. `vi.mock` calls are hoisted; the route module is
// imported dynamically inside each test so mocks are installed first.

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// We intercept db.prepare(sql).all() so tests can shape the JOINed rows directly
// without spinning up better-sqlite3. This is the same approach as the /api/models
// enrichment tests (Phase 158-02): stub the query, not the DB engine.
const mockDbAll = vi.fn();
const mockDbPrepare = vi.fn().mockImplementation(() => ({
  all: (...args: unknown[]) => mockDbAll(...args),
}));
vi.mock('@/lib/db', () => ({
  default: {
    prepare: (...args: unknown[]) => mockDbPrepare(...args),
  },
}));

// ---- Fixtures ----
// The 3 alias rows the plan specifies, pre-JOINed with model_intelligence.
// `cap_model_key = null` on the third row simulates the LEFT JOIN miss
// (graceful degradation path for the namespace-mismatch blocker in STATE.md).

const ROW_CATBOT = {
  alias: 'catbot',
  model_key: 'claude-opus',
  description: 'CatBot',
  is_active: 1,
  reasoning_effort: 'high',
  max_tokens: 32000,
  thinking_budget: 16000,
  cap_model_key: 'claude-opus',
  cap_supports_reasoning: 1,
  cap_max_tokens: 32000,
  cap_is_local: 0,
};

const ROW_CHAT_RAG = {
  alias: 'chat-rag',
  model_key: 'gemini-main',
  description: 'RAG',
  is_active: 1,
  reasoning_effort: null,
  max_tokens: null,
  thinking_budget: null,
  cap_model_key: 'gemini-main',
  cap_supports_reasoning: 1,
  cap_max_tokens: 65536,
  cap_is_local: 0,
};

const ROW_UNKNOWN = {
  alias: 'unknown-alias',
  model_key: 'non-existent-key',
  description: 'Orphan',
  is_active: 1,
  reasoning_effort: null,
  max_tokens: null,
  thinking_budget: null,
  // LEFT JOIN miss: all cap_* columns NULL including cap_model_key.
  cap_model_key: null,
  cap_supports_reasoning: null,
  cap_max_tokens: null,
  cap_is_local: null,
};

// ---- Tests ----

describe('GET /api/aliases — Phase 161 enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbAll.mockReturnValue([ROW_CATBOT, ROW_CHAT_RAG, ROW_UNKNOWN]);
    mockDbPrepare.mockImplementation(() => ({
      all: (...args: unknown[]) => mockDbAll(...args),
    }));
  });

  it('returns enriched shape with exactly 8 top-level keys: alias, model_key, description, is_active, reasoning_effort, max_tokens, thinking_budget, capabilities', async () => {
    const { GET } = await import('../route');
    const res = await GET();
    const json = await res.json();

    expect(json.aliases).toHaveLength(3);
    const sortedKeys = Object.keys(json.aliases[0]).sort();
    expect(sortedKeys).toEqual(
      [
        'alias',
        'capabilities',
        'description',
        'is_active',
        'max_tokens',
        'model_key',
        'reasoning_effort',
        'thinking_budget',
      ].sort(),
    );
  });

  it('coerces supports_reasoning INTEGER 1 → boolean true (strict equality, not truthy)', async () => {
    const { GET } = await import('../route');
    const res = await GET();
    const json = await res.json();

    const catbot = json.aliases.find((a: { alias: string }) => a.alias === 'catbot');
    expect(catbot.capabilities.supports_reasoning).toBe(true);
    expect(typeof catbot.capabilities.supports_reasoning).toBe('boolean');
  });

  it('coerces is_local INTEGER 0 → boolean false', async () => {
    const { GET } = await import('../route');
    const res = await GET();
    const json = await res.json();

    const catbot = json.aliases.find((a: { alias: string }) => a.alias === 'catbot');
    expect(catbot.capabilities.is_local).toBe(false);
    expect(typeof catbot.capabilities.is_local).toBe('boolean');
  });

  it('graceful degradation: capabilities is null (strict) when model_intelligence has no row', async () => {
    const { GET } = await import('../route');
    const res = await GET();
    const json = await res.json();

    const orphan = json.aliases.find((a: { alias: string }) => a.alias === 'unknown-alias');
    expect(orphan.capabilities).toBeNull();
    // Strict: NOT an object with nulls inside.
    expect(orphan.capabilities).not.toEqual({
      supports_reasoning: null,
      max_tokens_cap: null,
      is_local: null,
    });
  });

  it('per-alias reasoning config passthrough', async () => {
    const { GET } = await import('../route');
    const res = await GET();
    const json = await res.json();

    const catbot = json.aliases.find((a: { alias: string }) => a.alias === 'catbot');
    expect(catbot.reasoning_effort).toBe('high');
    expect(catbot.max_tokens).toBe(32000);
    expect(catbot.thinking_budget).toBe(16000);
  });

  it('null reasoning config for unconfigured aliases', async () => {
    const { GET } = await import('../route');
    const res = await GET();
    const json = await res.json();

    const chatRag = json.aliases.find((a: { alias: string }) => a.alias === 'chat-rag');
    expect(chatRag.reasoning_effort).toBeNull();
    expect(chatRag.max_tokens).toBeNull();
    expect(chatRag.thinking_budget).toBeNull();
  });

  it('returns 500 + body.error on DB error', async () => {
    mockDbPrepare.mockImplementationOnce(() => {
      throw new Error('no such table: model_intelligence');
    });

    const { GET } = await import('../route');
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(typeof json.error).toBe('string');
    expect(json.error.length).toBeGreaterThan(0);
  });
});
