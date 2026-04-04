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
    models: modelIds.map(id => ({ model_id: id, provider: 'test' })),
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
});
