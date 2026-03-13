import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class ConnectorsPOM extends BasePage {
  // Page locators
  readonly pageHeading: Locator;
  readonly newConnectorButton: Locator;

  // Type cards section: "Tipos de conector"
  readonly typeCardsSection: Locator;
  readonly typeCards: Locator;

  // Configured connectors section: "Conectores configurados"
  readonly configuredSection: Locator;
  readonly connectorTable: Locator;
  readonly emptyState: Locator;

  // Suggested templates section: "Plantillas sugeridas"
  readonly templatesSection: Locator;
  readonly templateCards: Locator;
  readonly useTemplateButtons: Locator;

  // Create/Edit Sheet
  readonly sheet: Locator;
  readonly sheetTitle: Locator;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly createButton: Locator;
  readonly cancelButton: Locator;

  // Test result indicators
  readonly testBadgeOk: Locator;
  readonly testBadgeFailed: Locator;

  constructor(page: Page) {
    super(page);

    this.pageHeading = page.getByRole('heading', { name: 'Conectores' });
    this.newConnectorButton = page.getByRole('button', { name: 'Nuevo conector' });

    // Sections identified by their h2 headings
    this.typeCardsSection = page.locator('section').filter({ hasText: 'Tipos de conector' });
    this.typeCards = this.typeCardsSection.locator('button');

    this.configuredSection = page.locator('section').filter({ hasText: 'Conectores configurados' });
    this.connectorTable = this.configuredSection.locator('table');
    this.emptyState = page.getByText('No hay conectores configurados');

    this.templatesSection = page.locator('section').filter({ hasText: 'Plantillas sugeridas' });
    this.templateCards = this.templatesSection.locator('.bg-zinc-900');
    this.useTemplateButtons = this.templatesSection.getByRole('button', { name: 'Usar plantilla' });

    // Sheet (side panel for create/edit)
    this.sheet = page.locator('[role="dialog"]');
    this.sheetTitle = this.sheet.locator('[class*="SheetTitle"], h2').first();
    this.nameInput = this.sheet.getByPlaceholder('Mi conector');
    this.descriptionInput = this.sheet.getByPlaceholder('Descripcion opcional...');
    this.createButton = this.sheet.getByRole('button', { name: 'Crear conector' });
    this.cancelButton = this.sheet.getByRole('button', { name: 'Cancelar' });

    // Test badges in the connector table
    this.testBadgeOk = page.locator('text=OK').first();
    this.testBadgeFailed = page.locator('text=Fallo').first();
  }

  async goto() {
    await this.navigateTo('/connectors');
  }

  async createConnector(name: string, type?: string, config?: Record<string, string>) {
    // Click on type card if specified, otherwise use the main "Nuevo conector" button
    if (type) {
      const typeCard = this.typeCardsSection.locator('button').filter({ hasText: type });
      if (await typeCard.isVisible()) {
        await typeCard.click();
      } else {
        await this.newConnectorButton.click();
      }
    } else {
      await this.newConnectorButton.click();
    }

    await this.sheet.waitFor({ state: 'visible' });
    await this.nameInput.fill(name);

    // Fill config fields if provided
    if (config) {
      for (const [placeholder, value] of Object.entries(config)) {
        const field = this.sheet.getByPlaceholder(placeholder);
        if (await field.isVisible()) {
          await field.fill(value);
        }
      }
    }

    await this.createButton.click();
  }

  findConnector(name: string): Locator {
    return this.connectorTable.locator('tr').filter({ hasText: name });
  }

  async testConnection(name: string) {
    const row = this.findConnector(name);
    const testButton = row.getByRole('button', { name: 'Probar conector' });
    await testButton.click();
  }

  getTestResultBadge(name: string): Locator {
    const row = this.findConnector(name);
    return row.locator('.bg-emerald-500\\/10, .bg-red-500\\/10').first();
  }

  async deleteConnector(name: string) {
    const row = this.findConnector(name);
    const deleteButton = row.getByRole('button', { name: 'Eliminar' });
    // Accept the confirm dialog
    this.page.once('dialog', (dialog) => dialog.accept());
    await deleteButton.click();
  }
}
