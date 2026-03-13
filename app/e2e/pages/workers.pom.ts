import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class WorkersPOM extends BasePage {
  /** Page title heading */
  readonly pageTitle: Locator;
  /** "Crear Worker" button in page header */
  readonly createButton: Locator;
  /** Workers table */
  readonly workersTable: Locator;
  /** Empty state message */
  readonly emptyState: Locator;
  /** Create/Edit sheet */
  readonly sheet: Locator;
  /** Sheet title */
  readonly sheetTitle: Locator;
  /** Delete confirmation dialog */
  readonly deleteDialog: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.getByRole('heading', { name: 'Docs Workers' });
    this.createButton = page.getByRole('button', { name: 'Crear Worker' }).first();
    this.workersTable = page.locator('table');
    this.emptyState = page.getByText('No hay Docs Workers');
    this.sheet = page.locator('[role="dialog"]').filter({ hasText: /Crear Docs Worker|Editar Worker/ });
    this.sheetTitle = this.sheet.locator('[class*="SheetTitle"], h2').first();
    this.deleteDialog = page.locator('[role="dialog"]').filter({ hasText: 'Eliminar' });
  }

  /** Navigate to workers page */
  async goto() {
    await this.navigateTo('/workers');
  }

  /** Find a worker row by name */
  findWorker(name: string): Locator {
    return this.page.locator('tr', { hasText: name });
  }

  /** Create a new worker */
  async createWorker(name: string, opts?: { description?: string; outputFormat?: string }) {
    await this.createButton.click();
    await this.sheet.waitFor({ state: 'visible' });

    // Fill name
    const nameInput = this.sheet.getByPlaceholder('Generador de PRD');
    await nameInput.fill(name);

    // Fill description if provided
    if (opts?.description) {
      const descInput = this.sheet.getByPlaceholder('Que hace este worker...');
      await descInput.fill(opts.description);
    }

    // Click save button ("Crear Worker")
    await this.sheet.getByRole('button', { name: 'Crear Worker' }).click();
  }

  /** Edit an existing worker */
  async editWorker(name: string, updates: { description?: string }) {
    // Click the edit button (Pencil icon) in the worker row
    const row = this.findWorker(name);
    await row.locator('button:has(svg.lucide-pencil)').click();

    await this.sheet.waitFor({ state: 'visible' });

    if (updates.description) {
      const descInput = this.sheet.getByPlaceholder('Que hace este worker...');
      await descInput.fill(updates.description);
    }

    // Click "Guardar cambios"
    await this.sheet.getByRole('button', { name: 'Guardar cambios' }).click();
  }

  /** Delete a worker by name */
  async deleteWorker(name: string) {
    const row = this.findWorker(name);
    await row.locator('button:has(svg.lucide-trash-2)').click();

    // Wait for delete confirmation dialog
    await this.deleteDialog.waitFor({ state: 'visible' });

    // Click "Eliminar" in the dialog
    await this.deleteDialog.getByRole('button', { name: 'Eliminar' }).click();
  }
}
