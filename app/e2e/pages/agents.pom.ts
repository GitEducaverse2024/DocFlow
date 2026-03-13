import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class AgentsPOM extends BasePage {
  /** Page title heading */
  readonly pageTitle: Locator;
  /** "Crear agente" button in page header */
  readonly createButton: Locator;
  /** OpenClaw agents section heading */
  readonly openclawSection: Locator;
  /** Custom agents section heading */
  readonly customSection: Locator;
  /** OpenClaw agents table */
  readonly openclawTable: Locator;
  /** Custom agents table */
  readonly customTable: Locator;
  /** Create agent dialog */
  readonly createDialog: Locator;
  /** Edit agent sheet */
  readonly editSheet: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.getByRole('heading', { name: 'Agentes' });
    this.createButton = page.getByRole('button', { name: 'Crear agente' }).first();
    this.openclawSection = page.getByText('Agentes de OpenClaw');
    this.customSection = page.getByText('Agentes personalizados');
    this.openclawTable = page.locator('section').filter({ hasText: 'Agentes de OpenClaw' }).locator('table');
    this.customTable = page.locator('section').filter({ hasText: 'Agentes personalizados' }).locator('table');
    this.createDialog = page.locator('[role="dialog"]').filter({ hasText: 'Crear agente personalizado' });
    this.editSheet = page.locator('[role="dialog"]').filter({ hasText: 'Editar agente' });
  }

  /** Navigate to agents page */
  async goto() {
    await this.navigateTo('/agents');
  }

  /** Find an agent row by name in any table */
  findAgent(name: string): Locator {
    return this.page.locator('tr', { hasText: name });
  }

  /** Create a new custom agent via the dialog */
  async createAgent(name: string, opts?: { model?: string; description?: string }) {
    await this.createButton.click();
    await this.createDialog.waitFor({ state: 'visible' });

    // Select "Manual" mode card
    await this.page.getByText('Manual', { exact: true }).click();

    // Fill the name field
    const nameInput = this.createDialog.getByPlaceholder('Nombre del agente');
    await nameInput.fill(name);

    // Fill description if provided
    if (opts?.description) {
      const descInput = this.createDialog.locator('textarea').filter({ hasText: '' }).first();
      await descInput.fill(opts.description);
    }

    // Click "Crear agente" submit button inside the dialog
    await this.createDialog.getByRole('button', { name: 'Crear agente' }).click();
  }

  /** Edit an existing custom agent's description */
  async editAgent(name: string, updates: { description?: string }) {
    // Find the agent row and click its edit button (Pencil icon)
    const row = this.findAgent(name);
    await row.getByTitle('Editar').click();

    // Wait for edit sheet
    await this.editSheet.waitFor({ state: 'visible' });

    if (updates.description) {
      // The description textarea in the edit sheet
      const descLabel = this.editSheet.locator('label', { hasText: 'Descripcion' }).first();
      const descTextarea = this.editSheet.locator('textarea').first();
      await descTextarea.fill(updates.description);
    }

    // Click "Guardar cambios"
    await this.editSheet.getByRole('button', { name: 'Guardar cambios' }).click();
  }

  /** Delete a custom agent by name using the trash button + confirm dialog */
  async deleteAgent(name: string) {
    const row = this.findAgent(name);
    await row.getByTitle('Eliminar').click();

    // The delete uses window.confirm — Playwright handles this via dialog event
    // The caller must set up page.on('dialog') before calling this method
  }
}
