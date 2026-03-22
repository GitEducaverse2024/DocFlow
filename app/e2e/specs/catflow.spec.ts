import { test, expect } from '@playwright/test';
import { CatFlowPOM } from '../pages/catflow.pom';
import { testName, TEST_PREFIX } from '../helpers/test-data';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3500';

test.describe.serial('CatFlow E2E', () => {
  let catflow: CatFlowPOM;
  let testTaskId: string;

  test.beforeEach(async ({ page }) => {
    catflow = new CatFlowPOM(page);
  });

  test.afterAll(async ({ request }) => {
    // Clean up test task if it still exists
    if (testTaskId) {
      try {
        await request.delete(`${BASE_URL}/api/tasks/${testTaskId}`);
      } catch {
        // ignore cleanup errors
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

  test('CatFlow page loads', async () => {
    await catflow.goto();
    // Page should not show a 404 or error — heading or empty state or grid must be present
    const hasHeading = await catflow.pageHeading.isVisible().catch(() => false);
    const hasEmpty = await catflow.emptyState.isVisible().catch(() => false);
    const hasGrid = await catflow.cardGrid.isVisible().catch(() => false);
    expect(hasHeading || hasEmpty || hasGrid).toBeTruthy();
  });

  test('sidebar shows CatFlow link', async () => {
    await catflow.goto();
    await expect(catflow.sidebarLink).toBeVisible();
    const href = await catflow.sidebarLink.getAttribute('href');
    expect(href).toContain('/catflow');
  });

  test('CatFlow page shows filter buttons or empty state', async () => {
    await catflow.goto();
    const hasFilters = await catflow.filterButtons.first().isVisible().catch(() => false);
    const hasEmpty = await catflow.emptyState.isVisible().catch(() => false);
    expect(hasFilters || hasEmpty).toBeTruthy();
  });

  test('Nuevo CatFlow button navigates to wizard', async ({ page }) => {
    await catflow.goto();
    await catflow.newButton.click();
    await page.waitForURL(/\/catflow\/new/);
    expect(page.url()).toContain('/catflow/new');
  });

  test('create test CatFlow via API then verify card appears', async ({ request }) => {
    // Create a task via API
    const res = await request.post(`${BASE_URL}/api/tasks`, {
      data: {
        name: testName('CatFlow E2E'),
        description: 'E2E test catflow',
        expected_output: 'Test output',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    testTaskId = body.id;

    // Navigate to /catflow and verify the card appears
    await catflow.goto();
    const card = catflow.findCard(testName('CatFlow E2E'));
    await expect(card).toBeVisible({ timeout: 10000 });
  });

  test('toggle listen_mode via API then verify badge', async ({ request }) => {
    // Enable listen_mode on the test task
    const patchRes = await request.patch(`${BASE_URL}/api/tasks/${testTaskId}`, {
      data: { listen_mode: 1 },
    });
    expect(patchRes.ok()).toBeTruthy();

    // Navigate to /catflow and check for "En escucha" text on the page
    await catflow.goto();
    const listenBadge = catflow.page.getByText(/En escucha/i).first();
    await expect(listenBadge).toBeVisible({ timeout: 10000 });
  });

  test('canvas editor opens for CatFlow', async ({ page }) => {
    await catflow.goto();
    // Navigate to the test CatFlow's editor page
    const card = catflow.findCard(testName('CatFlow E2E'));
    await card.click();
    await page.waitForURL(/\/catflow\/.+/);
    // Verify the page loads without error (no 404, some content visible)
    await page.waitForLoadState('networkidle');
    const has404 = await page.getByText('404').isVisible().catch(() => false);
    expect(has404).toBeFalsy();
  });

  test('cleanup test CatFlow', async ({ request }) => {
    const res = await request.delete(`${BASE_URL}/api/tasks/${testTaskId}`);
    expect([200, 204]).toContain(res.status());
    testTaskId = ''; // clear so afterAll doesn't retry
  });
});
