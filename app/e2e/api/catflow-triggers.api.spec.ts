import { test, expect } from '@playwright/test';
import { testName, TEST_PREFIX } from '../helpers/test-data';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3500';

test.describe.serial('API: CatFlow Triggers', () => {
  let sourceCanvasId: string;
  let targetCanvasId: string;
  let triggerId: string;

  test.beforeAll(async ({ request }) => {
    // Create source canvas
    const sourceRes = await request.post(`${BASE_URL}/api/canvas`, {
      data: {
        name: testName('Trigger Source'),
        description: 'Source canvas for trigger tests',
        emoji: '🔷',
        mode: 'mixed',
      },
    });
    expect(sourceRes.ok()).toBeTruthy();
    const sourceBody = await sourceRes.json();
    sourceCanvasId = sourceBody.id;

    // Create target canvas
    const targetRes = await request.post(`${BASE_URL}/api/canvas`, {
      data: {
        name: testName('Trigger Target'),
        description: 'Target canvas for trigger tests',
        emoji: '🔷',
        mode: 'mixed',
      },
    });
    expect(targetRes.ok()).toBeTruthy();
    const targetBody = await targetRes.json();
    targetCanvasId = targetBody.id;

    // Enable listen_mode on target canvas
    const patchRes = await request.patch(`${BASE_URL}/api/canvas/${targetCanvasId}`, {
      data: { listen_mode: 1 },
    });
    expect(patchRes.ok()).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    // Delete source and target canvases
    for (const id of [sourceCanvasId, targetCanvasId]) {
      if (id) {
        try {
          await request.delete(`${BASE_URL}/api/canvas/${id}`);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  });

  test('POST /api/catflow-triggers creates trigger', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/catflow-triggers`, {
      data: {
        source_canvas_id: sourceCanvasId,
        target_canvas_id: targetCanvasId,
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
    expect(body).toHaveProperty('source_canvas_id');
    expect(body).toHaveProperty('target_canvas_id');
    expect(body.id).toBe(triggerId);
    expect(body.source_canvas_id).toBe(sourceCanvasId);
    expect(body.target_canvas_id).toBe(targetCanvasId);
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
