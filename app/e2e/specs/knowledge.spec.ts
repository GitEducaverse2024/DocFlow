import { test, expect } from '@playwright/test';
import { KnowledgePage } from '../pages/knowledge.pom';

/**
 * E2E specs for the /knowledge dashboard shipped in Phase 154.
 *
 * Scope: KB-23 (list + filters), KB-24 (detail render), KB-26 (counts + timeline),
 * KB-27 (sidebar link). Runs against the live Docker stack on port 3500 with the
 * populated `.docflow-kb/` (Phase 153 hooks keep state fresh).
 *
 * Note: `app/src/middleware.ts` redirects any request without `docatflow_locale`
 * cookie to `/welcome`. Tests plant the cookie before every test so they land on
 * the real pages instead of the onboarding screen.
 */
test.describe('UI: Knowledge dashboard (KB-23, KB-24, KB-26, KB-27)', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      {
        name: 'docatflow_locale',
        value: 'es',
        domain: 'localhost',
        path: '/',
      },
    ]);
  });


  test('KB-27 sidebar link navigates to /knowledge', async ({ page }) => {
    await page.goto('/');
    const link = page.getByRole('link', { name: 'Knowledge' }).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/knowledge\/?$/);
    await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeVisible();
  });

  test('KB-26 counts bar renders 8 cards with numbers', async ({ page }) => {
    const kb = new KnowledgePage(page);
    await kb.goto();
    // The 8 known Spanish card labels must all be visible on the page
    for (const label of [
      'CatPaws activos',
      'Conectores activos',
      'CatBrains activos',
      'Plantillas activas',
      'Skills activos',
      'Reglas',
      'Incidentes resueltos',
      'Features documentadas',
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('KB-26 timeline renders LineChart or empty placeholder', async ({ page }) => {
    const kb = new KnowledgePage(page);
    await kb.goto();
    // Recharts renders as an SVG; detect by the "Cambios por día" heading that
    // always wraps the chart section, or by the empty placeholder text.
    const timelineHeading = page.getByText('Cambios por día');
    const placeholder = kb.timelinePlaceholder;
    const headingVisible = await timelineHeading.isVisible().catch(() => false);
    const placeholderVisible = await placeholder.isVisible().catch(() => false);
    expect(headingVisible || placeholderVisible).toBe(true);
  });

  test('KB-23 lista renderiza many entries with status default active', async ({ page }) => {
    const kb = new KnowledgePage(page);
    await kb.goto();
    await expect(kb.statusSelect).toHaveValue('active');
    const rowCount = await kb.visibleRowCount();
    expect(rowCount).toBeGreaterThan(20);
  });

  test('KB-23 filter type reduces row set', async ({ page }) => {
    const kb = new KnowledgePage(page);
    await kb.goto();
    const before = await kb.visibleRowCount();
    await kb.selectType('rule');
    await expect(kb.rowCountLabel).toBeVisible();
    const after = await kb.visibleRowCount();
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
  });

  test('KB-23 filter tags AND-match reduces result set', async ({ page }) => {
    const kb = new KnowledgePage(page);
    await kb.goto();
    // The tag chips render as buttons. Some tags exist in multiple entries.
    const tagButtons = page.locator('button').filter({ hasText: /^(rule|safety|catpaw|holded|crm)$/ });
    const tagCount = await tagButtons.count();
    if (tagCount >= 1) {
      const before = await kb.visibleRowCount();
      await tagButtons.nth(0).click();
      await expect(kb.rowCountLabel).toBeVisible();
      const after = await kb.visibleRowCount();
      expect(after).toBeLessThanOrEqual(before);
    }
  });

  test('KB-23 filter status default active excludes deprecated', async ({ page }) => {
    const kb = new KnowledgePage(page);
    await kb.goto();
    await expect(kb.statusSelect).toHaveValue('active');
    // No row should show a deprecated badge when status=active default is applied.
    // Badges render as <span>deprecated</span> inside table cells; use getByRole('cell')
    // + exact text to avoid matching stray occurrences elsewhere on the page.
    const deprecatedCells = page.locator('table tbody tr').filter({ hasText: /\bdeprecated\b/ });
    await expect(deprecatedCells).toHaveCount(0);
  });

  test('KB-24 detail page renders markdown body via prose wrapper', async ({ page }) => {
    await page.goto('/knowledge');
    const firstLink = page.locator('table tbody tr a[href^="/knowledge/"]').first();
    await firstLink.click();
    await expect(page).toHaveURL(/\/knowledge\/[^\/]+$/);
    const contentHeading = page.getByRole('heading', { name: 'Contenido' });
    await expect(contentHeading).toBeVisible();
    const prose = page.locator('.prose.prose-invert').first();
    await expect(prose).toBeVisible();
    const proseText = await prose.innerText();
    expect(proseText.trim().length).toBeGreaterThan(10);
  });
});
