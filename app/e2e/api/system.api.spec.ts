import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3500';

test.describe('API: System', () => {
  test('GET /api/health returns ok status', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health?fresh=1`);

    expect(res.status()).toBe(200);
    const body = await res.json();

    // DocFlow core status
    expect(body).toHaveProperty('docflow');
    expect(body.docflow.status).toBe('ok');
    expect(body.docflow.db).toBe('ok');
    expect(body.docflow).toHaveProperty('latency_ms');
    expect(body.docflow).toHaveProperty('projects_count');
    expect(body.docflow).toHaveProperty('sources_count');

    // External services present (may be connected or disconnected)
    expect(body).toHaveProperty('openclaw');
    expect(body).toHaveProperty('n8n');
    expect(body).toHaveProperty('qdrant');
    expect(body).toHaveProperty('litellm');
    expect(body).toHaveProperty('ollama');
  });

  test('GET /api/health has valid timestamp', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health?fresh=1`);

    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body).toHaveProperty('timestamp');
    // Verify timestamp is a valid ISO date string
    const date = new Date(body.timestamp);
    expect(date.getTime()).not.toBeNaN();
  });

  test('GET /api/health external services have expected shape', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health?fresh=1`);

    expect(res.status()).toBe(200);
    const body = await res.json();

    // Each external service should have status and url fields
    for (const service of ['openclaw', 'n8n', 'qdrant', 'litellm', 'ollama']) {
      expect(body[service]).toHaveProperty('status');
      expect(body[service]).toHaveProperty('url');
      expect(body[service]).toHaveProperty('latency_ms');
      expect(['connected', 'disconnected', 'error']).toContain(body[service].status);
    }
  });

  test('GET /api/connectors returns list', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/connectors`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    // Connectors API returns a flat array
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/dashboard/summary returns counts', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/dashboard/summary`);

    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body).toHaveProperty('projects');
    expect(body).toHaveProperty('agents');
    expect(body).toHaveProperty('tasks');
    expect(body).toHaveProperty('connectors');
    expect(body).toHaveProperty('tokens_today');
    expect(body).toHaveProperty('cost_this_month');
    expect(body).toHaveProperty('running_tasks');

    // All values should be numbers
    expect(typeof body.projects).toBe('number');
    expect(typeof body.agents).toBe('number');
    expect(typeof body.tasks).toBe('number');
  });
});
