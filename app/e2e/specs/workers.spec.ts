import { test, expect } from '@playwright/test';

test.describe('Workers (Banner de migracion)', () => {
  test('workers page shows migration banner', async ({ page }) => {
    await page.goto('/workers');
    await page.waitForLoadState('networkidle');

    // The page should show migration info, not a table of workers
    await expect(page.getByText(/migra/i)).toBeVisible({ timeout: 10000 });
  });

  test('workers page has link to agents with processor filter', async ({ page }) => {
    await page.goto('/workers');
    await page.waitForLoadState('networkidle');

    // Should have a link to /agents?mode=processor
    const link = page.locator('a[href*="/agents"]').filter({ hasText: /agentes|procesador/i });
    await expect(link).toBeVisible();
  });

  test('workers page does NOT have create button', async ({ page }) => {
    await page.goto('/workers');
    await page.waitForLoadState('networkidle');

    // The old "Crear Worker" button should not exist
    await expect(page.getByRole('button', { name: /Crear Worker/i })).not.toBeVisible();
  });
});
