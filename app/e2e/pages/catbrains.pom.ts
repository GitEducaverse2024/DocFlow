import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class CatBrainsPOM extends BasePage {
  /** "Nuevo CatBrain" link/button on the list page */
  readonly newCatBrainButton: Locator;
  /** Search input (placeholder="Buscar CatBrains...") */
  readonly searchInput: Locator;
  /** Pipeline nav steps container */
  readonly pipelineNav: Locator;
  /** Pipeline step labels */
  readonly pipelineStepLabels: string[] = ['Fuentes', 'Procesar', 'Historial', 'RAG', 'Chat'];
  /** Delete button on detail page */
  readonly deleteButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newCatBrainButton = page.getByRole('link', { name: /Nuevo CatBrain/i });
    this.searchInput = page.getByPlaceholder(/Buscar/i);
    this.pipelineNav = page.locator('.sticky.top-0');
    this.deleteButton = page.getByRole('button', { name: 'Eliminar' }).first();
  }

  async goto(): Promise<void> {
    await this.navigateTo('/catbrains');
  }

  async createCatBrain(name: string, description?: string): Promise<void> {
    await this.navigateTo('/catbrains/new');
    await this.page.getByPlaceholder(/Nombre/i).first().fill(name);
    if (description) {
      await this.page.getByPlaceholder(/Describe brevemente/i).fill(description);
    }
    await this.page.getByPlaceholder(/conseguir/i).fill('CatBrain de prueba E2E');
    await this.page.getByRole('button', { name: /Guardar borrador/i }).click();
    await this.page.waitForLoadState('networkidle');
  }

  findCatBrainInList(name: string): Locator {
    return this.page.locator('div').filter({ hasText: name }).locator('a', { hasText: /Ver Detalles/i }).first();
  }

  async openCatBrain(name: string): Promise<void> {
    await this.findCatBrainInList(name).click();
    await this.page.waitForLoadState('networkidle');
  }

  async deleteCatBrain(catbrainName: string): Promise<void> {
    await this.deleteButton.click();
    await this.page.getByRole('button', { name: 'Continuar' }).click();
    await this.page.getByPlaceholder(catbrainName).fill(catbrainName);
    await this.page.getByRole('button', { name: /Eliminar permanentemente/i }).click();
    await this.page.waitForLoadState('networkidle');
  }

  getPipelineStep(label: string): Locator {
    return this.pipelineNav.getByText(label, { exact: true });
  }
}
