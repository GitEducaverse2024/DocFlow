import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class CanvasPOM extends BasePage {
  // List page locators
  readonly pageHeading: Locator;
  readonly newButton: Locator;
  readonly canvasGrid: Locator;
  readonly filterButtons: Locator;
  readonly emptyState: Locator;

  // Wizard locators (CanvasWizard dialog)
  readonly wizardDialog: Locator;
  readonly wizardNameInput: Locator;
  readonly wizardDescriptionInput: Locator;
  readonly wizardCreateButton: Locator;

  // Editor locators (canvas/[id] page with ReactFlow)
  readonly editorContainer: Locator;
  readonly startNode: Locator;
  readonly nodeToolbar: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    // List page
    this.pageHeading = page.getByRole('heading', { name: 'Canvas' });
    this.newButton = page.getByRole('button', { name: 'Nuevo' });
    this.canvasGrid = page.locator('.grid');
    this.filterButtons = page.locator('button').filter({ hasText: /Todos|Agentes|Proyectos|Mixtos|Plantillas/ });
    this.emptyState = page.getByText('No hay canvas creados');

    // Wizard (Sheet/Dialog)
    this.wizardDialog = page.locator('[role="dialog"]');
    this.wizardNameInput = this.wizardDialog.getByPlaceholder(/nombre/i);
    this.wizardDescriptionInput = this.wizardDialog.getByPlaceholder(/descripci/i);
    this.wizardCreateButton = this.wizardDialog.getByRole('button', { name: /Crear/i });

    // Editor (ReactFlow canvas)
    this.editorContainer = page.locator('.react-flow');
    this.startNode = page.locator('.react-flow__node').filter({ hasText: /Inicio|START/i }).first();
    this.nodeToolbar = page.locator('[data-testid="node-toolbar"], .node-toolbar, [class*="toolbar"]').first();
    this.saveButton = page.getByRole('button', { name: /Guardar|Salvar|Save/i });
  }

  async goto() {
    await this.navigateTo('/canvas');
  }

  async createCanvas(name: string, description?: string) {
    await this.newButton.click();
    await this.wizardDialog.waitFor({ state: 'visible' });
    await this.wizardNameInput.fill(name);
    if (description) {
      await this.wizardDescriptionInput.fill(description);
    }
    await this.wizardCreateButton.click();
    // After creation, page typically redirects to editor
    await this.page.waitForURL(/\/canvas\/.+/);
  }

  findCanvas(name: string): Locator {
    return this.canvasGrid.locator('text=' + name).first();
  }

  async openCanvas(name: string) {
    const card = this.findCanvas(name);
    await card.click();
    await this.page.waitForURL(/\/canvas\/.+/);
  }

  async addNode(type: string) {
    // Click the add-node button in the toolbar/palette
    const addButton = this.page.getByRole('button', { name: new RegExp(type, 'i') });
    if (await addButton.isVisible()) {
      await addButton.click();
    }
  }

  async dragNode(nodeLocator: Locator, deltaX: number, deltaY: number) {
    const box = await nodeLocator.boundingBox();
    if (!box) throw new Error('Node not visible for drag');
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX + deltaX, startY + deltaY, { steps: 10 });
    await this.page.mouse.up();
  }

  async saveCanvas() {
    await this.saveButton.click();
  }

  async deleteCanvas(name: string) {
    // From the list page, find the canvas card and click delete
    const card = this.canvasGrid.locator('div').filter({ hasText: name }).first();
    const deleteButton = card.getByRole('button', { name: /Eliminar|Delete/i });
    if (await deleteButton.isVisible()) {
      // Accept the confirm dialog
      this.page.once('dialog', (dialog) => dialog.accept());
      await deleteButton.click();
    }
  }
}
