import { test, expect } from '@playwright/test';
import { testName, TEST_PREFIX } from '../helpers/test-data';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3500';

test.describe.serial('API: CatFlow Triggers', () => {
  let sourceTaskId: string;
  let targetTaskId: string;
  let triggerId: string;

  test.beforeAll(async ({ request }) => {
    // Create source task
    const sourceRes = await request.post(`${BASE_URL}/api/tasks`, {
      data: {
        name: testName('Trigger Source'),
        description: 'Source task for trigger tests',
        expected_output: 'Test output',
      },
    });
    expect(sourceRes.status()).toBe(201);
    const sourceBody = await sourceRes.json();
    sourceTaskId = sourceBody.id;

    // Create target task
    const targetRes = await request.post(`${BASE_URL}/api/tasks`, {
      data: {
        name: testName('Trigger Target'),
        description: 'Target task for trigger tests',
        expected_output: 'Test output',
      },
    });
    expect(targetRes.status()).toBe(201);
    const targetBody = await targetRes.json();
    targetTaskId = targetBody.id;

    // Enable listen_mode on target
    const patchRes = await request.patch(`${BASE_URL}/api/tasks/${targetTaskId}`, {
      data: { listen_mode: 1 },
    });
    expect(patchRes.ok()).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    // Delete source and target tasks
    for (const id of [sourceTaskId, targetTaskId]) {
      if (id) {
        try {
          await request.delete(`${BASE_URL}/api/tasks/${id}`);
        } catch {
          // ignore cleanup errors
        }
      }
    }
    // Clean up any leftover [TEST] tasks
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

  test('POST /api/catflow-triggers creates trigger', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/catflow-triggers`, {
      data: {
        source_task_id: sourceTaskId,
        target_task_id: targetTaskId,
        payload: 'test payload',
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body.status).toBe('running');
    triggerId = body.id;
  });

  test('GET /api/catflow-triggers/[id] returns trigger status', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/catflow-triggers/${triggerId}`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('source_task_id');
    expect(body).toHaveProperty('target_task_id');
    expect(body.id).toBe(triggerId);
    expect(body.source_task_id).toBe(sourceTaskId);
    expect(body.target_task_id).toBe(targetTaskId);
  });

  test('POST /api/catflow-triggers/[id]/complete marks trigger completed', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/catflow-triggers/${triggerId}/complete`, {
      data: { response: 'test response' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('completed');
    expect(body.response).toBe('test response');
  });
});
