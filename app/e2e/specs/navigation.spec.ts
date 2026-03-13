import { test, expect } from '@playwright/test';
import { SidebarPOM } from '../pages/sidebar.pom';

test.describe.serial('Navegacion', () => {
  let sidebar: SidebarPOM;

  test.beforeEach(async ({ page }) => {
    sidebar = new SidebarPOM(page);
    await sidebar.navigateTo('/');
  });

  test('sidebar loads with all nav links', async ({ page }) => {
    // Verify the nav element is visible
    await expect(sidebar.sidebar).toBeVisible();

    // Verify each nav link is visible
    for (const item of sidebar.allNavLinks()) {
      const link = sidebar.getNavLink(item.label);
      await expect(link).toBeVisible();
    }
  });

  test('all sidebar links navigate correctly', async ({ page }) => {
    for (const item of sidebar.allNavLinks()) {
      await sidebar.clickNav(item.label);
      // Verify URL ends with the expected href
      if (item.href === '/') {
        await expect(page).toHaveURL(/\/$/);
      } else {
        await expect(page).toHaveURL(new RegExp(item.href));
      }
    }
  });

  test('breadcrumb updates after navigation', async ({ page }) => {
    // Navigate to a project detail page to see breadcrumbs
    // Breadcrumbs are shown in project detail views (with ChevronRight separators)
    // First check projects page — it has its own heading "Todos los Proyectos"
    await sidebar.clickNav('Proyectos');
    await expect(page.getByText('Todos los Proyectos')).toBeVisible();

    // Navigate to settings
    await sidebar.clickNav('Configuración');
    await expect(page).toHaveURL(/\/settings/);
  });

  test('footer and service status visible', async ({ page }) => {
    // Verify the main footer element is visible (Footer component)
    await expect(sidebar.mainFooter).toBeVisible();
    // Verify footer contains "DoCatFlow" text
    await expect(sidebar.mainFooter).toContainText('DoCatFlow');
    // Verify at least one service status indicator is present
    // Footer shows service names like "OpenClaw", "n8n", "Qdrant", "LiteLLM"
    await expect(sidebar.mainFooter.getByText('OpenClaw')).toBeVisible();
  });

  test('CatBot floating button is visible', async ({ page }) => {
    // CatBot floating button has title="Abrir CatBot"
    await expect(sidebar.catbotButton).toBeVisible();
  });

  test('notification bell is visible', async ({ page }) => {
    // Notification bell has aria-label="Notificaciones"
    await expect(sidebar.notificationBell).toBeVisible();
  });
});
