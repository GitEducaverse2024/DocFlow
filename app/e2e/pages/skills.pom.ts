import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class SkillsPOM extends BasePage {
  /** Page title heading */
  readonly pageTitle: Locator;
  /** "Crear Skill" button in page header */
  readonly createButton: Locator;
  /** Skills grid container */
  readonly skillsGrid: Locator;
  /** Empty state message */
  readonly emptyState: Locator;
  /** Search input */
  readonly searchInput: Locator;
  /** Create/Edit sheet */
  readonly sheet: Locator;
  /** Delete confirmation dialog */
  readonly deleteDialog: Locator;
  /** Category filter "Todos" button */
  readonly filterAll: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.getByRole('heading', { name: 'Skills' });
    this.createButton = page.getByRole('button', { name: 'Crear Skill' }).first();
    this.skillsGrid = page.locator('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-3');
    this.emptyState = page.getByText('No hay Skills');
    this.searchInput = page.getByPlaceholder('Buscar skills...');
    this.sheet = page.locator('[role="dialog"]').filter({ hasText: /Crear Skill|Editar Skill/ });
    this.deleteDialog = page.locator('[role="dialog"]').filter({ hasText: 'Eliminar' });
    this.filterAll = page.getByRole('button', { name: 'Todos' });
  }

  /** Navigate to skills page */
  async goto() {
    await this.navigateTo('/skills');
  }

  /** Find a skill card by name */
  findSkill(name: string): Locator {
    return this.page.locator('.bg-zinc-900.border.rounded-lg', { hasText: name });
  }

  /** Create a new skill */
  async createSkill(name: string, opts?: { description?: string; instructions?: string }) {
    await this.createButton.click();
    await this.sheet.waitFor({ state: 'visible' });

    // Fill name
    const nameInput = this.sheet.getByPlaceholder('Formato Diataxis');
    await nameInput.fill(name);

    // Fill description if provided
    if (opts?.description) {
      const descInput = this.sheet.getByPlaceholder('Que hace este skill...');
      await descInput.fill(opts.description);
    }

    // Fill instructions (required field)
    if (opts?.instructions) {
      const instructionsInput = this.sheet.getByPlaceholder('Instrucciones detalladas que se inyectaran en el prompt del agente/worker...');
      await instructionsInput.fill(opts.instructions);
    }

    // Click "Crear Skill"
    await this.sheet.getByRole('button', { name: 'Crear Skill' }).click();
  }

  /** Edit an existing skill */
  async editSkill(name: string, updates: { description?: string }) {
    // Click on the skill card name to open edit
    const card = this.findSkill(name);
    await card.locator('button:has(svg.lucide-pencil)').click();

    await this.sheet.waitFor({ state: 'visible' });

    if (updates.description) {
      const descInput = this.sheet.getByPlaceholder('Que hace este skill...');
      await descInput.fill(updates.description);
    }

    // Click "Guardar cambios"
    await this.sheet.getByRole('button', { name: 'Guardar cambios' }).click();
  }

  /** Delete a skill by name */
  async deleteSkill(name: string) {
    const card = this.findSkill(name);
    await card.locator('button:has(svg.lucide-trash-2)').click();

    // Wait for delete confirmation dialog
    await this.deleteDialog.waitFor({ state: 'visible' });

    // Click "Eliminar" in the dialog
    await this.deleteDialog.getByRole('button', { name: 'Eliminar' }).click();
  }
}
