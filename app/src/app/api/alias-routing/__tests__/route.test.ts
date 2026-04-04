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
