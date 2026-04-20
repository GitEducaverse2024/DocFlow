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
    // The filter form wraps each native <select> inside `<label class="...">Label<select>...</select></label>`.
    // Use exact role name matching to avoid "Tipo" matching "Subtipo" and to scope to <main> so sidebar
    // nav elements don't interfere.
    const main = page.locator('main');
    // The wrapping <label> exposes its combined text as accessible name — e.g. "TipoTodosaudit...".
    // Filter selects by their OWN option values (which are unique per filter) rather than role name.
    this.typeSelect = main.locator('select').filter({ has: page.locator('option[value="rule"]') });
    this.subtypeSelect = main.locator('select').filter({ has: page.locator('option[value="catpaw"]') });
    this.statusSelect = main.locator('select').filter({ has: page.locator('option[value="deprecated"]') });
    this.audienceSelect = main.locator('select').filter({ has: page.locator('option[value="catbot"]') });
    this.searchInput = main.locator('input[placeholder="Buscar en título y resumen…"]');
    this.resetButton = main.getByRole('button', { name: 'Reset', exact: true });
    this.rowCountLabel = main.locator('text=/\\d+ de \\d+ entradas/');
    this.tableRows = page.locator('table tbody tr').filter({ has: page.locator('a[href^="/knowledge/"]') });
    // Counts cards live inside the page main region; find by the 8 known Spanish labels.
    this.countsCards = main.getByText(/CatPaws activos|Conectores activos|CatBrains activos|Plantillas activas|Skills activos|Reglas|Incidentes resueltos|Features documentadas/);
    this.timelinePlaceholder = main.getByText('Sin cambios recientes');
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
