import { test, expect } from '@playwright/test';
import { DashboardPOM } from '../pages/dashboard.pom';

test.describe('Dashboard', () => {
  let dashboard: DashboardPOM;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPOM(page);
  });

  test('dashboard loads with summary cards', async ({ page }) => {
    await dashboard.goto();
    // Verify page loaded (heading or summary cards visible)
    const heading = page.getByRole('heading', { name: 'Dashboard' });
    const welcomeScreen = page.getByText('DoCatFlow');
    // Dashboard shows either the main dashboard or the welcome screen (when no projects)
    await expect(heading.or(welcomeScreen)).toBeVisible({ timeout: 10000 });

    // If main dashboard is showing, verify summary cards
    if (await heading.isVisible()) {
      await expect(dashboard.summaryCards).toBeVisible();
      // Verify key cards are present
      await expect(dashboard.projectsCard).toBeVisible();
      await expect(dashboard.agentsCard).toBeVisible();
      await expect(dashboard.tasksCard).toBeVisible();
      await expect(dashboard.connectorsCard).toBeVisible();
    }
  });

  test('token usage chart area exists', async ({ page }) => {
    await dashboard.goto();
    const heading = page.getByRole('heading', { name: 'Dashboard' });
    // Only check chart if dashboard (not welcome screen) is showing
    if (await heading.isVisible()) {
      // Verify chart container exists (either with data or "Sin datos" message)
      const chartTitle = page.getByText('Uso de tokens');
      await expect(chartTitle).toBeVisible();
    }
  });

  test('recent activity section exists', async ({ page }) => {
    await dashboard.goto();
    const heading = page.getByRole('heading', { name: 'Dashboard' });
    if (await heading.isVisible()) {
      await expect(dashboard.recentActivity).toBeVisible();
    }
  });

  test('storage section exists', async ({ page }) => {
    await dashboard.goto();
    const heading = page.getByRole('heading', { name: 'Dashboard' });
    if (await heading.isVisible()) {
      await expect(dashboard.storageSection).toBeVisible();
    }
  });
});
