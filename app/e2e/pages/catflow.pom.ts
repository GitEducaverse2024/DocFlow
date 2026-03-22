import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class CatFlowPOM extends BasePage {
  /** Page title heading (rendered by PageHeader) */
  readonly pageHeading: Locator;
  /** "Nuevo CatFlow" button in page header */
  readonly newButton: Locator;
  /** Sidebar link to CatFlow */
  readonly sidebarLink: Locator;
  /** Card grid container */
  readonly cardGrid: Locator;
  /** Empty state message (shown when no catflows exist) */
  readonly emptyState: Locator;
  /** Filter buttons row */
  readonly filterButtons: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.getByRole('heading', { name: 'CatFlow' });
    this.newButton = page.getByRole('button', { name: /Nuevo CatFlow/i });
    this.sidebarLink = page.getByRole('link', { name: /catflow/i }).first();
    this.cardGrid = page.locator('.grid.grid-cols-1');
    this.emptyState = page.getByText(/No hay CatFlows/i);
    this.filterButtons = page.getByRole('button', { name: /Todos|Activos|Programados|En escucha|Borradores/i });
  }

  /** Navigate to CatFlow list page */
  async goto() {
    await this.navigateTo('/catflow');
  }

  /** Find a CatFlow card by name */
  findCard(name: string): Locator {
    return this.page.locator('a[href^="/catflow/"]', { hasText: name });
  }
}
