import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---- Mocks ----

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockGetAllAliases = vi.fn();
const mockUpdateAlias = vi.fn();
vi.mock('@/lib/services/alias-routing', () => ({
  getAllAliases: (...args: unknown[]) => mockGetAllAliases(...args),
  updateAlias: (...args: unknown[]) => mockUpdateAlias(...args),
}));

const mockDbGet = vi.fn();
const mockDbPrepare = vi.fn().mockImplementation(() => ({ get: (...a: unknown[]) => mockDbGet(...a) }));
vi.mock('@/lib/db', () => ({
  default: { prepare: (...args: unknown[]) => mockDbPrepare(...args) },
}));

import { GET, PATCH } from '../route';

const SEEDED = [
  { alias: 'agent-task', model_key: 'gemini-main', description: 'Agent task execution', is_active: 1, created_at: 't', updated_at: 't' },
  { alias: 'canvas-agent', model_key: 'gemini-main', description: 'Canvas agent nodes', is_active: 1, created_at: 't', updated_at: 't' },
  { alias: 'canvas-format', model_key: 'gemini-main', description: 'Canvas output/storage formatting', is_active: 1, created_at: 't', updated_at: 't' },
  { alias: 'catbot', model_key: 'gemini-main', description: 'CatBot assistant', is_active: 1, created_at: 't', updated_at: 't' },
  { alias: 'chat-rag', model_key: 'gemini-main', description: 'Chat RAG conversations', is_active: 1, created_at: 't', updated_at: 't' },
  { alias: 'embed', model_key: 'text-embedding-3-small', description: 'Embedding generation', is_active: 1, created_at: 't', updated_at: 't' },
  { alias: 'generate-content', model_key: 'gemini-main', description: 'Content generation (agents, skills, workers)', is_active: 1, created_at: 't', updated_at: 't' },
  { alias: 'process-docs', model_key: 'gemini-main', description: 'Document processing', is_active: 1, created_at: 't', updated_at: 't' },
];

function makePatchReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/alias-routing', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

function makeCapRow(overrides: Record<string, unknown> = {}) {
  return {
    supports_reasoning: 1,
    max_tokens_cap: 32000,
    ...overrides,
  };
}

describe('GET /api/alias-routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all 8 aliases with model_key + description', async () => {
    mockGetAllAliases.mockReturnValue(SEEDED);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.aliases).toHaveLength(8);
    expect(json.aliases[0]).toHaveProperty('alias');
    expect(json.aliases[0]).toHaveProperty('model_key');
    expect(json.aliases[0]).toHaveProperty('description');
  });

  it('returns 200 with { aliases: [], error } on service error', async () => {
    mockGetAllAliases.mockImplementation(() => {
      throw new Error('db failed');
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.aliases).toEqual([]);
    expect(json.error).toBe('db failed');
  });
});

describe('PATCH /api/alias-routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates alias and returns { updated: AliasRow }', async () => {
    const updated = { ...SEEDED[3], model_key: 'gpt-4o' };
    mockUpdateAlias.mockReturnValue(updated);
    const res = await PATCH(makePatchReq({ alias: 'catbot', model_key: 'gpt-4o' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.updated).toEqual(updated);
    expect(mockUpdateAlias).toHaveBeenCalledWith('catbot', 'gpt-4o');
  });

  it('returns 400 when alias is missing', async () => {
    const res = await PATCH(makePatchReq({ model_key: 'gpt-4o' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Missing alias or model_key');
  });

  it('returns 400 when model_key is missing', async () => {
    const res = await PATCH(makePatchReq({ alias: 'catbot' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Missing alias or model_key');
  });

  it('returns 400 when model_key is empty/whitespace', async () => {
    const res = await PATCH(makePatchReq({ alias: 'catbot', model_key: '   ' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Missing alias or model_key');
  });

  it('returns 400 when alias is empty/whitespace', async () => {
    const res = await PATCH(makePatchReq({ alias: '   ', model_key: 'gpt-4o' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Missing alias or model_key');
  });

  it('returns 200 with { error } when alias unknown (service throws)', async () => {
    mockUpdateAlias.mockImplementation(() => {
      throw new Error('Alias "xyz" not found');
    });
    const res = await PATCH(makePatchReq({ alias: 'xyz', model_key: 'gpt-4o' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.error).toBe('Alias "xyz" not found');
  });
});

describe('PATCH — Phase 159 fields (CFG-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default capability lookup: supports_reasoning=1, cap=32000.
    mockDbGet.mockReturnValue(makeCapRow());
  });

  it('CFG-02a — persists new fields when body contains valid reasoning config', async () => {
    const updated = {
      alias: 'catbot', model_key: 'anthropic/claude-opus-4-6',
      description: 'CatBot', is_active: 1, created_at: 't', updated_at: 't',
    };
    mockUpdateAlias.mockReturnValue(updated);
    const res = await PATCH(makePatchReq({
      alias: 'catbot',
      model_key: 'anthropic/claude-opus-4-6',
      reasoning_effort: 'high',
      max_tokens: 8000,
      thinking_budget: 4000,
    }));
    expect(res.status).toBe(200);
    expect(mockUpdateAlias).toHaveBeenCalledWith(
      'catbot',
      'anthropic/claude-opus-4-6',
      { reasoning_effort: 'high', max_tokens: 8000, thinking_budget: 4000 }
    );
  });

  it('CFG-02b — rejects invalid reasoning_effort enum', async () => {
    const res = await PATCH(makePatchReq({
      alias: 'catbot', model_key: 'opus', reasoning_effort: 'extreme',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/reasoning_effort/i);
    expect(mockUpdateAlias).not.toHaveBeenCalled();
  });

  it('CFG-02c — rejects capability conflict (reasoning on non-reasoning model)', async () => {
    mockDbGet.mockReturnValue(makeCapRow({ supports_reasoning: 0, max_tokens_cap: 8192 }));
    const res = await PATCH(makePatchReq({
      alias: 'catbot', model_key: 'ollama/gemma3:4b', reasoning_effort: 'high',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/does not support reasoning|supports_reasoning/i);
    expect(mockUpdateAlias).not.toHaveBeenCalled();
  });

  it('CFG-02d — rejects max_tokens cap exceeded', async () => {
    mockDbGet.mockReturnValue(makeCapRow({ supports_reasoning: 1, max_tokens_cap: 32000 }));
    const res = await PATCH(makePatchReq({
      alias: 'catbot', model_key: 'opus', max_tokens: 99999,
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/max_tokens.*32000|cap/i);
    expect(mockUpdateAlias).not.toHaveBeenCalled();
  });

  it('CFG-02e — rejects thinking_budget > max_tokens (same request)', async () => {
    const res = await PATCH(makePatchReq({
      alias: 'catbot', model_key: 'opus', max_tokens: 2048, thinking_budget: 4000,
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/thinking_budget.*max_tokens|exceed/i);
    expect(mockUpdateAlias).not.toHaveBeenCalled();
  });

  it('CFG-02f — rejects thinking_budget without max_tokens', async () => {
    const res = await PATCH(makePatchReq({
      alias: 'catbot', model_key: 'opus', thinking_budget: 4000,
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/thinking_budget.*requires.*max_tokens|max_tokens.*required/i);
    expect(mockUpdateAlias).not.toHaveBeenCalled();
  });

  it('CFG-02g — rejects non-integer / non-positive max_tokens', async () => {
    // Non-integer
    let res = await PATCH(makePatchReq({ alias: 'catbot', model_key: 'opus', max_tokens: 1.5 }));
    expect(res.status).toBe(400);
    // Negative
    res = await PATCH(makePatchReq({ alias: 'catbot', model_key: 'opus', max_tokens: -5 }));
    expect(res.status).toBe(400);
    // Zero
    res = await PATCH(makePatchReq({ alias: 'catbot', model_key: 'opus', max_tokens: 0 }));
    expect(res.status).toBe(400);
    // String
    res = await PATCH(makePatchReq({ alias: 'catbot', model_key: 'opus', max_tokens: 'abc' as unknown as number }));
    expect(res.status).toBe(400);
  });

  it('CFG-02h — rejects non-integer / non-positive thinking_budget', async () => {
    // Must also satisfy max_tokens present (from CFG-02f rule), so include valid max_tokens.
    let res = await PATCH(makePatchReq({ alias: 'catbot', model_key: 'opus', max_tokens: 8000, thinking_budget: 1.5 }));
    expect(res.status).toBe(400);
    res = await PATCH(makePatchReq({ alias: 'catbot', model_key: 'opus', max_tokens: 8000, thinking_budget: -1 }));
    expect(res.status).toBe(400);
    res = await PATCH(makePatchReq({ alias: 'catbot', model_key: 'opus', max_tokens: 8000, thinking_budget: 0 }));
    expect(res.status).toBe(400);
  });

  it('CFG-02i — accepts reasoning_effort="off" on non-reasoning model', async () => {
    mockDbGet.mockReturnValue(makeCapRow({ supports_reasoning: 0, max_tokens_cap: 8192 }));
    mockUpdateAlias.mockReturnValue({ alias: 'catbot', model_key: 'ollama/gemma3:4b' });
    const res = await PATCH(makePatchReq({
      alias: 'catbot', model_key: 'ollama/gemma3:4b', reasoning_effort: 'off',
    }));
    expect(res.status).toBe(200);
    expect(mockUpdateAlias).toHaveBeenCalled();
  });

  it('CFG-02j — accepts explicit null for all 3 fields (reset)', async () => {
    mockUpdateAlias.mockReturnValue({ alias: 'catbot', model_key: 'opus' });
    const res = await PATCH(makePatchReq({
      alias: 'catbot', model_key: 'opus',
      reasoning_effort: null, max_tokens: null, thinking_budget: null,
    }));
    expect(res.status).toBe(200);
    expect(mockUpdateAlias).toHaveBeenCalledWith(
      'catbot', 'opus',
      { reasoning_effort: null, max_tokens: null, thinking_budget: null }
    );
  });

  it('CFG-02k — graceful degradation when capability row missing', async () => {
    mockDbGet.mockReturnValue(undefined);
    mockUpdateAlias.mockReturnValue({ alias: 'catbot', model_key: 'unknown-model' });
    const res = await PATCH(makePatchReq({
      alias: 'catbot', model_key: 'unknown-model', reasoning_effort: 'high',
    }));
    expect(res.status).toBe(200);
    expect(mockUpdateAlias).toHaveBeenCalled();
  });

  it('CFG-02l — back-compat: legacy body without new fields calls updateAlias WITHOUT opts', async () => {
    mockUpdateAlias.mockReturnValue({ alias: 'catbot', model_key: 'gpt-4o' });
    const res = await PATCH(makePatchReq({ alias: 'catbot', model_key: 'gpt-4o' }));
    expect(res.status).toBe(200);
    // Legacy: updateAlias called with 2 args only (opts undefined).
    expect(mockUpdateAlias).toHaveBeenCalledWith('catbot', 'gpt-4o');
  });
});
