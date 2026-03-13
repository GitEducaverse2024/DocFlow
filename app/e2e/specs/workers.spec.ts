import { test, expect } from '@playwright/test';
import { WorkersPOM } from '../pages/workers.pom';
import { testName, TEST_PREFIX } from '../helpers/test-data';

const WORKER_NAME = testName('Worker E2E');
const WORKER_DESC_UPDATED = 'Descripcion actualizada por E2E';

test.describe.serial('Docs Workers', () => {
  test.afterAll(async ({ request }) => {
    // Cleanup: delete any leftover [TEST] workers via API
    const res = await request.get('/api/workers');
    if (res.ok()) {
      const workers = await res.json();
      for (const worker of workers) {
        if (worker.name?.startsWith(TEST_PREFIX)) {
          await request.delete(`/api/workers/${worker.id}`);
        }
      }
    }
  });

  test('workers page loads with list', async ({ page }) => {
    const workers = new WorkersPOM(page);
    await workers.goto();

    await expect(workers.pageTitle).toBeVisible();
    // Either the table or empty state should be visible
    await expect(
      workers.workersTable.or(workers.emptyState)
    ).toBeVisible();
  });

  test('create worker', async ({ page }) => {
    const workers = new WorkersPOM(page);
    await workers.goto();

    await workers.createWorker(WORKER_NAME, { description: 'Test worker E2E' });

    // Wait for success feedback (toast) and list refresh
    await page.waitForTimeout(2000);

    // Reload and verify
    await workers.goto();
    await expect(workers.findWorker(WORKER_NAME)).toBeVisible({ timeout: 10000 });
  });

  test('edit worker', async ({ page }) => {
    const workers = new WorkersPOM(page);
    await workers.goto();

    await workers.editWorker(WORKER_NAME, { description: WORKER_DESC_UPDATED });

    // Wait for save
    await page.waitForTimeout(2000);

    // Reload and verify
    await workers.goto();
    await expect(workers.findWorker(WORKER_NAME)).toBeVisible();
  });

  test('delete worker', async ({ page }) => {
    const workers = new WorkersPOM(page);
    await workers.goto();

    await workers.deleteWorker(WORKER_NAME);

    // Wait for deletion
    await page.waitForTimeout(2000);

    // Reload and verify removal
    await workers.goto();
    await expect(workers.findWorker(WORKER_NAME)).not.toBeVisible({ timeout: 5000 });
  });
});
