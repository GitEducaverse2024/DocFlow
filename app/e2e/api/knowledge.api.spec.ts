import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * API E2E specs for GET /api/knowledge/[id] (KB-25).
 *
 * Discovers a real entry id from the /knowledge HTML (Phase 154 does not expose
 * a list API) and then verifies 200 shape + 404 on bogus id.
 */
const BASE_URL = process.env['BASE_URL'] || 'http://localhost:3500';

async function discoverFirstEntryId(request: APIRequestContext): Promise<string> {
  const res = await request.get(`${BASE_URL}/knowledge`);
  expect(res.ok()).toBe(true);
  const html = await res.text();
  const match = html.match(/\/knowledge\/([A-Za-z0-9_\-.]+)"/);
  if (!match) throw new Error('No entry link found on /knowledge page; KB may be empty');
  return match[1];
}

test.describe('API: GET /api/knowledge/[id] (KB-25)', () => {
  test('200 returns shape {id, path, frontmatter, body, related_resolved}', async ({ request }) => {
    const id = await discoverFirstEntryId(request);
    const res = await request.get(`${BASE_URL}/api/knowledge/${id}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('path');
    expect(body).toHaveProperty('frontmatter');
    expect(body).toHaveProperty('body');
    expect(body).toHaveProperty('related_resolved');
    expect(typeof body.id).toBe('string');
    expect(typeof body.path).toBe('string');
    expect(typeof body.frontmatter).toBe('object');
    expect(typeof body.body).toBe('string');
    expect(Array.isArray(body.related_resolved)).toBe(true);
  });

  test('404 on bogus id returns {error: "NOT_FOUND", id}', async ({ request }) => {
    const bogus = 'bogus-nonexistent-id-phase154';
    const res = await request.get(`${BASE_URL}/api/knowledge/${bogus}`);
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'NOT_FOUND', id: bogus });
  });

  test('shape: frontmatter has at least type + title keys (real KB entry)', async ({ request }) => {
    const id = await discoverFirstEntryId(request);
    const res = await request.get(`${BASE_URL}/api/knowledge/${id}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.frontmatter).toHaveProperty('type');
    expect(body.frontmatter).toHaveProperty('title');
  });
});
