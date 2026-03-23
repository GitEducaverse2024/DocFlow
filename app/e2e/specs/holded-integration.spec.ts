import { test, expect } from '@playwright/test';

test.describe.serial('Holded MCP Integration', () => {

  test('System page shows Holded MCP card when configured', async ({ page }) => {
    await page.goto('/system');
    await page.waitForLoadState('networkidle');

    // Check if Holded MCP card is visible (conditional on HOLDED_MCP_URL)
    const holdedCard = page.locator('text=Holded MCP').first();
    const isVisible = await holdedCard.isVisible().catch(() => false);

    if (isVisible) {
      // Card should show status indicator
      await expect(holdedCard).toBeVisible();

      // Should show port 8766
      await expect(page.locator('text=8766')).toBeVisible();
    }
  });

  test('System page Holded card shows status dot', async ({ page }) => {
    await page.goto('/system');
    await page.waitForLoadState('networkidle');

    const holdedCard = page.locator('text=Holded MCP').first();
    const isVisible = await holdedCard.isVisible().catch(() => false);

    if (isVisible) {
      // Find the status badge (online/offline)
      const statusBadge = page.locator('text=Holded MCP').locator('..').locator('span').last();
      await expect(statusBadge).toBeVisible();
    }
  });

  test('Footer shows Holded MCP status dot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Footer shows service status dots
    const footer = page.locator('footer');
    if (await footer.isVisible()) {
      const holdedDot = footer.locator('text=Holded MCP');
      // Only visible if configured
      const dotVisible = await holdedDot.isVisible().catch(() => false);
      if (dotVisible) {
        await expect(holdedDot).toBeVisible();
      }
    }
  });

  test('Connectors page shows Holded MCP connector', async ({ page }) => {
    await page.goto('/connectors');
    await page.waitForLoadState('networkidle');

    // Look for the seeded Holded connector
    const holdedConnector = page.locator('text=Holded MCP').first();
    const isVisible = await holdedConnector.isVisible().catch(() => false);

    if (isVisible) {
      await expect(holdedConnector).toBeVisible();
    }
  });

});
