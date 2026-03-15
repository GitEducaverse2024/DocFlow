import { test, expect } from '@playwright/test';
import { CatPawsPOM } from '../pages/catpaws.pom';
import { testName, TEST_PREFIX } from '../helpers/test-data';

const CATPAW_NAME = testName('CatPaw E2E');

test.describe.serial('CatPaws (Agentes)', () => {
  test.afterAll(async ({ request }) => {
    // Cleanup: delete any leftover [TEST] cat_paws via API
    const res = await request.get('/api/cat-paws');
    if (res.ok()) {
      const paws = await res.json();
      for (const paw of paws) {
        if (paw.name?.startsWith(TEST_PREFIX)) {
          await request.delete(`/api/cat-paws/${paw.id}`);
        }
      }
    }
  });

  test('agents page loads with grid', async ({ page }) => {
    const pom = new CatPawsPOM(page);
    await pom.goto();
    await expect(pom.pageTitle).toBeVisible();
  });

  test('mode filters are visible', async ({ page }) => {
    const pom = new CatPawsPOM(page);
    await pom.goto();
    await expect(pom.filterAll).toBeVisible();
    await expect(pom.filterChat).toBeVisible();
    await expect(pom.filterProcessor).toBeVisible();
  });

  test('create catpaw via API and verify in list', async ({ page, request }) => {
    // Create via API (wizard flow is complex, test API + list visibility)
    const res = await request.post('/api/cat-paws', {
      data: {
        name: CATPAW_NAME,
        mode: 'chat',
        description: 'CatPaw de prueba E2E',
        system_prompt: 'Eres un asistente de prueba.',
      },
    });
    expect(res.status()).toBe(201);

    // Verify it appears in the list page
    const pom = new CatPawsPOM(page);
    await pom.goto();
    await expect(pom.findCatPaw(CATPAW_NAME)).toBeVisible({ timeout: 10000 });
  });

  test('filter by mode shows correct results', async ({ page }) => {
    const pom = new CatPawsPOM(page);
    await pom.goto();

    // Filter by chat mode
    await pom.filterByMode('chat');
    // The test catpaw (mode:chat) should still be visible
    await expect(pom.findCatPaw(CATPAW_NAME)).toBeVisible();

    // Filter by processor mode — test catpaw should disappear
    await pom.filterByMode('processor');
    await expect(pom.findCatPaw(CATPAW_NAME)).not.toBeVisible({ timeout: 3000 });

    // Back to all
    await pom.filterByMode('all');
    await expect(pom.findCatPaw(CATPAW_NAME)).toBeVisible();
  });

  test('search filters by name', async ({ page }) => {
    const pom = new CatPawsPOM(page);
    await pom.goto();

    await pom.searchByName('E2E');
    await expect(pom.findCatPaw(CATPAW_NAME)).toBeVisible();

    await pom.searchByName('xyznonexistent');
    await expect(pom.findCatPaw(CATPAW_NAME)).not.toBeVisible({ timeout: 3000 });
  });

  test('delete catpaw via API', async ({ request }) => {
    // Get the test catpaw
    const listRes = await request.get('/api/cat-paws');
    const paws = await listRes.json();
    const testPaw = paws.find((p: { name: string }) => p.name === CATPAW_NAME);
    expect(testPaw).toBeTruthy();

    // Delete
    const delRes = await request.delete(`/api/cat-paws/${testPaw.id}`);
    expect(delRes.status()).toBe(200);

    // Verify gone
    const getRes = await request.get(`/api/cat-paws/${testPaw.id}`);
    expect(getRes.status()).toBe(404);
  });
});
