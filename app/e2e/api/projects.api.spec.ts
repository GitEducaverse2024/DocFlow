import { test, expect } from '@playwright/test';
import { testName, TEST_PREFIX } from '../helpers/test-data';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3500';

test.describe.serial('API: Projects', () => {
  let testProjectId: string;

  test.afterAll(async ({ request }) => {
    // Cleanup: delete the test project if it still exists
    if (testProjectId) {
      try {
        await request.delete(`${BASE_URL}/api/projects/${testProjectId}`);
      } catch {
        // ignore cleanup errors
      }
    }
    // Also clean up any leftover [TEST] projects
    try {
      const res = await request.get(`${BASE_URL}/api/projects?limit=100`);
      if (res.ok()) {
        const body = await res.json();
        const projects = body.data || [];
        for (const p of projects) {
          if (typeof p.name === 'string' && p.name.startsWith(TEST_PREFIX)) {
            await request.delete(`${BASE_URL}/api/projects/${p.id}`);
          }
        }
      }
    } catch {
      // ignore cleanup errors
    }
  });

  test('POST /api/projects creates project', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/projects`, {
      data: {
        name: testName('API Project'),
        description: 'API test project',
        purpose: 'E2E API testing',
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body.name).toBe(testName('API Project'));
    expect(body.purpose).toBe('E2E API testing');
    testProjectId = body.id;
  });

  test('GET /api/projects returns list including created project', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/projects`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body).toHaveProperty('pagination');
    expect(body.pagination).toHaveProperty('total');
    expect(body.pagination).toHaveProperty('page');

    const found = body.data.find(
      (p: { name: string }) => p.name === testName('API Project')
    );
    expect(found).toBeTruthy();
  });

  test('GET /api/projects/:id returns single project', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/projects/${testProjectId}`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(testProjectId);
    expect(body.name).toBe(testName('API Project'));
    expect(body.purpose).toBe('E2E API testing');
    expect(body).toHaveProperty('created_at');
    expect(body).toHaveProperty('updated_at');
  });

  test('DELETE /api/projects/:id removes project', async ({ request }) => {
    const res = await request.delete(`${BASE_URL}/api/projects/${testProjectId}`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify project no longer exists
    const getRes = await request.get(`${BASE_URL}/api/projects/${testProjectId}`);
    expect(getRes.status()).toBe(404);

    testProjectId = ''; // clear so afterAll doesn't retry
  });
});
