import { test, expect } from '@playwright/test';
import { testName, TEST_PREFIX } from '../helpers/test-data';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3500';

test.describe.serial('API: CatPaws', () => {
  let testPawId: string;

  test.afterAll(async ({ request }) => {
    // Clean up any leftover [TEST] cat_paws
    try {
      const res = await request.get(`${BASE_URL}/api/cat-paws`);
      if (res.ok()) {
        const paws = await res.json();
        for (const p of paws) {
          if (typeof p.name === 'string' && p.name.startsWith(TEST_PREFIX)) {
            await request.delete(`${BASE_URL}/api/cat-paws/${p.id}`);
          }
        }
      }
    } catch { /* ignore */ }
  });

  // --- CRUD ---

  test('POST /api/cat-paws creates a CatPaw', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/cat-paws`, {
      data: {
        name: testName('API CatPaw'),
        mode: 'chat',
        description: 'API test catpaw',
        system_prompt: 'Eres un asistente de prueba.',
        tone: 'profesional',
        temperature: 0.5,
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body.name).toBe(testName('API CatPaw'));
    expect(body.mode).toBe('chat');
    expect(body.tone).toBe('profesional');
    testPawId = body.id;
  });

  test('GET /api/cat-paws returns list with counts', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/cat-paws`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);

    const found = body.find(
      (p: { name: string }) => p.name === testName('API CatPaw')
    );
    expect(found).toBeTruthy();
    expect(found).toHaveProperty('skills_count');
    expect(found).toHaveProperty('catbrains_count');
    expect(found).toHaveProperty('connectors_count');
  });

  test('GET /api/cat-paws?mode=chat filters by mode', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/cat-paws?mode=chat`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    // All returned items should be mode chat
    for (const p of body) {
      expect(p.mode).toBe('chat');
    }
  });

  test('GET /api/cat-paws/:id returns full CatPaw', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/cat-paws/${testPawId}`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(testPawId);
    expect(body.name).toBe(testName('API CatPaw'));
    expect(body).toHaveProperty('skills');
    expect(body).toHaveProperty('catbrains');
    expect(body).toHaveProperty('connectors');
  });

  test('PATCH /api/cat-paws/:id updates fields', async ({ request }) => {
    const res = await request.patch(`${BASE_URL}/api/cat-paws/${testPawId}`, {
      data: {
        description: 'Descripcion actualizada E2E',
        temperature: 0.8,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.description).toBe('Descripcion actualizada E2E');
    expect(body.temperature).toBe(0.8);
  });

  test('GET /api/cat-paws/:id returns 404 for non-existent', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/cat-paws/non-existent-id`);
    expect(res.status()).toBe(404);
  });

  // --- Backward compat redirects ---

  test('GET /api/agents redirects to /api/cat-paws', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/agents`, {
      maxRedirects: 0,
    });
    expect([200, 301, 302, 308]).toContain(res.status());
  });

  test('GET /api/workers redirects to /api/cat-paws', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/workers`, {
      maxRedirects: 0,
    });
    expect([200, 301, 302, 308]).toContain(res.status());
  });

  // --- Cleanup ---

  test('DELETE /api/cat-paws/:id removes CatPaw', async ({ request }) => {
    const res = await request.delete(`${BASE_URL}/api/cat-paws/${testPawId}`);

    expect(res.status()).toBe(200);

    // Verify gone
    const getRes = await request.get(`${BASE_URL}/api/cat-paws/${testPawId}`);
    expect(getRes.status()).toBe(404);

    testPawId = '';
  });
});
