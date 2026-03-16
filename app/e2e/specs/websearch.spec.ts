import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3500';

test.describe('WebSearch CatBrain UI', () => {

  test('WebSearch CatBrain visible in list with Sistema badge', async ({ page }) => {
    await page.goto(`${BASE_URL}/catbrains`);
    // Wait for catbrains to load
    await page.waitForSelector('text=WebSearch', { timeout: 10000 });
    // Verify Sistema badge
    const card = page.locator('text=WebSearch').first().locator('..');
    // The badge should exist somewhere near the WebSearch card
    await expect(page.getByText('Sistema').first()).toBeVisible();
  });

  test('WebSearch CatBrain detail shows engine selector', async ({ page }) => {
    await page.goto(`${BASE_URL}/catbrains/seed-catbrain-websearch`);
    await page.waitForLoadState('networkidle');
    // Should see Motor de Busqueda tab or section
    await expect(page.getByText('Motor de Busqueda').first()).toBeVisible({ timeout: 10000 });
  });

  test('Engine selector has 4 options', async ({ page }) => {
    await page.goto(`${BASE_URL}/catbrains/seed-catbrain-websearch`);
    await page.waitForLoadState('networkidle');
    // Click on Motor de Busqueda tab if it's a tab
    const tab = page.getByText('Motor de Busqueda').first();
    if (await tab.isVisible()) await tab.click();
    // Should see all 4 engines
    await expect(page.getByText('SearXNG').first()).toBeVisible();
    await expect(page.getByText('Gemini').first()).toBeVisible();
    await expect(page.getByText('Ollama').first()).toBeVisible();
    await expect(page.getByText('Auto').first()).toBeVisible();
  });

  test('Search test panel exists', async ({ page }) => {
    await page.goto(`${BASE_URL}/catbrains/seed-catbrain-websearch`);
    await page.waitForLoadState('networkidle');
    const tab = page.getByText('Motor de Busqueda').first();
    if (await tab.isVisible()) await tab.click();
    await expect(page.getByText('Probar Busqueda').first()).toBeVisible();
    // Should have search input
    await expect(page.getByPlaceholder(/buscar|consulta|query/i).first()).toBeVisible();
  });

  test('Cannot delete WebSearch CatBrain (no delete button)', async ({ page }) => {
    await page.goto(`${BASE_URL}/catbrains/seed-catbrain-websearch`);
    await page.waitForLoadState('networkidle');
    // Delete button should NOT be visible for system catbrains
    const deleteButton = page.getByRole('button', { name: /eliminar|borrar|delete/i });
    await expect(deleteButton).toHaveCount(0);
  });
});
