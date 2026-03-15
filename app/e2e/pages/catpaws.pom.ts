import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class CatPawsPOM extends BasePage {
  /** Page heading */
  readonly pageTitle: Locator;
  /** "Nuevo CatPaw" / "Crear" button */
  readonly createButton: Locator;
  /** Mode filter buttons */
  readonly filterAll: Locator;
  readonly filterChat: Locator;
  readonly filterProcessor: Locator;
  readonly filterHybrid: Locator;
  /** Search input */
  readonly searchInput: Locator;
  /** CatPaw cards grid */
  readonly cardsGrid: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.getByRole('heading', { name: /Agentes/i });
    this.createButton = page.getByRole('link', { name: /Nuevo|Crear/i }).first();
    this.filterAll = page.getByRole('button', { name: /Todos/i });
    this.filterChat = page.getByRole('button', { name: /Chat/i });
    this.filterProcessor = page.getByRole('button', { name: /Procesador/i });
    this.filterHybrid = page.getByRole('button', { name: /H[ií]brido/i });
    this.searchInput = page.getByPlaceholder(/Buscar/i);
    this.cardsGrid = page.locator('[class*="grid"]').first();
  }

  async goto(): Promise<void> {
    await this.navigateTo('/agents');
  }

  /** Find a CatPaw card by name */
  findCatPaw(name: string): Locator {
    return this.page.locator('[class*="card" i], [class*="Card" i]').filter({ hasText: name });
  }

  /** Navigate to create wizard */
  async gotoCreate(): Promise<void> {
    await this.navigateTo('/agents/new');
  }

  /** Filter by mode */
  async filterByMode(mode: 'all' | 'chat' | 'processor' | 'hybrid'): Promise<void> {
    const filters = { all: this.filterAll, chat: this.filterChat, processor: this.filterProcessor, hybrid: this.filterHybrid };
    await filters[mode].click();
  }

  /** Search by name */
  async searchByName(query: string): Promise<void> {
    await this.searchInput.fill(query);
  }

  /** Navigate to CatPaw detail page */
  async openCatPaw(name: string): Promise<void> {
    await this.findCatPaw(name).click();
    await this.page.waitForLoadState('networkidle');
  }

  /** Delete CatPaw from detail page */
  async deleteCatPaw(): Promise<void> {
    await this.page.getByRole('button', { name: /Eliminar/i }).click();
    // Confirm deletion
    const dialog = this.page.locator('[role="dialog"]');
    await dialog.getByRole('button', { name: /Eliminar/i }).click();
    await this.page.waitForLoadState('networkidle');
  }
}
