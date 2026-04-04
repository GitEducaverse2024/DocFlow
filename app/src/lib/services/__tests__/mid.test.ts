import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

vi.mock('@/lib/utils', () => ({
  generateId: vi.fn(() => 'test-generated-id'),
}));

// ---- Helpers ----

function makeMidRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mid-001',
    model_key: 'anthropic/claude-opus-4',
    display_name: 'Claude Opus 4',
    provider: 'anthropic',
    tier: 'Elite',
    best_use: 'Razonamiento complejo, analisis profundo',
    capabilities: '["function_calling","thinking","200k_context","vision"]',
    cost_tier: 'premium',
    cost_notes: '$15/$75 por 1M tokens',
    scores: '{"reasoning":10,"coding":9,"creativity":9,"speed":5,"multilingual":9}',
    status: 'active',
    auto_created: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeDiscoveredModel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ollama/newmodel:7b',
    name: 'newmodel',
    provider: 'ollama' as const,
    model_id: 'newmodel:7b',
    is_local: true,
    size_mb: 4000,
    parameter_size: '7B',
    family: 'llama',
    quantization: null,
    is_embedding: false,
    modified_at: '2026-01-15T10:00:00Z',
    ...overrides,
  };
}

// ---- Tests ----

describe('MidService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheGet.mockReturnValue(null);
    mockDbAll.mockReturnValue([]);
    mockDbGet.mockReturnValue(null);
    mockDbRun.mockReturnValue({ changes: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('MID-01: Schema / types', () => {
    it('MidEntry has all required fields with correct types', async () => {
      const { getById } = await import('../mid');
      const row = makeMidRow();
      mockDbGet.mockReturnValue(row);

      const entry = getById('mid-001');

      expect(entry).not.toBeNull();
      expect(entry!.id).toBe('mid-001');
      expect(entry!.model_key).toBe('anthropic/claude-opus-4');
      expect(entry!.display_name).toBe('Claude Opus 4');
      expect(entry!.provider).toBe('anthropic');
      expect(entry!.tier).toBe('Elite');
      expect(entry!.best_use).toBe('Razonamiento complejo, analisis profundo');
      expect(entry!.capabilities).toEqual(['function_calling', 'thinking', '200k_context', 'vision']);
      expect(entry!.cost_tier).toBe('premium');
      expect(entry!.cost_notes).toBe('$15/$75 por 1M tokens');
      expect(entry!.scores).toEqual({ reasoning: 10, coding: 9, creativity: 9, speed: 5, multilingual: 9 });
      expect(entry!.status).toBe('active');
      expect(entry!.auto_created).toBe(0);
      expect(entry!.created_at).toBeDefined();
      expect(entry!.updated_at).toBeDefined();
    });

    it('capabilities and scores are parsed from JSON strings', async () => {
      const { getById } = await import('../mid');
      const row = makeMidRow({
        capabilities: '["chat","vision"]',
        scores: '{"reasoning":8}',
      });
      mockDbGet.mockReturnValue(row);

      const entry = getById('mid-001');
      expect(Array.isArray(entry!.capabilities)).toBe(true);
      expect(typeof entry!.scores).toBe('object');
      expect(entry!.scores).not.toBeNull();
    });

    it('handles malformed JSON in capabilities/scores gracefully', async () => {
      const { getById } = await import('../mid');
      const row = makeMidRow({
        capabilities: 'not-json',
        scores: '{bad',
      });
      mockDbGet.mockReturnValue(row);

      const entry = getById('mid-001');
      expect(entry).not.toBeNull();
      expect(Array.isArray(entry!.capabilities)).toBe(true);
      expect(entry!.capabilities).toEqual([]);
      expect(typeof entry!.scores).toBe('object');
      expect(entry!.scores).toEqual({});
    });

    it('handles null capabilities/scores', async () => {
      const { getById } = await import('../mid');
      const row = makeMidRow({
        capabilities: null,
        scores: null,
      });
      mockDbGet.mockReturnValue(row);

      const entry = getById('mid-001');
      expect(entry!.capabilities).toEqual([]);
      expect(entry!.scores).toEqual({});
    });
  });

  describe('MID-02: CRUD operations', () => {
    it('getAll() returns array of MidEntry objects excluding retired by default', async () => {
      const { getAll } = await import('../mid');
      mockDbAll.mockReturnValue([
        makeMidRow({ id: 'mid-001', status: 'active' }),
        makeMidRow({ id: 'mid-002', status: 'inactive' }),
      ]);

      const entries = getAll();

      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBe(2);
      // Should have called prepare with query excluding retired
      expect(mockDbPrepare).toHaveBeenCalledWith(
        expect.stringContaining('retired'),
      );
    });

    it('getAll({status: "all"}) includes retired models', async () => {
      const { getAll } = await import('../mid');
      mockDbAll.mockReturnValue([
        makeMidRow({ id: 'mid-001', status: 'active' }),
        makeMidRow({ id: 'mid-002', status: 'retired' }),
      ]);

      const entries = getAll({ status: 'all' });

      expect(entries.length).toBe(2);
      // Should NOT filter by status
      expect(mockDbPrepare).toHaveBeenCalledWith(
        expect.not.stringContaining('WHERE'),
      );
    });

    it('getAll({status: "inactive"}) filters to specific status', async () => {
      const { getAll } = await import('../mid');
      mockDbAll.mockReturnValue([
        makeMidRow({ id: 'mid-002', status: 'inactive' }),
      ]);

      const entries = getAll({ status: 'inactive' });
      expect(entries.length).toBe(1);
      expect(mockDbPrepare).toHaveBeenCalledWith(
        expect.stringContaining('status = ?'),
      );
    });

    it('getById() returns single MidEntry or null', async () => {
      const { getById } = await import('../mid');

      // Found
      mockDbGet.mockReturnValue(makeMidRow());
      const found = getById('mid-001');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('mid-001');

      // Not found
      mockDbGet.mockReturnValue(null);
      const notFound = getById('nonexistent');
      expect(notFound).toBeNull();
    });

    it('create() inserts entry with generateId() and returns id', async () => {
      const { create } = await import('../mid');

      const id = create({
        model_key: 'openai/gpt-4o',
        display_name: 'GPT-4o',
        provider: 'openai',
        tier: 'Pro',
        best_use: 'Uso general rapido',
        capabilities: ['function_calling', 'vision'],
        cost_tier: 'medium',
        cost_notes: '$5/$15 por 1M tokens',
        scores: { reasoning: 8, coding: 8, speed: 9 },
      });

      expect(id).toBe('test-generated-id');
      expect(mockDbPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO model_intelligence'),
      );
      expect(mockDbRun).toHaveBeenCalled();
    });

    it('update() updates only provided fields + updated_at', async () => {
      const { update } = await import('../mid');

      const result = update('mid-001', { tier: 'Elite', best_use: 'Updated desc' });

      expect(result).toBe(true);
      expect(mockDbPrepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE model_intelligence'),
      );
      // Should include updated_at in the SET clause
      expect(mockDbPrepare).toHaveBeenCalledWith(
        expect.stringContaining('updated_at'),
      );
    });

    it('update() returns false when no rows affected', async () => {
      const { update } = await import('../mid');
      mockDbRun.mockReturnValue({ changes: 0 });

      const result = update('nonexistent', { tier: 'Pro' });
      expect(result).toBe(false);
    });

    it('update() stringifies capabilities and scores to JSON', async () => {
      const { update } = await import('../mid');

      update('mid-001', {
        capabilities: ['chat', 'vision'],
        scores: { reasoning: 10 },
      });

      // The run call should receive JSON strings for these fields
      const runArgs = mockDbRun.mock.calls[0];
      expect(runArgs).toBeDefined();
      // Capabilities and scores should be JSON-stringified in the args
      const argsStr = JSON.stringify(runArgs);
      expect(argsStr).toContain('"chat"');
      expect(argsStr).toContain('"reasoning"');
    });
  });

  describe('MID-03: Seed data', () => {
    it('seedModels() inserts ~15-20 models when table has 0 rows', async () => {
      const { seedModels } = await import('../mid');
      mockDbGet.mockReturnValue({ c: 0 });

      seedModels();

      // Should have checked count first
      expect(mockDbPrepare).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*)'),
      );

      // Should have inserted multiple models via run()
      const insertCalls = mockDbRun.mock.calls.length;
      expect(insertCalls).toBeGreaterThanOrEqual(15);
      expect(insertCalls).toBeLessThanOrEqual(25);
    });

    it('seedModels() does nothing when table already has rows', async () => {
      const { seedModels } = await import('../mid');
      mockDbGet.mockReturnValue({ c: 5 });

      seedModels();

      // Should check count
      expect(mockDbPrepare).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*)'),
      );

      // run() should NOT have been called for inserts (only prepare for count)
      // The mock was called once for prepare(COUNT query).get() but run() should be 0
      expect(mockDbRun).not.toHaveBeenCalled();
    });

    it('seeds include models across Elite, Pro, Libre tiers', async () => {
      const { seedModels } = await import('../mid');
      mockDbGet.mockReturnValue({ c: 0 });

      seedModels();

      // Check that run was called with different tier values
      const allRunArgs = mockDbRun.mock.calls;
      const allArgsFlat = allRunArgs.map(args => args.join('|'));
      const hasElite = allArgsFlat.some(a => a.includes('Elite'));
      const hasPro = allArgsFlat.some(a => a.includes('Pro'));
      const hasLibre = allArgsFlat.some(a => a.includes('Libre'));

      expect(hasElite).toBe(true);
      expect(hasPro).toBe(true);
      expect(hasLibre).toBe(true);
    });
  });

  describe('MID-04: Markdown export', () => {
    it('midToMarkdown() returns tier-grouped markdown string', async () => {
      const { midToMarkdown } = await import('../mid');
      mockDbAll.mockReturnValue([
        makeMidRow({ tier: 'Elite', display_name: 'Claude Opus 4', provider: 'anthropic', status: 'active' }),
        makeMidRow({ tier: 'Pro', display_name: 'GPT-4o', provider: 'openai', model_key: 'openai/gpt-4o', status: 'active' }),
        makeMidRow({ tier: 'Libre', display_name: 'Llama 3', provider: 'ollama', model_key: 'ollama/llama3:8b', status: 'active' }),
      ]);

      const md = midToMarkdown();

      expect(typeof md).toBe('string');
      expect(md).toContain('Elite');
      expect(md).toContain('Pro');
      expect(md).toContain('Libre');
      expect(md).toContain('Claude Opus 4');
      expect(md).toContain('GPT-4o');
      expect(md).toContain('Llama 3');
    });

    it('midToMarkdown() excludes retired models', async () => {
      const { midToMarkdown } = await import('../mid');
      mockDbAll.mockReturnValue([
        makeMidRow({ tier: 'Elite', display_name: 'Active Model', status: 'active' }),
        // retired should NOT be in the result set since query excludes them
      ]);

      const md = midToMarkdown();

      expect(md).toContain('Active Model');
      // Verify query excluded retired
      expect(mockDbPrepare).toHaveBeenCalledWith(
        expect.stringContaining('retired'),
      );
    });

    it('midToMarkdown() includes inactive models', async () => {
      const { midToMarkdown } = await import('../mid');
      mockDbAll.mockReturnValue([
        makeMidRow({ tier: 'Pro', display_name: 'Inactive Model', status: 'inactive' }),
      ]);

      const md = midToMarkdown();
      expect(md).toContain('Inactive Model');
      expect(md).toContain('INACTIVO');
    });

    it('midToMarkdown(true) produces compact output', async () => {
      const { midToMarkdown } = await import('../mid');
      mockDbAll.mockReturnValue([
        makeMidRow({ tier: 'Elite', display_name: 'Claude Opus 4' }),
      ]);

      const compact = midToMarkdown(true);
      const full = (() => {
        mockDbAll.mockReturnValue([
          makeMidRow({ tier: 'Elite', display_name: 'Claude Opus 4' }),
        ]);
        return midToMarkdown(false);
      })();

      expect(compact.length).toBeLessThan(full.length);
    });

    it('midToMarkdown() uses cache (cacheGet/cacheSet)', async () => {
      const { midToMarkdown } = await import('../mid');

      // First call: cache miss
      mockCacheGet.mockReturnValue(null);
      mockDbAll.mockReturnValue([makeMidRow()]);

      midToMarkdown();

      expect(mockCacheGet).toHaveBeenCalledWith(expect.stringContaining('mid:markdown'));
      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.stringContaining('mid:markdown'),
        expect.any(String),
        expect.any(Number),
      );
    });

    it('midToMarkdown() returns cached result when available', async () => {
      const { midToMarkdown } = await import('../mid');

      mockCacheGet.mockReturnValue('# Cached MID markdown');

      const md = midToMarkdown();

      expect(md).toBe('# Cached MID markdown');
      // DB should NOT have been queried for models
      expect(mockDbAll).not.toHaveBeenCalled();
    });

    it('midToMarkdown() shows scores and capabilities', async () => {
      const { midToMarkdown } = await import('../mid');
      mockDbAll.mockReturnValue([
        makeMidRow({
          capabilities: '["function_calling","vision"]',
          scores: '{"reasoning":10,"coding":9}',
          cost_notes: '$15/$75 por 1M tokens',
        }),
      ]);

      const md = midToMarkdown();

      expect(md).toContain('function_calling');
      expect(md).toContain('reasoning');
      expect(md).toContain('$15/$75');
    });
  });

  describe('MID-07: Inactive preservation', () => {
    it('getAll() includes inactive models by default', async () => {
      const { getAll } = await import('../mid');
      mockDbAll.mockReturnValue([
        makeMidRow({ id: 'mid-001', status: 'active' }),
        makeMidRow({ id: 'mid-002', status: 'inactive' }),
      ]);

      const entries = getAll();
      expect(entries.length).toBe(2);
    });

    it('update() can change status without affecting other fields', async () => {
      const { update } = await import('../mid');

      update('mid-001', { status: 'inactive' });

      expect(mockDbPrepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE model_intelligence SET'),
      );
      // Should only set status + updated_at
      const updateQuery = mockDbPrepare.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('UPDATE'),
      );
      expect(updateQuery).toBeDefined();
      const query = updateQuery![0] as string;
      expect(query).toContain('status');
      expect(query).toContain('updated_at');
    });
  });

  describe('syncFromDiscovery', () => {
    it('creates basic entries for models not in MID', async () => {
      const { syncFromDiscovery } = await import('../mid');

      // No existing models in MID
      mockDbAll.mockReturnValue([]);

      const inventory = {
        models: [
          makeDiscoveredModel({ id: 'ollama/newmodel:7b', name: 'newmodel', provider: 'ollama', is_local: true }),
          makeDiscoveredModel({ id: 'openai/gpt-5', name: 'gpt-5', provider: 'openai', is_local: false }),
        ],
        providers: [],
        cached_at: '2026-01-01T00:00:00Z',
        ttl_ms: 300000,
        is_stale: false,
      };

      const result = syncFromDiscovery(inventory);

      expect(result.created).toBe(2);
      expect(result.skipped).toBe(0);
      // Should have inserted 2 models
      expect(mockDbRun).toHaveBeenCalledTimes(2);
    });

    it('skips models that already exist in MID', async () => {
      const { syncFromDiscovery } = await import('../mid');

      // One existing model in MID
      mockDbAll.mockReturnValue([{ model_key: 'ollama/newmodel:7b' }]);

      const inventory = {
        models: [
          makeDiscoveredModel({ id: 'ollama/newmodel:7b' }),
          makeDiscoveredModel({ id: 'openai/gpt-5', name: 'gpt-5', provider: 'openai', is_local: false }),
        ],
        providers: [],
        cached_at: '2026-01-01T00:00:00Z',
        ttl_ms: 300000,
        is_stale: false,
      };

      const result = syncFromDiscovery(inventory);

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it('sets auto_created flag to 1 for synced models', async () => {
      const { syncFromDiscovery } = await import('../mid');
      mockDbAll.mockReturnValue([]);

      const inventory = {
        models: [makeDiscoveredModel()],
        providers: [],
        cached_at: '2026-01-01T00:00:00Z',
        ttl_ms: 300000,
        is_stale: false,
      };

      syncFromDiscovery(inventory);

      // The INSERT should include auto_created = 1
      expect(mockDbPrepare).toHaveBeenCalledWith(
        expect.stringContaining('auto_created'),
      );
    });

    it('sets local models as Libre tier and remote as Pro', async () => {
      const { syncFromDiscovery } = await import('../mid');
      mockDbAll.mockReturnValue([]);

      const inventory = {
        models: [
          makeDiscoveredModel({ id: 'ollama/local:7b', is_local: true }),
          makeDiscoveredModel({ id: 'openai/remote', is_local: false }),
        ],
        providers: [],
        cached_at: '2026-01-01T00:00:00Z',
        ttl_ms: 300000,
        is_stale: false,
      };

      syncFromDiscovery(inventory);

      const runCalls = mockDbRun.mock.calls;
      // First model (local) should have 'Libre'
      const firstArgs = runCalls[0].join('|');
      expect(firstArgs).toContain('Libre');
      // Second model (remote) should have 'Pro'
      const secondArgs = runCalls[1].join('|');
      expect(secondArgs).toContain('Pro');
    });
  });
});
