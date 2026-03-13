import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class ProjectsPOM extends BasePage {
  /** "Nuevo Proyecto" button/link on the projects list page */
  readonly newProjectButton: Locator;

  /** Search input on projects list (placeholder="Buscar proyectos...") */
  readonly searchInput: Locator;

  /** Pipeline nav steps container (sticky pipeline nav in project detail) */
  readonly pipelineNav: Locator;

  /** Pipeline step labels: Fuentes, Procesar, Historial, RAG, Chat */
  readonly pipelineStepLabels: string[] = ['Fuentes', 'Procesar', 'Historial', 'RAG', 'Chat'];

  /** "Eliminar" button on project detail page */
  readonly deleteButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newProjectButton = page.getByRole('link', { name: 'Nuevo Proyecto' });
    this.searchInput = page.getByPlaceholder('Buscar proyectos...');
    this.pipelineNav = page.locator('.sticky.top-0');
    this.deleteButton = page.getByRole('button', { name: 'Eliminar' }).first();
  }

  /** Navigate to projects list */
  async goto(): Promise<void> {
    await this.navigateTo('/projects');
  }

  /**
   * Create a new project via the wizard (step 1 only — name + purpose, then save as draft).
   * Fills the "Nombre del proyecto" and "Finalidad" fields, then clicks "Guardar borrador".
   */
  async createProject(name: string, description?: string): Promise<void> {
    await this.navigateTo('/projects/new');
    // Fill name (placeholder="Ej: Documentación API Pagos")
    await this.page.getByPlaceholder('Ej: Documentación API Pagos').fill(name);
    // Fill description if provided (placeholder="Describe brevemente de qué trata...")
    if (description) {
      await this.page.getByPlaceholder('Describe brevemente de qué trata...').fill(description);
    }
    // Fill required purpose field (placeholder starts with "Qué quieres conseguir")
    await this.page.getByPlaceholder('Qué quieres conseguir').fill('Proyecto de prueba E2E');
    // Click "Guardar borrador" to create project
    await this.page.getByRole('button', { name: 'Guardar borrador' }).click();
    await this.page.waitForLoadState('networkidle');
  }

  /** Find a project card in the list by its name text */
  findProjectInList(name: string): Locator {
    return this.page.locator('div').filter({ hasText: name }).locator('a', { hasText: 'Ver Detalles' }).first();
  }

  /** Find the project card container by name */
  findProjectCard(name: string): Locator {
    return this.page.locator('[class*="CardTitle"]', { hasText: name }).first();
  }

  /** Open a project by clicking "Ver Detalles" on its card */
  async openProject(name: string): Promise<void> {
    await this.findProjectInList(name).click();
    await this.page.waitForLoadState('networkidle');
  }

  /** Delete a project from the project detail page using the 2-step confirmation dialog */
  async deleteProject(projectName: string): Promise<void> {
    // Click the Eliminar button on the project detail header
    await this.deleteButton.click();
    // Step 1: Click "Continuar" in the first dialog step
    await this.page.getByRole('button', { name: 'Continuar' }).click();
    // Step 2: Type project name to confirm
    await this.page.getByPlaceholder(projectName).fill(projectName);
    // Click "Eliminar permanentemente"
    await this.page.getByRole('button', { name: 'Eliminar permanentemente' }).click();
    await this.page.waitForLoadState('networkidle');
  }

  /** Search for projects by typing in the search input */
  async searchProjects(query: string): Promise<void> {
    await this.searchInput.fill(query);
  }

  /** Get pipeline step buttons in the project detail view */
  getPipelineStep(label: string): Locator {
    return this.pipelineNav.getByText(label, { exact: true });
  }
}
