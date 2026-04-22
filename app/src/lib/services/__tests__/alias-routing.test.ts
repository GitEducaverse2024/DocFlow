import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockCacheGet = vi.fn().mockReturnValue(null);
const mockCacheSet = vi.fn();
vi.mock('@/lib/cache', () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
}));

const mockDbRun = vi.fn().mockReturnValue({ changes: 1 });
const mockDbGet = vi.fn().mockReturnValue(null);
const mockDbAll = vi.fn().mockReturnValue([]);
const mockDbPrepare = vi.fn().mockReturnValue({
  run: mockDbRun,
  get: mockDbGet,
  all: mockDbAll,
});
vi.mock('@/lib/db', () => ({
  default: {
    prepare: (...args: unknown[]) => mockDbPrepare(...args),
  },
}));

// Mock Discovery
const mockGetInventory = vi.fn();
vi.mock('@/lib/services/discovery', () => ({
  getInventory: (...args: unknown[]) => mockGetInventory(...args),
}));

// Mock MID
const mockGetAll = vi.fn();
vi.mock('@/lib/services/mid', () => ({
  getAll: (...args: unknown[]) => mockGetAll(...args),
}));

// ---- Helpers ----

function makeAliasRow(overrides: Record<string, unknown> = {}) {
  return {
    alias: 'chat-rag',
    model_key: 'gemini-main',
    description: 'Chat RAG conversations',
    is_active: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeInventory(modelIds: string[]) {
  return {
    models: modelIds.map(id => {
      // For prefixed ids like 'ollama/gemma4:31b', model_id is the unprefixed tail.
      // For unprefixed ids (legacy fixtures), model_id mirrors id.
      const slashIdx = id.indexOf('/');
      const model_id = slashIdx >= 0 ? id.substring(slashIdx + 1) : id;
      return { id, model_id, provider: 'test' };
    }),
    providers: [],
    timestamp: new Date().toISOString(),
    cached: false,
  };
}

function makeMidEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mid-001',
    model_key: 'gemini-main',
    tier: 'Pro',
    status: 'active',
    ...overrides,
  };
}

// Phase 159 (v30.0): Row shape including 3 new columns from Phase 158.
function makeAliasRowV30(overrides: Record<string, unknown> = {}) {
  return {
    alias: 'catbot',
    model_key: 'gemini-main',
    description: 'CatBot assistant',
    is_active: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    reasoning_effort: null,
    max_tokens: null,
    thinking_budget: null,
    ...overrides,
  };
}

// ---- Tests ----

describe('AliasRoutingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env
    delete process['env']['CHAT_MODEL'];
    delete process['env']['EMBEDDING_MODEL'];
  });

  describe('seedAliases', () => {
    it('inserts 8 aliases when table is empty', async () => {
      // count returns 0
      mockDbGet.mockReturnValueOnce({ c: 0 });

      const { seedAliases } = await import('@/lib/services/alias-routing');
      seedAliases();

      // Should have called prepare for count query + 8 inserts
      // Count query
      expect(mockDbPrepare).toHaveBeenCalledWith(
        expect.stringContaining('COUNT')
      );
      // 8 insert calls via run
      expect(mockDbRun).toHaveBeenCalledTimes(8);
    });

    it('is idempotent -- does nothing when rows exist', async () => {
      // count returns 8
      mockDbGet.mockReturnValueOnce({ c: 8 });

      const { seedAliases } = await import('@/lib/services/alias-routing');
      seedAliases();

      // Only the count query, no inserts
      expect(mockDbRun).not.toHaveBeenCalled();
    });

    it('seeds 7 chat aliases pointing to gemini-main and embed to text-embedding-3-small', async () => {
      mockDbGet.mockReturnValueOnce({ c: 0 });

      const { seedAliases } = await import('@/lib/services/alias-routing');
      seedAliases();

      // Check the embed seed specifically
      const embedCall = mockDbRun.mock.calls.find(
        (call: unknown[]) => call[0] === 'embed'
      );
      expect(embedCall).toBeTruthy();
      expect(embedCall![1]).toBe('text-embedding-3-small');

      // Check chat aliases all point to gemini-main
      const chatCalls = mockDbRun.mock.calls.filter(
        (call: unknown[]) => call[0] !== 'embed'
      );
      expect(chatCalls).toHaveLength(7);
      for (const call of chatCalls) {
        expect(call[1]).toBe('gemini-main');
      }
    });
  });

  describe('resolveAlias - happy path', () => {
    it('returns configured model when available in Discovery', async () => {
      mockDbGet.mockReturnValueOnce(makeAliasRow());
      mockGetInventory.mockResolvedValueOnce(makeInventory(['gemini-main', 'gpt-4o']));

      const { resolveAlias } = await import('@/lib/services/alias-routing');
      const result = await resolveAlias('chat-rag');

      expect(result).toBe('gemini-main');
    });

    it('returns ollama/gemma4:31b when alias points to prefixed Ollama model id in inventory', async () => {
      mockDbGet.mockReturnValueOnce(
        makeAliasRow({ alias: 'chat-rag', model_key: 'ollama/gemma4:31b' })
      );
      // Inventory contains the Ollama model with prefixed id.
      mockGetInventory.mockResolvedValueOnce(
        makeInventory(['ollama/gemma4:31b', 'gemini-main'])
      );

      const { resolveAlias } = await import('@/lib/services/alias-routing');
      const result = await resolveAlias('chat-rag');

      // Must match against m.id (prefixed), NOT m.model_id (unprefixed 'gemma4:31b').
      // If code used m.model_id, the lookup would miss and fall through to a fallback.
      expect(result).toBe('ollama/gemma4:31b');
    });

    it('returns text-embedding-3-small for embed alias when available', async () => {
      mockDbGet.mockReturnValueOnce(
        makeAliasRow({ alias: 'embed', model_key: 'text-embedding-3-small' })
      );
      mockGetInventory.mockResolvedValueOnce(
        makeInventory(['text-embedding-3-small', 'gemini-main'])
      );

      const { resolveAlias } = await import('@/lib/services/alias-routing');
      const result = await resolveAlias('embed');

      expect(result).toBe('text-embedding-3-small');
    });
  });

  describe('resolveAlias - fallback chain (chat aliases)', () => {
    it('falls back to same-tier MID alternative when configured model is down', async () => {
      mockDbGet.mockReturnValueOnce(makeAliasRow({ model_key: 'gemini-main' }));
      // gemini-main NOT in Discovery
      mockGetInventory.mockResolvedValueOnce(makeInventory(['claude-sonnet', 'gpt-4o']));
      // MID has same-tier alternative
      mockGetAll.mockReturnValueOnce([
        makeMidEntry({ model_key: 'gemini-main', tier: 'Pro' }),
        makeMidEntry({ id: 'mid-002', model_key: 'claude-sonnet', tier: 'Pro' }),
        makeMidEntry({ id: 'mid-003', model_key: 'gpt-4o', tier: 'Elite' }),
      ]);

      const { resolveAlias } = await import('@/lib/services/alias-routing');
      const result = await resolveAlias('chat-rag');

      expect(result).toBe('claude-sonnet');
    });

    it('falls back to CHAT_MODEL env when no same-tier models available', async () => {
      process['env']['CHAT_MODEL'] = 'fallback-model';
      mockDbGet.mockReturnValueOnce(makeAliasRow({ model_key: 'gemini-main' }));
      // No models in Discovery
      mockGetInventory.mockResolvedValueOnce(makeInventory([]));
      // MID has same tier but none available
      mockGetAll.mockReturnValueOnce([
        makeMidEntry({ model_key: 'gemini-main', tier: 'Pro' }),
      ]);

      const { resolveAlias } = await import('@/lib/services/alias-routing');
      const result = await resolveAlias('chat-rag');

      expect(result).toBe('fallback-model');
    });

    it('throws error when end of chain reached (no models available at all)', async () => {
      mockDbGet.mockReturnValueOnce(makeAliasRow({ model_key: 'gemini-main' }));
      mockGetInventory.mockResolvedValueOnce(makeInventory([]));
      mockGetAll.mockReturnValueOnce([
        makeMidEntry({ model_key: 'gemini-main', tier: 'Pro' }),
      ]);
      // No CHAT_MODEL env

      const { resolveAlias } = await import('@/lib/services/alias-routing');
      await expect(resolveAlias('chat-rag')).rejects.toThrow(
        /No model available for alias "chat-rag"/
      );
    });
  });

  describe('resolveAlias - embed fallback chain', () => {
    it('embed falls back to EMBEDDING_MODEL env, never CHAT_MODEL', async () => {
      process['env']['CHAT_MODEL'] = 'should-not-use';
      process['env']['EMBEDDING_MODEL'] = 'embedding-fallback';
      mockDbGet.mockReturnValueOnce(
        makeAliasRow({ alias: 'embed', model_key: 'text-embedding-3-small' })
      );
      // text-embedding-3-small NOT in Discovery
      mockGetInventory.mockResolvedValueOnce(makeInventory([]));

      const { resolveAlias } = await import('@/lib/services/alias-routing');
      const result = await resolveAlias('embed');

      expect(result).toBe('embedding-fallback');
    });

    it('embed does NOT do MID tier matching', async () => {
      process['env']['EMBEDDING_MODEL'] = 'embedding-fallback';
      mockDbGet.mockReturnValueOnce(
        makeAliasRow({ alias: 'embed', model_key: 'text-embedding-3-small' })
      );
      mockGetInventory.mockResolvedValueOnce(makeInventory([]));

      const { resolveAlias } = await import('@/lib/services/alias-routing');
      await resolveAlias('embed');

      // MID getAll should NOT be called for embed aliases
      expect(mockGetAll).not.toHaveBeenCalled();
    });

    it('embed throws error when no embedding model available (no CHAT_MODEL fallback)', async () => {
      // Only CHAT_MODEL set, no EMBEDDING_MODEL
      process['env']['CHAT_MODEL'] = 'should-not-use';
      mockDbGet.mockReturnValueOnce(
        makeAliasRow({ alias: 'embed', model_key: 'text-embedding-3-small' })
      );
      mockGetInventory.mockResolvedValueOnce(makeInventory([]));

      const { resolveAlias } = await import('@/lib/services/alias-routing');
      await expect(resolveAlias('embed')).rejects.toThrow(
        /No model available for alias "embed"/
      );
    });
  });

  describe('resolveAlias - unknown alias', () => {
    it('unknown alias falls back to CHAT_MODEL env', async () => {
      process['env']['CHAT_MODEL'] = 'env-model';
      // No alias row found
      mockDbGet.mockReturnValueOnce(undefined);

      const { resolveAlias } = await import('@/lib/services/alias-routing');
      const result = await resolveAlias('nonexistent');

      expect(result).toBe('env-model');
    });

    it('unknown alias with no CHAT_MODEL throws error', async () => {
      mockDbGet.mockReturnValueOnce(undefined);

      const { resolveAlias } = await import('@/lib/services/alias-routing');
      await expect(resolveAlias('nonexistent')).rejects.toThrow(
        /No model available for alias "nonexistent"/
      );
    });
  });

  describe('resolveAlias - logging', () => {
    it('logs resolution with required fields on happy path', async () => {
      const { logger } = await import('@/lib/logger');
      mockDbGet.mockReturnValueOnce(makeAliasRow());
      mockGetInventory.mockResolvedValueOnce(makeInventory(['gemini-main']));

      const { resolveAlias } = await import('@/lib/services/alias-routing');
      await resolveAlias('chat-rag');

      expect(logger.info).toHaveBeenCalledWith(
        'alias-routing',
        expect.stringContaining('chat-rag'),
        expect.objectContaining({
          alias: 'chat-rag',
          requested_model: 'gemini-main',
          resolved_model: 'gemini-main',
          fallback_used: false,
          latency_ms: expect.any(Number),
        })
      );
    });

    it('logs fallback resolution with reason', async () => {
      const { logger } = await import('@/lib/logger');
      process['env']['CHAT_MODEL'] = 'fallback-model';
      mockDbGet.mockReturnValueOnce(makeAliasRow({ model_key: 'gemini-main' }));
      mockGetInventory.mockResolvedValueOnce(makeInventory([]));
      mockGetAll.mockReturnValueOnce([
        makeMidEntry({ model_key: 'gemini-main', tier: 'Pro' }),
      ]);

      const { resolveAlias } = await import('@/lib/services/alias-routing');
      await resolveAlias('chat-rag');

      expect(logger.info).toHaveBeenCalledWith(
        'alias-routing',
        expect.stringContaining('chat-rag'),
        expect.objectContaining({
          alias: 'chat-rag',
          requested_model: 'gemini-main',
          resolved_model: 'fallback-model',
          fallback_used: true,
          fallback_reason: 'env_fallback',
          latency_ms: expect.any(Number),
        })
      );
    });

    it('logs fallback resolution on same-tier match', async () => {
      const { logger } = await import('@/lib/logger');
      mockDbGet.mockReturnValueOnce(makeAliasRow({ model_key: 'gemini-main' }));
      mockGetInventory.mockResolvedValueOnce(makeInventory(['claude-sonnet']));
      mockGetAll.mockReturnValueOnce([
        makeMidEntry({ model_key: 'gemini-main', tier: 'Pro' }),
        makeMidEntry({ id: 'mid-002', model_key: 'claude-sonnet', tier: 'Pro' }),
      ]);

      const { resolveAlias } = await import('@/lib/services/alias-routing');
      await resolveAlias('chat-rag');

      expect(logger.info).toHaveBeenCalledWith(
        'alias-routing',
        expect.stringContaining('chat-rag'),
        expect.objectContaining({
          fallback_used: true,
          fallback_reason: expect.stringContaining('same_tier_fallback'),
        })
      );
    });

    it('logs error resolution when end of chain reached', async () => {
      const { logger } = await import('@/lib/logger');
      mockDbGet.mockReturnValueOnce(makeAliasRow({ model_key: 'gemini-main' }));
      mockGetInventory.mockResolvedValueOnce(makeInventory([]));
      mockGetAll.mockReturnValueOnce([
        makeMidEntry({ model_key: 'gemini-main', tier: 'Pro' }),
      ]);

      const { resolveAlias } = await import('@/lib/services/alias-routing');
      try {
        await resolveAlias('chat-rag');
      } catch {
        // expected
      }

      expect(logger.info).toHaveBeenCalledWith(
        'alias-routing',
        expect.stringContaining('chat-rag'),
        expect.objectContaining({
          alias: 'chat-rag',
          fallback_used: true,
          fallback_reason: 'no_model_available',
        })
      );
    });
  });

  describe('getAllAliases', () => {
    it('returns all aliases ordered by alias', async () => {
      const aliases = [
        makeAliasRow({ alias: 'agent-task' }),
        makeAliasRow({ alias: 'catbot' }),
        makeAliasRow({ alias: 'chat-rag' }),
      ];
      mockDbAll.mockReturnValueOnce(aliases);

      const { getAllAliases } = await import('@/lib/services/alias-routing');
      const result = getAllAliases();

      expect(mockDbPrepare).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY alias')
      );
      expect(result).toEqual(aliases);
    });

    it('filters by active_only when option is true', async () => {
      const aliases = [makeAliasRow({ alias: 'catbot', is_active: 1 })];
      mockDbAll.mockReturnValueOnce(aliases);

      const { getAllAliases } = await import('@/lib/services/alias-routing');
      const result = getAllAliases({ active_only: true });

      expect(mockDbPrepare).toHaveBeenCalledWith(
        expect.stringContaining('is_active = 1')
      );
      expect(result).toEqual(aliases);
    });

    it('returns all aliases including inactive when no filter', async () => {
      const aliases = [
        makeAliasRow({ alias: 'catbot', is_active: 1 }),
        makeAliasRow({ alias: 'old-alias', is_active: 0 }),
      ];
      mockDbAll.mockReturnValueOnce(aliases);

      const { getAllAliases } = await import('@/lib/services/alias-routing');
      const result = getAllAliases();

      expect(result).toHaveLength(2);
    });
  });

  describe('updateAlias', () => {
    it('updates model_key and returns updated row', async () => {
      const updatedRow = makeAliasRow({ alias: 'catbot', model_key: 'claude-sonnet-4' });
      mockDbRun.mockReturnValueOnce({ changes: 1 });
      mockDbGet.mockReturnValueOnce(updatedRow);

      const { updateAlias } = await import('@/lib/services/alias-routing');
      const result = updateAlias('catbot', 'claude-sonnet-4');

      expect(mockDbPrepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE model_aliases')
      );
      expect(result).toEqual(updatedRow);
    });

    it('throws error when alias does not exist', async () => {
      mockDbRun.mockReturnValueOnce({ changes: 0 });

      const { updateAlias } = await import('@/lib/services/alias-routing');

      expect(() => updateAlias('nonexistent', 'some-model')).toThrow(
        /Alias "nonexistent" not found/
      );
    });

    it('throws error when new model key is empty', async () => {
      const { updateAlias } = await import('@/lib/services/alias-routing');

      expect(() => updateAlias('catbot', '')).toThrow(/empty/i);
    });

    it('logs the alias update', async () => {
      const { logger } = await import('@/lib/logger');
      const updatedRow = makeAliasRow({ alias: 'catbot', model_key: 'claude-sonnet-4' });
      mockDbRun.mockReturnValueOnce({ changes: 1 });
      mockDbGet.mockReturnValueOnce(updatedRow);

      const { updateAlias } = await import('@/lib/services/alias-routing');
      updateAlias('catbot', 'claude-sonnet-4');

      expect(logger.info).toHaveBeenCalledWith(
        'alias-routing',
        expect.stringContaining('catbot'),
        expect.objectContaining({
          alias: 'catbot',
          new_model: 'claude-sonnet-4',
        })
      );
    });
  });
});

// ========================================================================
// Phase 159 (v30.0) — resolveAliasConfig + resolveAlias shim + updateAlias opts
// ========================================================================

describe('resolveAliasConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process['env']['CHAT_MODEL'];
    delete process['env']['EMBEDDING_MODEL'];
  });

  it('CFG-03a — returns config with model + all 3 reasoning fields populated from row', async () => {
    mockDbGet.mockReturnValueOnce(
      makeAliasRowV30({
        alias: 'catbot',
        model_key: 'anthropic/claude-opus-4-6',
        reasoning_effort: 'high',
        max_tokens: 8000,
        thinking_budget: 4000,
      }),
    );
    mockGetInventory.mockResolvedValueOnce(makeInventory(['anthropic/claude-opus-4-6']));

    const { resolveAliasConfig } = await import('@/lib/services/alias-routing');
    const cfg = await resolveAliasConfig('catbot');

    expect(cfg).toEqual({
      model: 'anthropic/claude-opus-4-6',
      reasoning_effort: 'high',
      max_tokens: 8000,
      thinking_budget: 4000,
    });
  });

  it('CFG-03b — preserves NULL→null for all 3 config fields', async () => {
    mockDbGet.mockReturnValueOnce(makeAliasRowV30({ alias: 'chat-rag', model_key: 'gemini-main' }));
    mockGetInventory.mockResolvedValueOnce(makeInventory(['gemini-main']));

    const { resolveAliasConfig } = await import('@/lib/services/alias-routing');
    const cfg = await resolveAliasConfig('chat-rag');

    expect(cfg.model).toBe('gemini-main');
    expect(cfg.reasoning_effort).toBeNull();
    expect(cfg.max_tokens).toBeNull();
    expect(cfg.thinking_budget).toBeNull();
  });

  it('CFG-03c — fallback to same-tier alternative carries row reasoning config', async () => {
    mockDbGet.mockReturnValueOnce(
      makeAliasRowV30({
        alias: 'catbot',
        model_key: 'gemini-main',
        reasoning_effort: 'medium',
        max_tokens: 4000,
        thinking_budget: null,
      }),
    );
    // configured gemini-main NOT available; gpt-4o same-tier IS available
    mockGetInventory.mockResolvedValueOnce(makeInventory(['gpt-4o']));
    mockGetAll.mockReturnValueOnce([
      makeMidEntry({ model_key: 'gemini-main', tier: 'Pro' }),
      makeMidEntry({ id: 'mid-002', model_key: 'gpt-4o', tier: 'Pro' }),
    ]);

    const { resolveAliasConfig } = await import('@/lib/services/alias-routing');
    const cfg = await resolveAliasConfig('catbot');

    expect(cfg.model).toBe('gpt-4o');
    expect(cfg.reasoning_effort).toBe('medium');
    expect(cfg.max_tokens).toBe(4000);
    expect(cfg.thinking_budget).toBeNull();
  });

  it('CFG-03d — env fallback when no row returns null for reasoning fields', async () => {
    mockDbGet.mockReturnValueOnce(undefined);
    process['env']['CHAT_MODEL'] = 'fallback-model';

    const { resolveAliasConfig } = await import('@/lib/services/alias-routing');
    const cfg = await resolveAliasConfig('unknown-alias');

    expect(cfg).toEqual({
      model: 'fallback-model',
      reasoning_effort: null,
      max_tokens: null,
      thinking_budget: null,
    });
  });

  it('CFG-03e — embed alias uses EMBEDDING_MODEL with reasoning fields null', async () => {
    mockDbGet.mockReturnValueOnce(
      makeAliasRowV30({
        alias: 'embed',
        model_key: 'text-embedding-3-small',
      }),
    );
    mockGetInventory.mockResolvedValueOnce(makeInventory([])); // not available
    process['env']['EMBEDDING_MODEL'] = 'nomic-embed-text';

    const { resolveAliasConfig } = await import('@/lib/services/alias-routing');
    const cfg = await resolveAliasConfig('embed');

    expect(cfg.model).toBe('nomic-embed-text');
    expect(cfg.reasoning_effort).toBeNull();
    expect(cfg.max_tokens).toBeNull();
    expect(cfg.thinking_budget).toBeNull();
  });
});

describe('resolveAlias (shim back-compat)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process['env']['CHAT_MODEL'];
    delete process['env']['EMBEDDING_MODEL'];
  });

  it('CFG-03f — resolveAlias returns Promise<string> equal to resolved .model', async () => {
    mockDbGet.mockReturnValueOnce(
      makeAliasRowV30({
        alias: 'catbot',
        model_key: 'anthropic/claude-opus-4-6',
        reasoning_effort: 'high',
        max_tokens: 8000,
      }),
    );
    mockGetInventory.mockResolvedValueOnce(makeInventory(['anthropic/claude-opus-4-6']));

    const { resolveAlias } = await import('@/lib/services/alias-routing');
    const result = await resolveAlias('catbot');

    expect(typeof result).toBe('string');
    expect(result).toBe('anthropic/claude-opus-4-6');
  });
});

describe('updateAlias with opts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CFG-03g — updateAlias without opts works unchanged (back-compat)', async () => {
    const updatedRow = makeAliasRowV30({ alias: 'catbot', model_key: 'gpt-4o' });
    mockDbPrepare.mockImplementation((sql: string) => {
      if (sql.startsWith('UPDATE')) {
        return { run: vi.fn().mockReturnValue({ changes: 1 }), get: vi.fn(), all: vi.fn() };
      }
      return { get: vi.fn().mockReturnValue(updatedRow), run: vi.fn(), all: vi.fn() };
    });

    const { updateAlias } = await import('@/lib/services/alias-routing');
    const result = updateAlias('catbot', 'gpt-4o');

    expect(result).toEqual(updatedRow);

    const updateCall = (mockDbPrepare as unknown as {
      mock: { calls: unknown[][] };
    }).mock.calls.find((c: unknown[]) => String(c[0]).startsWith('UPDATE'));
    expect(updateCall).toBeTruthy();
    expect(String(updateCall![0])).toContain('model_key = ?');
    // Legacy path must NOT include reasoning columns
    expect(String(updateCall![0])).not.toContain('reasoning_effort = ?');
  });

  it('CFG-03h — updateAlias with opts persists reasoning_effort, max_tokens, thinking_budget', async () => {
    const updatedRow = makeAliasRowV30({
      alias: 'catbot',
      model_key: 'anthropic/claude-opus-4-6',
      reasoning_effort: 'high',
      max_tokens: 8000,
      thinking_budget: 4000,
    });
    const runSpy = vi.fn().mockReturnValue({ changes: 1 });
    mockDbPrepare.mockImplementation((sql: string) => {
      if (sql.startsWith('UPDATE')) {
        return { run: runSpy, get: vi.fn(), all: vi.fn() };
      }
      return { get: vi.fn().mockReturnValue(updatedRow), run: vi.fn(), all: vi.fn() };
    });

    const { updateAlias } = await import('@/lib/services/alias-routing');
    const result = updateAlias('catbot', 'anthropic/claude-opus-4-6', {
      reasoning_effort: 'high',
      max_tokens: 8000,
      thinking_budget: 4000,
    });

    expect(result).toEqual(updatedRow);

    const updateCall = (mockDbPrepare as unknown as {
      mock: { calls: unknown[][] };
    }).mock.calls.find((c: unknown[]) => String(c[0]).startsWith('UPDATE'));
    expect(updateCall).toBeTruthy();
    expect(String(updateCall![0])).toContain('reasoning_effort = ?');
    expect(String(updateCall![0])).toContain('max_tokens = ?');
    expect(String(updateCall![0])).toContain('thinking_budget = ?');

    expect(runSpy).toHaveBeenCalled();
    const runArgs = runSpy.mock.calls[0] as unknown[];
    expect(runArgs).toContain('high');
    expect(runArgs).toContain(8000);
    expect(runArgs).toContain(4000);
  });
});
