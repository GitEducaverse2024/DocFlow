import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----
// Note: `vi.mock` calls are hoisted to the top of the file. We use dynamic
// `await import('@/app/api/models/route')` inside each test so the mocks are
// installed before the route module is evaluated (pattern from alias-routing.test.ts).

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockGetAvailableModels = vi.fn();
vi.mock('@/lib/services/litellm', () => ({
  litellm: {
    getAvailableModels: (...args: unknown[]) => mockGetAvailableModels(...args),
  },
}));

const mockListEmbeddingModels = vi.fn();
vi.mock('@/lib/services/ollama', () => ({
  ollama: {
    listEmbeddingModels: (...args: unknown[]) => mockListEmbeddingModels(...args),
  },
}));

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

const GEMINI_MAIN_ROW = {
  model_key: 'gemini-main',
  display_name: 'Gemini Main',
  provider: 'google',
  tier: 'Elite',
  cost_tier: 'high',
  supports_reasoning: 1,
  max_tokens_cap: 32768,
  is_local: 0,
};

const GEMMA_LOCAL_ROW = {
  model_key: 'ollama/gemma3:4b',
  display_name: 'Gemma 3 4B',
  provider: 'ollama',
  tier: 'Libre',
  cost_tier: 'free',
  supports_reasoning: 0,
  max_tokens_cap: 8192,
  is_local: 1,
};

function makeReq(url = 'http://localhost/api/models') {
  return new Request(url);
}

// ---- Tests ----

describe('GET /api/models — Phase 158 enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbAll.mockReturnValue([]);
    mockGetAvailableModels.mockResolvedValue([]);
    mockListEmbeddingModels.mockResolvedValue([]);
    // Default prepare returns an object whose `all` delegates to mockDbAll; tests can
    // override `mockDbPrepare.mockImplementationOnce(...)` to simulate failure.
    mockDbPrepare.mockImplementation(() => ({
      all: (...args: unknown[]) => mockDbAll(...args),
    }));
  });

  describe('shape flat root', () => {
    it('Test 1 — model en litellm + en model_intelligence tiene campos enriched', async () => {
      mockGetAvailableModels.mockResolvedValue(['gemini-main']);
      mockDbAll.mockReturnValue([GEMINI_MAIN_ROW]);

      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq());
      const json = await res.json();

      expect(json.models).toHaveLength(1);
      expect(json.models[0]).toEqual({
        id: 'gemini-main',
        display_name: 'Gemini Main',
        provider: 'google',
        tier: 'Elite',
        cost_tier: 'high',
        supports_reasoning: true, // coerced from 1 to boolean
        max_tokens_cap: 32768,
        is_local: false, // coerced from 0 to boolean
      });
    });

    it('Test 2 — model en litellm pero NO en model_intelligence tiene campos enriched=null', async () => {
      mockGetAvailableModels.mockResolvedValue(['unknown-model']);
      mockDbAll.mockReturnValue([]); // empty model_intelligence

      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq());
      const json = await res.json();

      expect(json.models).toHaveLength(1);
      expect(json.models[0]).toEqual({
        id: 'unknown-model',
        display_name: null,
        provider: null,
        tier: null,
        cost_tier: null,
        supports_reasoning: null,
        max_tokens_cap: null,
        is_local: null,
      });
    });

    it('Test 3 — litellm vacío devuelve models=[]', async () => {
      mockGetAvailableModels.mockResolvedValue([]);
      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq());
      const json = await res.json();
      expect(json.models).toEqual([]);
    });

    it('Test 4 — todos los items del root tienen typeof id === string (nunca strings sueltos)', async () => {
      mockGetAvailableModels.mockResolvedValue(['a', 'b', 'c']);
      mockDbAll.mockReturnValue([]);
      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq());
      const json = await res.json();
      expect(json.models).toHaveLength(3);
      for (const m of json.models) {
        expect(typeof m).toBe('object');
        expect(m).not.toBeNull();
        expect(typeof m.id).toBe('string');
      }
    });

    it('Test 4b — is_local y supports_reasoning coerced a boolean (no 0/1)', async () => {
      mockGetAvailableModels.mockResolvedValue(['gemini-main', 'ollama/gemma3:4b']);
      mockDbAll.mockReturnValue([GEMINI_MAIN_ROW, GEMMA_LOCAL_ROW]);
      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq());
      const json = await res.json();
      expect(json.models[0].is_local).toBe(false);
      expect(json.models[1].is_local).toBe(true);
      expect(typeof json.models[0].supports_reasoning).toBe('boolean');
      expect(typeof json.models[1].supports_reasoning).toBe('boolean');
      expect(json.models[0].supports_reasoning).toBe(true);
      expect(json.models[1].supports_reasoning).toBe(false);
    });
  });

  describe('back-compat regression', () => {
    it('Test 5 — consumer UI pattern (m.id) extrae ids en string[] (agents/new, agents/[id], catbrains/config-panel)', async () => {
      mockGetAvailableModels.mockResolvedValue(['gemini-main', 'claude-opus', 'ollama/gemma3:4b']);
      mockDbAll.mockReturnValue([GEMINI_MAIN_ROW, GEMMA_LOCAL_ROW]);
      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq());
      const json = await res.json();

      // Simula el patrón de los 4 consumers UI Phase 158 tras update.
      const list: string[] = json.models
        .map((m: { id?: string }) => m?.id ?? '')
        .filter(Boolean);

      expect(list).toEqual(['gemini-main', 'claude-opus', 'ollama/gemma3:4b']);
      expect(list.includes('gemini-main')).toBe(true); // agents/new default model logic preserved
      expect(list[0]).toBe('gemini-main');             // list[0] fallback preserved
    });

    it('Test 6 — source-list pattern (m.id || m.model_name) sigue funcionando', async () => {
      mockGetAvailableModels.mockResolvedValue(['gemini-main']);
      mockDbAll.mockReturnValue([GEMINI_MAIN_ROW]);
      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq());
      const json = await res.json();

      const list = (json.models || [])
        .map((m: { id?: string; model_name?: string }) => m.id || m.model_name || '')
        .filter(Boolean);
      expect(list).toEqual(['gemini-main']);
    });

    it('Test 7 — rama type=embedding no afectada (sin models, sólo installed/suggestions)', async () => {
      mockListEmbeddingModels.mockResolvedValue([]);
      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq('http://localhost/api/models?type=embedding'));
      const json = await res.json();
      expect(json).toHaveProperty('installed');
      expect(json).toHaveProperty('suggestions');
      expect(json).not.toHaveProperty('models');
    });
  });

  describe('fallback degradado', () => {
    it('Test 8 — si db.prepare lanza, todos los items con enriched=null', async () => {
      mockGetAvailableModels.mockResolvedValue(['gemini-main']);
      mockDbPrepare.mockImplementationOnce(() => {
        throw new Error('no such table: model_intelligence');
      });

      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq());
      const json = await res.json();

      expect(json.models).toHaveLength(1);
      expect(json.models[0].id).toBe('gemini-main');
      expect(json.models[0].supports_reasoning).toBeNull();
      expect(json.models[0].max_tokens_cap).toBeNull();
      expect(json.models[0].is_local).toBeNull();
      expect(json.models[0].display_name).toBeNull();
      expect(json.models[0].provider).toBeNull();
      expect(json.models[0].tier).toBeNull();
      expect(json.models[0].cost_tier).toBeNull();
    });

    it('Test 9 — si litellm lanza, catch top-level devuelve payload legacy', async () => {
      mockGetAvailableModels.mockRejectedValue(new Error('LiteLLM down'));
      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq());
      const json = await res.json();
      expect(json).toEqual({ models: [], installed: [], suggestions: [] });
    });
  });
});
