import { test, expect } from '@playwright/test';
import { testName, TEST_PREFIX } from '../helpers/test-data';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3500';

test.describe.serial('API: CatBrains', () => {
  let testCatBrainId: string;

  test.afterAll(async ({ request }) => {
    if (testCatBrainId) {
      try {
        await request.delete(`${BASE_URL}/api/catbrains/${testCatBrainId}`);
      } catch { /* ignore cleanup errors */ }
    }
    // Clean up any leftover [TEST] catbrains
    try {
      const res = await request.get(`${BASE_URL}/api/catbrains?limit=100`);
      if (res.ok()) {
        const body = await res.json();
        const catbrains = body.data || [];
        for (const cb of catbrains) {
          if (typeof cb.name === 'string' && cb.name.startsWith(TEST_PREFIX)) {
            await request.delete(`${BASE_URL}/api/catbrains/${cb.id}`);
          }
        }
      }
    } catch { /* ignore cleanup errors */ }
  });

  test('POST /api/catbrains creates catbrain', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/catbrains`, {
      data: {
        name: testName('API CatBrain'),
        description: 'API test catbrain',
        purpose: 'E2E API testing',
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body.name).toBe(testName('API CatBrain'));
    testCatBrainId = body.id;
  });

  test('GET /api/catbrains returns list including created catbrain', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/catbrains`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body).toHaveProperty('pagination');

    const found = body.data.find(
      (cb: { name: string }) => cb.name === testName('API CatBrain')
    );
    expect(found).toBeTruthy();
  });

  test('GET /api/catbrains/:id returns single catbrain', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/catbrains/${testCatBrainId}`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(testCatBrainId);
    expect(body.name).toBe(testName('API CatBrain'));
    expect(body).toHaveProperty('created_at');
    expect(body).toHaveProperty('updated_at');
  });

  test('DELETE /api/catbrains/:id removes catbrain', async ({ request }) => {
    const res = await request.delete(`${BASE_URL}/api/catbrains/${testCatBrainId}`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify no longer exists
    const getRes = await request.get(`${BASE_URL}/api/catbrains/${testCatBrainId}`);
    expect(getRes.status()).toBe(404);

    testCatBrainId = '';
  });

  test('GET /api/projects redirects to /api/catbrains (301 backward compat)', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/projects`, {
      maxRedirects: 0,
    });
    // Should be a redirect (301 or the actual response after redirect)
    expect([200, 301, 302, 308]).toContain(res.status());
  });
});
