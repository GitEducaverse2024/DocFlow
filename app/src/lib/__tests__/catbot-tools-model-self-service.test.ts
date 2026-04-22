import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Phase 160 Wave 0 — TOOL-01/02/03 failing tests for CatBot self-service
// over the LLM stack (list_llm_models, get_catbot_llm, set_catbot_llm) plus
// getToolsForLLM visibility gate for set_catbot_llm (manage_models).
//
// Mirrors the mocking strategy from catbot-tools-user-patterns.test.ts so
// executeTool / getToolsForLLM can load without heavy transitive deps.
// ---------------------------------------------------------------------------

vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  const tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'catbot-model-tools-test-'));
  process['env']['CATBOT_DB_PATH'] = nodePath.join(tmpDir, 'catbot-test.db');
  process['env']['DATABASE_PATH'] = nodePath.join(tmpDir, 'docflow-test.db');
});

// ---- Shared fixtures ----

type MockModelRow = {
  model_key: string;
  display_name: string;
  provider: string;
  tier: string;
  cost_tier: string;
  supports_reasoning: number;
  max_tokens_cap: number;
  is_local: number;
  status: string;
};

const mockModelIntelligenceRows: MockModelRow[] = [
  {
    model_key: 'anthropic/claude-opus-4-6',
    display_name: 'Claude Opus 4.6',
    provider: 'anthropic',
    tier: 'Elite',
    cost_tier: 'premium',
    supports_reasoning: 1,
    max_tokens_cap: 32000,
    is_local: 0,
    status: 'active',
  },
  {
    model_key: 'ollama/gemma3:12b',
    display_name: 'Gemma 3 12B',
    provider: 'ollama',
    tier: 'Libre',
    cost_tier: 'free',
    supports_reasoning: 0,
    max_tokens_cap: 8192,
    is_local: 1,
    status: 'active',
  },
];

// ---- Mocks (resolved BEFORE import of catbot-tools) ----

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/db', () => {
  const makeStmt = (query: string) => {
    const isModelIntelligence = typeof query === 'string' && query.toLowerCase().includes('model_intelligence');
    return {
      all: vi.fn(() => (isModelIntelligence ? mockModelIntelligenceRows : [])),
      get: vi.fn((key?: string) => {
        if (isModelIntelligence && key) {
          return mockModelIntelligenceRows.find((r) => r.model_key === key);
        }
        return undefined;
      }),
      run: vi.fn(() => ({ changes: 1 })),
    };
  };
  return {
    default: { prepare: vi.fn(makeStmt) },
  };
});

vi.mock('@/lib/services/alias-routing', () => ({
  resolveAlias: vi.fn(async () => 'anthropic/claude-opus-4-6'),
  resolveAliasConfig: vi.fn(async () => ({
    model: 'anthropic/claude-opus-4-6',
    reasoning_effort: 'high',
    max_tokens: 16000,
    thinking_budget: 4096,
  })),
  getAllAliases: vi.fn(() => []),
  updateAlias: vi.fn(),
}));

vi.mock('@/lib/services/discovery', () => ({
  getInventory: vi.fn(async () => ({
    models: [
      { id: 'anthropic/claude-opus-4-6', name: 'opus', provider: 'anthropic', is_local: false },
      { id: 'ollama/gemma3:12b', name: 'gemma', provider: 'ollama', is_local: true },
    ],
    providers: [],
    cached_at: new Date().toISOString(),
    ttl_ms: 60000,
    is_stale: false,
  })),
}));

vi.mock('@/lib/services/mid', () => ({
  getAll: vi.fn(() => []),
  update: vi.fn(),
  midToMarkdown: vi.fn(() => ''),
}));

vi.mock('@/lib/services/health', () => ({ checkHealth: vi.fn() }));

vi.mock('@/lib/services/catbot-holded-tools', () => ({
  getHoldedTools: vi.fn(() => []),
  isHoldedTool: vi.fn(() => false),
}));

vi.mock('@/lib/services/template-renderer', () => ({ renderTemplate: vi.fn() }));
vi.mock('@/lib/services/template-asset-resolver', () => ({ resolveAssetsForEmail: vi.fn() }));
vi.mock('@/lib/services/catbot-learned', () => ({
  saveLearnedEntryWithStaging: vi.fn(() => ({ id: 'x' })),
  promoteIfReady: vi.fn(() => false),
}));

// global.fetch mock — captured per-test via fetchMock.
const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

// ---- Module handles (loaded after mocks) ----

type ToolsModule = typeof import('@/lib/services/catbot-tools');
let executeTool: ToolsModule['executeTool'];
let getToolsForLLM: ToolsModule['getToolsForLLM'];

beforeAll(async () => {
  const tools = await import('@/lib/services/catbot-tools');
  executeTool = tools.executeTool;
  getToolsForLLM = tools.getToolsForLLM;
});

beforeEach(() => {
  fetchMock.mockReset();
});

// ---------------------------------------------------------------------------
// TOOL-01: list_llm_models — enumerate active models with capabilities/filters
// ---------------------------------------------------------------------------

describe('TOOL-01: list_llm_models', () => {
  it('returns all active models with capabilities + availability', async () => {
    const r = await executeTool('list_llm_models', {}, 'http://localhost:3000');
    expect(r.name).toBe('list_llm_models');
    const result = r.result as {
      count: number;
      models: Array<{
        model_key: string;
        supports_reasoning: boolean | null;
        max_tokens_cap: number | null;
        tier: string | null;
        is_local: boolean | null;
      }>;
    };
    expect(result.count).toBe(2);
    expect(result.models.find((m) => m.model_key === 'anthropic/claude-opus-4-6')?.supports_reasoning).toBe(true);
    expect(result.models.find((m) => m.model_key === 'ollama/gemma3:12b')?.supports_reasoning).toBe(false);
  });

  it('filters by tier', async () => {
    const r = await executeTool('list_llm_models', { tier: 'Elite' }, 'http://localhost:3000');
    const result = r.result as { count: number; models: Array<{ tier: string }> };
    expect(result.count).toBe(1);
    expect(result.models[0]?.tier).toBe('Elite');
  });

  it('filters by reasoning', async () => {
    const r = await executeTool('list_llm_models', { reasoning: true }, 'http://localhost:3000');
    const result = r.result as {
      count: number;
      models: Array<{ supports_reasoning: boolean | null }>;
    };
    expect(result.count).toBe(1);
    expect(result.models[0]?.supports_reasoning).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TOOL-02: get_catbot_llm — current catbot alias config + capabilities
// ---------------------------------------------------------------------------

describe('TOOL-02: get_catbot_llm', () => {
  it('returns current catbot alias config + capabilities', async () => {
    const r = await executeTool('get_catbot_llm', {}, 'http://localhost:3000');
    expect(r.name).toBe('get_catbot_llm');
    const result = r.result as {
      alias: string;
      model: string;
      reasoning_effort: string | null;
      max_tokens: number | null;
      thinking_budget: number | null;
      capabilities: { supports_reasoning: boolean; max_tokens_cap: number } | null;
    };
    expect(result.alias).toBe('catbot');
    expect(result.model).toBe('anthropic/claude-opus-4-6');
    expect(result.reasoning_effort).toBe('high');
    expect(result.capabilities?.supports_reasoning).toBe(true);
    expect(result.capabilities?.max_tokens_cap).toBe(32000);
  });
});

// ---------------------------------------------------------------------------
// TOOL-03: set_catbot_llm — PATCH delegation + 400 passthrough
// ---------------------------------------------------------------------------

describe('TOOL-03: set_catbot_llm', () => {
  it('delegates to PATCH /api/alias-routing with extended body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        updated: { alias: 'catbot', model_key: 'anthropic/claude-opus-4-6' },
      }),
    });

    await executeTool(
      'set_catbot_llm',
      {
        model: 'anthropic/claude-opus-4-6',
        reasoning_effort: 'high',
        max_tokens: 16000,
      },
      'http://localhost:3000',
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/alias-routing');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.alias).toBe('catbot');
    expect(body.model_key).toBe('anthropic/claude-opus-4-6');
    expect(body.reasoning_effort).toBe('high');
    expect(body.max_tokens).toBe(16000);
    // thinking_budget NOT provided by caller -> hasOwnProperty gate must not
    // inject it into the outgoing body (extended PATCH semantics).
    expect(Object.prototype.hasOwnProperty.call(body, 'thinking_budget')).toBe(false);
  });

  it('surfaces 400 errors from PATCH validator verbatim', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Model X does not support reasoning' }),
    });

    const r = await executeTool(
      'set_catbot_llm',
      {
        model: 'ollama/gemma3:12b',
        reasoning_effort: 'high',
      },
      'http://localhost:3000',
    );
    const result = r.result as { error?: string; status?: number };
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('does not support reasoning');
    expect(result.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// getToolsForLLM visibility — always-allowed reads + manage_models gate on write
// ---------------------------------------------------------------------------

describe('getToolsForLLM visibility', () => {
  it('list_llm_models + get_catbot_llm always visible (read pattern)', () => {
    const tools = getToolsForLLM(['some_unrelated_action']);
    const names = tools.map((t) => t.function.name);
    expect(names).toContain('list_llm_models');
    expect(names).toContain('get_catbot_llm');
  });

  it('set_catbot_llm hidden without manage_models + allowedActions non-empty', () => {
    const tools = getToolsForLLM(['some_other_action']);
    const names = tools.map((t) => t.function.name);
    expect(names).not.toContain('set_catbot_llm');
  });

  it('set_catbot_llm visible with manage_models', () => {
    const tools = getToolsForLLM(['manage_models']);
    const names = tools.map((t) => t.function.name);
    expect(names).toContain('set_catbot_llm');
  });

  it('set_catbot_llm visible when allowedActions empty (default)', () => {
    const tools = getToolsForLLM([]);
    const names = tools.map((t) => t.function.name);
    expect(names).toContain('set_catbot_llm');
  });
});
