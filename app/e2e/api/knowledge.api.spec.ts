import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * API E2E specs for GET /api/knowledge/[id] (KB-25).
 *
 * Discovers a real entry id from the /knowledge HTML (Phase 154 does not expose
 * a list API) and then verifies 200 shape + 404 on bogus id.
 */
const BASE_URL = process.env['BASE_URL'] || 'http://localhost:3500';

async function discoverFirstEntryId(request: APIRequestContext): Promise<string> {
  // The KB directory `.docflow-kb/resources/catpaws/` contains real entries that
  // map 1:1 to `/knowledge/<basename-without-md>` URLs. We list the dir via the
  // /knowledge HTML (with locale cookie to bypass /welcome middleware) OR pick a
  // known-stable entry id that Phase 150 always produces.
  //
  // Primary path: scrape from /knowledge HTML. Fallback: use a known catpaw id
  // that exists in the committed `.docflow-kb/resources/catpaws/` directory.
  try {
    const res = await request.get(`${BASE_URL}/knowledge`, {
      headers: { Cookie: 'docatflow_locale=es' },
      maxRedirects: 0,
    });
    if (res.status() === 200) {
      const html = await res.text();
      // The first `/knowledge/...` occurrence in HTML is a Next.js chunk path
      // like `/knowledge/page-abc123.js`; skip any match that ends in `.js`.
      const matches = [...html.matchAll(/\/knowledge\/([A-Za-z0-9_\-.]+)"/g)];
      const real = matches.find((m) => !m[1].endsWith('.js') && !m[1].includes('.'));
      if (real) return real[1];
    }
  } catch {
    // fall through to known-good fallback
  }
  // Fallback: probe a stable KB id. Phase 154-02 committed snapshot includes
  // `72ef0fe5-redactor-informe-inbound` which ships with the repo's .docflow-kb.
  // If this fallback also fails, GET /api/knowledge/<id> 200 path is broken.
  const fallbackId = '72ef0fe5-redactor-informe-inbound';
  const probe = await request.get(`${BASE_URL}/api/knowledge/${fallbackId}`);
  if (probe.status() === 200) return fallbackId;
  throw new Error(
    'Could not discover any KB entry id: /knowledge HTML scrape returned no match and ' +
    `fallback id "${fallbackId}" did not resolve (status ${probe.status()}). KB may be empty.`,
  );
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
