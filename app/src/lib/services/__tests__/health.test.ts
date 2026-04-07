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
  cacheInvalidate: vi.fn(),
}));

const mockGetInventory = vi.fn();
vi.mock('@/lib/services/discovery', () => ({
  getInventory: (...args: unknown[]) => mockGetInventory(...args),
}));

const mockGetAllAliases = vi.fn();
const mockResolveAlias = vi.fn();
vi.mock('@/lib/services/alias-routing', () => ({
  getAllAliases: (...args: unknown[]) => mockGetAllAliases(...args),
  resolveAlias: (...args: unknown[]) => mockResolveAlias(...args),
}));

// ---- Fixtures ----

const fakeInventory = {
  models: [],
  providers: [
    { provider: 'ollama', status: 'connected', latency_ms: 15, error: null, model_count: 3 },
    { provider: 'openai', status: 'disconnected', latency_ms: null, error: 'timeout', model_count: 0 },
    { provider: 'litellm', status: 'no_key', latency_ms: null, error: 'no api key', model_count: 0 },
  ],
  cached_at: '2026-04-07T10:00:00.000Z',
  ttl_ms: 300000,
  is_stale: false,
};

const fakeAliases = [
  { alias: 'chat-rag', model_key: 'gemini-main', description: 'Chat', is_active: 1, created_at: '', updated_at: '' },
  { alias: 'catbot', model_key: 'gemini-main', description: 'CatBot', is_active: 1, created_at: '', updated_at: '' },
];

// ---- Tests ----

import { checkHealth } from '@/lib/services/health';

describe('checkHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheGet.mockReturnValue(null);
    mockGetInventory.mockResolvedValue(fakeInventory);
    mockGetAllAliases.mockReturnValue(fakeAliases);
    mockResolveAlias.mockImplementation(async (alias: string) => {
      if (alias === 'chat-rag') return 'gemini-main';
      if (alias === 'catbot') return 'gemini-main';
      return 'unknown';
    });
  });

  it('returns providers array with status, latency_ms, model_count', async () => {
    const result = await checkHealth();
    expect(result.providers).toHaveLength(3);

    const ollama = result.providers.find(p => p.provider === 'ollama');
    expect(ollama).toMatchObject({
      provider: 'ollama',
      status: 'connected',
      latency_ms: 15,
      model_count: 3,
    });

    // disconnected and no_key should map to 'error'
    const openai = result.providers.find(p => p.provider === 'openai');
    expect(openai).toMatchObject({ status: 'error', error: 'timeout' });

    const litellm = result.providers.find(p => p.provider === 'litellm');
    expect(litellm).toMatchObject({ status: 'error', error: 'no api key' });
  });

  it('returns aliases with resolution_status direct/fallback', async () => {
    // chat-rag resolves to same model (direct), catbot resolves to different (fallback)
    mockResolveAlias.mockImplementation(async (alias: string) => {
      if (alias === 'chat-rag') return 'gemini-main'; // same as configured -> direct
      if (alias === 'catbot') return 'gpt-4o'; // different -> fallback
      return 'unknown';
    });

    const result = await checkHealth();
    expect(result.aliases).toHaveLength(2);

    const chatRag = result.aliases.find(a => a.alias === 'chat-rag');
    expect(chatRag).toMatchObject({
      alias: 'chat-rag',
      configured_model: 'gemini-main',
      resolved_model: 'gemini-main',
      resolution_status: 'direct',
      error: null,
    });

    const catbot = result.aliases.find(a => a.alias === 'catbot');
    expect(catbot).toMatchObject({
      alias: 'catbot',
      configured_model: 'gemini-main',
      resolved_model: 'gpt-4o',
      resolution_status: 'fallback',
      error: null,
    });
  });

  it('includes checked_at ISO timestamp', async () => {
    const result = await checkHealth();
    expect(result.checked_at).toBeDefined();
    // Should be a valid ISO timestamp
    expect(new Date(result.checked_at).toISOString()).toBe(result.checked_at);
  });

  it('returns cached result within 30s TTL without re-executing resolveAlias', async () => {
    const cachedResult = {
      providers: [],
      aliases: [],
      checked_at: '2026-04-07T10:00:00.000Z',
      cached: true,
    };
    mockCacheGet.mockReturnValue(cachedResult);

    const result = await checkHealth();
    expect(result.cached).toBe(true);
    expect(result).toEqual(cachedResult);
    expect(mockResolveAlias).not.toHaveBeenCalled();
    expect(mockGetInventory).not.toHaveBeenCalled();
  });

  it('force:true bypasses cache and re-executes', async () => {
    const cachedResult = {
      providers: [],
      aliases: [],
      checked_at: '2026-04-07T09:00:00.000Z',
      cached: true,
    };
    mockCacheGet.mockReturnValue(cachedResult);

    const result = await checkHealth({ force: true });
    expect(result.cached).toBe(false);
    expect(mockGetInventory).toHaveBeenCalledWith(true);
    expect(mockResolveAlias).toHaveBeenCalled();
  });

  it('catches resolveAlias errors gracefully without crashing', async () => {
    mockResolveAlias.mockImplementation(async (alias: string) => {
      if (alias === 'chat-rag') return 'gemini-main';
      if (alias === 'catbot') throw new Error('No model available for alias "catbot"');
      return 'unknown';
    });

    const result = await checkHealth();
    expect(result.aliases).toHaveLength(2);

    const catbot = result.aliases.find(a => a.alias === 'catbot');
    expect(catbot).toMatchObject({
      alias: 'catbot',
      resolution_status: 'error',
      resolved_model: null,
      error: 'No model available for alias "catbot"',
    });

    // The other alias should still resolve fine
    const chatRag = result.aliases.find(a => a.alias === 'chat-rag');
    expect(chatRag?.resolution_status).toBe('direct');
  });
});
