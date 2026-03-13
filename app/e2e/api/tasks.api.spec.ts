import { test, expect } from '@playwright/test';
import { testName, TEST_PREFIX } from '../helpers/test-data';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3500';

test.describe.serial('API: Tasks', () => {
  let testTaskId: string;

  test.afterAll(async ({ request }) => {
    // Cleanup: delete the test task if it still exists
    if (testTaskId) {
      try {
        await request.delete(`${BASE_URL}/api/tasks/${testTaskId}`);
      } catch {
        // ignore cleanup errors
      }
    }
    // Also clean up any leftover [TEST] tasks
    try {
      const res = await request.get(`${BASE_URL}/api/tasks`);
      if (res.ok()) {
        const tasks = await res.json();
        const list = Array.isArray(tasks) ? tasks : [];
        for (const t of list) {
          if (typeof t.name === 'string' && t.name.startsWith(TEST_PREFIX)) {
            await request.delete(`${BASE_URL}/api/tasks/${t.id}`);
          }
        }
      }
    } catch {
      // ignore cleanup errors
    }
  });

  test('POST /api/tasks creates task', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/tasks`, {
      data: {
        name: testName('API Task'),
        description: 'API test task',
        expected_output: 'Test output',
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body.name).toBe(testName('API Task'));
    expect(body.description).toBe('API test task');
    testTaskId = body.id;
  });

  test('GET /api/tasks returns list including created task', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/tasks`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    // Tasks API returns a flat array (enriched with steps_count, agents, etc.)
    expect(Array.isArray(body)).toBe(true);

    const found = body.find(
      (t: { name: string }) => t.name === testName('API Task')
    );
    expect(found).toBeTruthy();
    expect(found).toHaveProperty('steps_count');
    expect(found).toHaveProperty('steps_completed');
    expect(found).toHaveProperty('agents');
  });

  test('GET /api/tasks/:id returns single task with steps', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/tasks/${testTaskId}`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(testTaskId);
    expect(body.name).toBe(testName('API Task'));
    expect(body).toHaveProperty('steps');
    expect(Array.isArray(body.steps)).toBe(true);
  });

  test('DELETE /api/tasks/:id removes task', async ({ request }) => {
    const res = await request.delete(`${BASE_URL}/api/tasks/${testTaskId}`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify task no longer exists
    const getRes = await request.get(`${BASE_URL}/api/tasks/${testTaskId}`);
    expect(getRes.status()).toBe(404);

    testTaskId = ''; // clear so afterAll doesn't retry
  });
});
