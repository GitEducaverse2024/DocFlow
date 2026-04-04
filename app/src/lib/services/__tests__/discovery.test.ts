import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// ---- Mocks ----

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock cache
const mockCacheGet = vi.fn().mockReturnValue(null);
const mockCacheSet = vi.fn();
const mockCacheInvalidate = vi.fn();
vi.mock('@/lib/cache', () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
  cacheInvalidate: (...args: unknown[]) => mockCacheInvalidate(...args),
}));

// Mock db
const mockDbAll = vi.fn().mockReturnValue([]);
const mockDbPrepare = vi.fn().mockReturnValue({ all: mockDbAll });
vi.mock('@/lib/db', () => ({
  default: {
    prepare: (...args: unknown[]) => mockDbPrepare(...args),
  },
}));

// Mock retry - just execute the function directly
vi.mock('@/lib/retry', () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---- Helpers ----

function ollamaTagsResponse(models: Array<{ name: string; size: number; modified_at?: string; details?: { family?: string; parameter_size?: string } }>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ models }),
  };
}

function openaiModelsResponse(modelIds: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: modelIds.map(id => ({ id })) }),
  };
}

function anthropicModelsResponse(modelIds: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: modelIds.map(id => ({ id, type: 'model' })) }),
  };
}

function googleModelsResponse(modelNames: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ models: modelNames.map(name => ({ name: `models/${name}` })) }),
  };
}

function litellmModelsResponse(modelIds: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: modelIds.map(id => ({ id })) }),
  };
}

function failResponse(status = 500) {
  return {
    ok: false,
    status,
    text: async () => 'Server error',
    json: async () => ({ error: 'fail' }),
  };
}

// ---- Tests ----

describe('DiscoveryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheGet.mockReturnValue(null);
    mockDbAll.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DISC-01: discoverOllama()', () => {
    it('returns DiscoveredModel[] with correct shape from Ollama API', async () => {
      const { discoverOllama } = await import('../discovery');

      mockFetch.mockResolvedValueOnce(ollamaTagsResponse([
        {
          name: 'llama3:8b',
          size: 4_700_000_000,
          modified_at: '2025-01-15T10:30:00Z',
          details: { family: 'llama', parameter_size: '8B' },
        },
        {
          name: 'nomic-embed-text:latest',
          size: 274_000_000,
          modified_at: '2025-01-10T08:00:00Z',
          details: { family: 'nomic-bert', parameter_size: '137M' },
        },
      ]));

      const models = await discoverOllama();

      expect(models).toHaveLength(2);

      const llama = models.find(m => m.model_id === 'llama3:8b');
      expect(llama).toBeDefined();
      expect(llama!.id).toBe('ollama/llama3:8b');
      expect(llama!.provider).toBe('ollama');
      expect(llama!.is_local).toBe(true);
      expect(llama!.size_mb).toBeGreaterThan(0);
      expect(llama!.family).toBe('llama');
      expect(llama!.parameter_size).toBe('8B');
      expect(llama!.modified_at).toBe('2025-01-15T10:30:00Z');
    });

    it('returns empty array when Ollama is down', async () => {
      const { discoverOllama } = await import('../discovery');
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const models = await discoverOllama();
      expect(models).toEqual([]);
    });
  });

  describe('DISC-02: discoverProvider()', () => {
    it('OpenAI: uses correct auth header and parses models', async () => {
      const { discoverProvider } = await import('../discovery');

      mockFetch.mockResolvedValueOnce(openaiModelsResponse([
        'gpt-4o', 'gpt-4o-mini', 'o1-preview', 'dall-e-3', 'tts-1',
      ]));

      const models = await discoverProvider('openai', 'https://api.openai.com/v1', 'sk-test');

      // Should have called fetch with correct auth
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/models'),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Authorization': 'Bearer sk-test' }),
        }),
      );

      // Should filter to chat models only
      expect(models.length).toBeGreaterThan(0);
      expect(models.every(m => m.provider === 'openai')).toBe(true);
      expect(models.every(m => m.is_local === false)).toBe(true);
    });

    it('Anthropic: uses x-api-key header', async () => {
      const { discoverProvider } = await import('../discovery');

      mockFetch.mockResolvedValueOnce(anthropicModelsResponse([
        'claude-sonnet-4-6', 'claude-opus-4-6',
      ]));

      const models = await discoverProvider('anthropic', 'https://api.anthropic.com/v1', 'sk-ant-test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/models'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'sk-ant-test',
            'anthropic-version': '2023-06-01',
          }),
        }),
      );

      expect(models.length).toBe(2);
      expect(models.every(m => m.provider === 'anthropic')).toBe(true);
    });

    it('Google: uses key in query param, NOT header', async () => {
      const { discoverProvider } = await import('../discovery');

      mockFetch.mockResolvedValueOnce(googleModelsResponse([
        'gemini-2.5-pro', 'gemini-2.5-flash', 'text-embedding-004',
      ]));

      const models = await discoverProvider('google', 'https://generativelanguage.googleapis.com/v1beta', 'goog-key-123');

      // Key should be in query param
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('key=goog-key-123');

      // Should filter to gemini models
      expect(models.length).toBe(2);
      expect(models.every(m => m.provider === 'google')).toBe(true);
    });

    it('returns empty array when provider API fails', async () => {
      const { discoverProvider } = await import('../discovery');
      mockFetch.mockResolvedValueOnce(failResponse(500));

      const models = await discoverProvider('openai', 'https://api.openai.com/v1', 'sk-bad');
      expect(models).toEqual([]);
    });
  });

  describe('DISC-03: discoverAll()', () => {
    it('queries api_keys for active providers and combines results', async () => {
      const { discoverAll } = await import('../discovery');

      mockDbAll.mockReturnValue([
        { provider: 'openai', api_key: 'sk-test', endpoint: 'https://api.openai.com/v1', is_active: 1, test_status: 'ok' },
      ]);

      // Ollama fetch
      mockFetch.mockResolvedValueOnce(ollamaTagsResponse([
        { name: 'llama3:8b', size: 4_700_000_000, details: { family: 'llama', parameter_size: '8B' } },
      ]));
      // LiteLLM fetch
      mockFetch.mockResolvedValueOnce(litellmModelsResponse(['gemini-main']));
      // OpenAI fetch
      mockFetch.mockResolvedValueOnce(openaiModelsResponse(['gpt-4o']));

      const inventory = await discoverAll();

      expect(inventory.models.length).toBeGreaterThan(0);
      expect(inventory.providers.length).toBeGreaterThan(0);
      expect(inventory.cached_at).toBeTruthy();
      expect(inventory.ttl_ms).toBe(300_000);

      // DB was queried for active providers
      expect(mockDbPrepare).toHaveBeenCalledWith(
        expect.stringContaining('api_keys'),
      );
    });
  });

  describe('DISC-04: getInventory() caching', () => {
    it('returns cached result if TTL not expired', async () => {
      const { getInventory } = await import('../discovery');

      const cachedInventory = {
        models: [],
        providers: [],
        cached_at: new Date().toISOString(),
        ttl_ms: 300_000,
        is_stale: false,
      };
      mockCacheGet.mockReturnValue(cachedInventory);

      const result = await getInventory();

      expect(result).toEqual(cachedInventory);
      // fetch should NOT have been called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('force-refresh bypasses cache', async () => {
      const { getInventory } = await import('../discovery');

      const cachedInventory = {
        models: [],
        providers: [],
        cached_at: new Date().toISOString(),
        ttl_ms: 300_000,
        is_stale: false,
      };
      mockCacheGet.mockReturnValue(cachedInventory);

      // Setup mocks for fresh discovery
      mockDbAll.mockReturnValue([]);
      mockFetch.mockResolvedValue(ollamaTagsResponse([]));

      await getInventory(true);

      // Should have fetched (at least Ollama + LiteLLM)
      expect(mockFetch).toHaveBeenCalled();
      expect(mockCacheSet).toHaveBeenCalledWith(
        'discovery:inventory',
        expect.any(Object),
        300_000,
      );
    });
  });

  describe('DISC-06: Graceful degradation', () => {
    it('one provider failing does not crash others', async () => {
      const { discoverAll } = await import('../discovery');

      // Ollama fails
      mockFetch.mockRejectedValueOnce(new Error('Ollama down'));
      // LiteLLM fails
      mockFetch.mockRejectedValueOnce(new Error('LiteLLM down'));

      mockDbAll.mockReturnValue([]);

      const inventory = await discoverAll();

      // Should not throw, should return partial results
      expect(inventory).toBeDefined();
      expect(inventory.models).toEqual([]);
      expect(inventory.providers.length).toBeGreaterThan(0);

      // Ollama provider should be disconnected
      const ollamaStatus = inventory.providers.find(p => p.provider === 'ollama');
      expect(ollamaStatus).toBeDefined();
      expect(ollamaStatus!.status).toBe('disconnected');
    });
  });

  describe('DISC-07: No hardcoded model lists', () => {
    it('discovery.ts does not contain PROVIDER_MODELS static list', () => {
      const discoverySource = fs.readFileSync(
        path.resolve(__dirname, '../discovery.ts'),
        'utf-8',
      );
      expect(discoverySource).not.toContain('PROVIDER_MODELS');
    });
  });

  describe('DISC-08: Lazy initialization', () => {
    it('no instrumentation import in discovery.ts', () => {
      const discoverySource = fs.readFileSync(
        path.resolve(__dirname, '../discovery.ts'),
        'utf-8',
      );
      expect(discoverySource).not.toContain('instrumentation');
    });

    it('module load does not trigger discovery', async () => {
      // Reset fetch mock
      mockFetch.mockClear();

      // Just importing should not trigger any fetches
      await import('../discovery');

      // No fetch calls from import alone
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('inventoryToMarkdown()', () => {
    it('produces valid markdown with provider sections', async () => {
      const { inventoryToMarkdown } = await import('../discovery');

      const inventory = {
        models: [
          {
            id: 'ollama/llama3:8b',
            name: 'llama3',
            provider: 'ollama' as const,
            model_id: 'llama3:8b',
            is_local: true,
            size_mb: 4482,
            parameter_size: '8B',
            family: 'llama',
            quantization: null,
            is_embedding: false,
            modified_at: '2025-01-15T10:30:00Z',
          },
        ],
        providers: [
          { provider: 'ollama', status: 'connected' as const, latency_ms: 45, error: null, model_count: 1 },
        ],
        cached_at: '2025-01-15T12:00:00Z',
        ttl_ms: 300_000,
        is_stale: false,
      };

      const md = inventoryToMarkdown(inventory);

      expect(typeof md).toBe('string');
      expect(md).toContain('ollama');
      expect(md).toContain('llama3');
      expect(md).toContain('connected');
    });
  });
});
