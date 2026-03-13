import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class TasksPOM extends BasePage {
  /** Page title heading */
  readonly pageTitle: Locator;
  /** "Nueva tarea" button in page header */
  readonly newTaskButton: Locator;
  /** Task cards grid */
  readonly taskGrid: Locator;
  /** Empty state message */
  readonly emptyState: Locator;
  /** Templates section heading */
  readonly templatesHeading: Locator;
  /** Template cards container */
  readonly templateCards: Locator;
  /** Filter buttons */
  readonly filterAll: Locator;
  readonly filterRunning: Locator;
  readonly filterCompleted: Locator;
  readonly filterDraft: Locator;
  /** Status badges */
  readonly statusBadges: Locator;

  // Wizard page elements
  /** Wizard heading "Nueva tarea" */
  readonly wizardHeading: Locator;
  /** Wizard step indicators */
  readonly wizardSteps: Locator;
  /** Task name input in wizard step 1 */
  readonly wizardTaskName: Locator;
  /** Task description textarea in wizard step 1 */
  readonly wizardTaskDescription: Locator;
  /** "Siguiente" (Next) button in wizard */
  readonly wizardNextButton: Locator;
  /** "Anterior" (Previous) button in wizard */
  readonly wizardPrevButton: Locator;
  /** "Guardar borrador" button in wizard step 4 */
  readonly wizardSaveDraftButton: Locator;
  /** "Lanzar tarea" button in wizard step 4 */
  readonly wizardLaunchButton: Locator;
  /** "Volver a tareas" back link in wizard */
  readonly wizardBackLink: Locator;

  constructor(page: Page) {
    super(page);
    // Tasks list page
    this.pageTitle = page.getByRole('heading', { name: 'Tareas' });
    this.newTaskButton = page.getByRole('button', { name: 'Nueva tarea' });
    this.taskGrid = page.locator('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-3');
    this.emptyState = page.getByText('No hay tareas');
    this.templatesHeading = page.getByRole('heading', { name: 'Plantillas' });
    this.templateCards = page.locator('.grid.grid-cols-1.md\\:grid-cols-3');
    this.filterAll = page.getByRole('button', { name: /Todas/ });
    this.filterRunning = page.getByRole('button', { name: /En curso/ });
    this.filterCompleted = page.getByRole('button', { name: /Completadas/ });
    this.filterDraft = page.getByRole('button', { name: /Borradores/ });
    this.statusBadges = page.locator('[class*="badge"]');

    // Wizard elements
    this.wizardHeading = page.getByRole('heading', { name: 'Nueva tarea' });
    this.wizardSteps = page.locator('.rounded-full.flex.items-center.justify-center');
    this.wizardTaskName = page.getByPlaceholder('Ej: Documentacion tecnica del API');
    this.wizardTaskDescription = page.getByPlaceholder('Describe brevemente el objetivo de esta tarea...');
    this.wizardNextButton = page.getByRole('button', { name: 'Siguiente' });
    this.wizardPrevButton = page.getByRole('button', { name: 'Anterior' });
    this.wizardSaveDraftButton = page.getByRole('button', { name: 'Guardar borrador' });
    this.wizardLaunchButton = page.getByRole('button', { name: 'Lanzar tarea' });
    this.wizardBackLink = page.getByText('Volver a tareas');
  }

  /** Navigate to tasks list page */
  async goto() {
    await this.navigateTo('/tasks');
  }

  /** Navigate to new task wizard */
  async gotoNewTask() {
    await this.navigateTo('/tasks/new');
  }

  /** Find a template card by name */
  findTemplate(name: string): Locator {
    return this.page.locator('.bg-zinc-900.border.rounded-lg', { hasText: name });
  }

  /** Find a task card by name */
  findTask(name: string): Locator {
    return this.page.locator('a[href^="/tasks/"]', { hasText: name });
  }

  /** Click the "Usar" button on a template to start wizard from template */
  async useTemplate(templateName: string) {
    const card = this.findTemplate(templateName);
    await card.getByRole('button', { name: 'Usar' }).click();
  }

  /** Create a task from the wizard (starts from tasks list page) */
  async createFromTemplate(templateName: string, taskName: string) {
    // Click "Usar" on the template card
    await this.useTemplate(templateName);

    // Wait for wizard to load
    await this.wizardHeading.waitFor({ state: 'visible' });

    // Step 1: Fill task name
    await this.wizardTaskName.fill(taskName);

    // Navigate through wizard: Step 1 -> Step 2
    await this.wizardNextButton.click();

    // Step 2: Projects (skip, just go next)
    await this.wizardNextButton.click();

    // Step 3: Pipeline (template pre-fills steps, just go next)
    await this.wizardNextButton.click();

    // Step 4: Review - save as draft
    await this.wizardSaveDraftButton.click();
  }

  /** Create a task manually via wizard */
  async createTask(taskName: string, opts?: { description?: string }) {
    await this.newTaskButton.click();

    // Wait for wizard
    await this.wizardHeading.waitFor({ state: 'visible' });

    // Step 1: Fill task name
    await this.wizardTaskName.fill(taskName);

    if (opts?.description) {
      await this.wizardTaskDescription.fill(opts.description);
    }
  }

  /** Get the current wizard step number (1-based) */
  async getCurrentWizardStep(): Promise<number> {
    const activeStep = this.page.locator('.bg-violet-500.text-white.rounded-full');
    const text = await activeStep.textContent();
    return parseInt(text || '1', 10);
  }
}
