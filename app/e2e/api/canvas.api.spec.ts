import { test, expect } from '@playwright/test';
import { testName, TEST_PREFIX } from '../helpers/test-data';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3500';

test.describe.serial('API: Canvas', () => {
  let testCanvasId: string;

  test.afterAll(async ({ request }) => {
    // Cleanup: delete the test canvas if it still exists
    if (testCanvasId) {
      try {
        await request.delete(`${BASE_URL}/api/canvas/${testCanvasId}`);
      } catch {
        // ignore cleanup errors
      }
    }
    // Also clean up any leftover [TEST] canvases
    try {
      const res = await request.get(`${BASE_URL}/api/canvas`);
      if (res.ok()) {
        const canvases = await res.json();
        const list = Array.isArray(canvases) ? canvases : [];
        for (const c of list) {
          if (typeof c.name === 'string' && c.name.startsWith(TEST_PREFIX)) {
            await request.delete(`${BASE_URL}/api/canvas/${c.id}`);
          }
        }
      }
    } catch {
      // ignore cleanup errors
    }
  });

  test('POST /api/canvas creates canvas', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/canvas`, {
      data: {
        name: testName('API Canvas'),
        description: 'API test canvas',
        mode: 'mixed',
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('redirectUrl');
    expect(body.redirectUrl).toContain('/canvas/');
    testCanvasId = body.id;
  });

  test('GET /api/canvas returns list including created canvas', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/canvas`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    // Canvas API returns a flat array
    expect(Array.isArray(body)).toBe(true);

    const found = body.find(
      (c: { name: string }) => c.name === testName('API Canvas')
    );
    expect(found).toBeTruthy();
    expect(found).toHaveProperty('mode');
    expect(found).toHaveProperty('status');
    expect(found).toHaveProperty('node_count');
  });

  test('GET /api/canvas/:id returns single canvas', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/canvas/${testCanvasId}`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(testCanvasId);
    expect(body.name).toBe(testName('API Canvas'));
    expect(body).toHaveProperty('flow_data');
    expect(body).toHaveProperty('created_at');
    expect(body).toHaveProperty('updated_at');
  });

  test('DELETE /api/canvas/:id removes canvas', async ({ request }) => {
    const res = await request.delete(`${BASE_URL}/api/canvas/${testCanvasId}`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify canvas no longer exists
    const getRes = await request.get(`${BASE_URL}/api/canvas/${testCanvasId}`);
    expect(getRes.status()).toBe(404);

    testCanvasId = ''; // clear so afterAll doesn't retry
  });
});
