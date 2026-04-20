import type { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for the /knowledge dashboard (Phase 154).
 *
 * Covers list page (KB-23, KB-26, KB-27) + navigation into detail (KB-24).
 * Complements the POM pattern established in app/e2e/pages/sidebar.pom.ts.
 */
export class KnowledgePage {
  readonly page: Page;
  readonly typeSelect: Locator;
  readonly subtypeSelect: Locator;
  readonly statusSelect: Locator;
  readonly audienceSelect: Locator;
  readonly searchInput: Locator;
  readonly resetButton: Locator;
  readonly rowCountLabel: Locator;
  readonly tableRows: Locator;
  readonly countsCards: Locator;
  readonly timelinePlaceholder: Locator;
  readonly timelineChart: Locator;

  constructor(page: Page) {
    this.page = page;
    this.typeSelect = page.locator('label', { hasText: 'Tipo' }).locator('select');
    this.subtypeSelect = page.locator('label', { hasText: 'Subtipo' }).locator('select');
    this.statusSelect = page.locator('label', { hasText: 'Estado' }).locator('select');
    this.audienceSelect = page.locator('label', { hasText: 'Audiencia' }).locator('select');
    this.searchInput = page.locator('label', { hasText: 'Búsqueda' }).locator('input');
    this.resetButton = page.getByRole('button', { name: 'Reset' });
    this.rowCountLabel = page.locator('text=/\\d+ de \\d+ entradas/');
    this.tableRows = page.locator('table tbody tr').filter({ has: page.locator('a[href^="/knowledge/"]') });
    this.countsCards = page.locator('.grid').first().locator('> *');
    this.timelinePlaceholder = page.getByText('Sin cambios recientes');
    this.timelineChart = page.locator('.recharts-line');
  }

  async goto() {
    await this.page.goto('/knowledge');
  }

  async selectType(value: string) {
    await this.typeSelect.selectOption(value);
  }

  async selectSubtype(value: string) {
    await this.subtypeSelect.selectOption(value);
  }

  async selectStatus(value: string) {
    await this.statusSelect.selectOption(value);
  }

  async search(q: string) {
    await this.searchInput.fill(q);
  }

  async clickTag(tag: string) {
    await this.page.getByRole('button', { name: tag, exact: true }).click();
  }

  async clickRowByTitle(title: string) {
    await this.page.locator('table tbody tr', { hasText: title }).locator('a').first().click();
  }

  async visibleRowCount(): Promise<number> {
    return this.tableRows.count();
  }

  async firstEntryHref(): Promise<string | null> {
    const first = this.page.locator('table tbody tr a[href^="/knowledge/"]').first();
    return first.getAttribute('href');
  }
}
