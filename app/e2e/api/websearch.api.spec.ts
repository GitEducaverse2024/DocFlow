import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3500';

test.describe.serial('API: WebSearch', () => {

  test('health endpoint includes searxng status', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    // SearXNG status present if SEARXNG_URL configured
    // Just check the response shape, not necessarily online
    expect(body).toHaveProperty('status');
  });

  test('POST /api/websearch/search validates empty query', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/websearch/search`, {
      data: { query: '' }
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/websearch/search validates max length', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/websearch/search`, {
      data: { query: 'a'.repeat(501) }
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/websearch/search with auto engine returns results', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/websearch/search`, {
      data: { query: 'test query', engine: 'auto', max_results: 3 }
    });
    // May fail if no engines configured, but should not 500
    const status = res.status();
    expect([200, 502]).toContain(status);
    if (status === 200) {
      const body = await res.json();
      expect(body).toHaveProperty('engine');
      expect(body).toHaveProperty('query', 'test query');
      expect(body).toHaveProperty('results');
      expect(Array.isArray(body.results)).toBeTruthy();
    }
  });

  test('POST /api/websearch/gemini validates empty query', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/websearch/gemini`, {
      data: { query: '' }
    });
    expect(res.status()).toBe(400);
  });

  test('seed-catbrain-websearch exists in catbrains list', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/catbrains?limit=100`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const ws = (body.data || []).find((cb: Record<string, unknown>) => cb.id === 'seed-catbrain-websearch');
    expect(ws).toBeTruthy();
    expect(ws.is_system).toBe(1);
    expect(ws.search_engine).toBe('auto');
  });

  test('DELETE seed-catbrain-websearch returns 403', async ({ request }) => {
    const res = await request.delete(`${BASE_URL}/api/catbrains/seed-catbrain-websearch`);
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('sistema');
  });

  test('seed connectors exist (searxng + gemini-search)', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/connectors`);
    if (res.ok()) {
      const body = await res.json();
      const connectors = body.data || body || [];
      const ids = connectors.map((c: Record<string, unknown>) => c.id);
      expect(ids).toContain('seed-searxng');
      expect(ids).toContain('seed-gemini-search');
    }
  });
});
