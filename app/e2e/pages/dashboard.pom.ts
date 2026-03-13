import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class DashboardPOM extends BasePage {
  /** Summary cards section: "Proyectos", "Agentes", "Tareas", "Conectores", "Tokens hoy", "Coste mes", "En ejecucion" */
  readonly summaryCards: Locator;

  /** Individual summary card locators by label text */
  readonly projectsCard: Locator;
  readonly agentsCard: Locator;
  readonly tasksCard: Locator;
  readonly connectorsCard: Locator;

  /** Token usage chart area (recharts ResponsiveContainer) */
  readonly tokenUsageChart: Locator;

  /** Recent activity section: card titled "Actividad reciente" */
  readonly recentActivity: Locator;

  /** Storage section: card titled "Almacenamiento" */
  readonly storageSection: Locator;

  /** Top models card titled "Top modelos" */
  readonly topModels: Locator;

  /** Top agents card titled "Top agentes" */
  readonly topAgents: Locator;

  /** "Nuevo Proyecto" button on dashboard */
  readonly newProjectButton: Locator;

  constructor(page: Page) {
    super(page);
    // Summary cards grid
    this.summaryCards = page.locator('.grid.grid-cols-2');
    // Individual cards identified by their label text
    this.projectsCard = page.getByText('Proyectos').first();
    this.agentsCard = page.getByText('Agentes').first();
    this.tasksCard = page.getByText('Tareas').first();
    this.connectorsCard = page.getByText('Conectores').first();
    // Token usage: recharts container inside the card with title "Uso de tokens"
    this.tokenUsageChart = page.locator('.recharts-responsive-container').first();
    // Recent activity card
    this.recentActivity = page.getByText('Actividad reciente');
    // Storage card
    this.storageSection = page.getByText('Almacenamiento');
    // Top models card
    this.topModels = page.getByText('Top modelos');
    // Top agents card
    this.topAgents = page.getByText('Top agentes');
    // New project button
    this.newProjectButton = page.getByRole('link', { name: 'Nuevo Proyecto' });
  }

  /** Navigate to dashboard */
  async goto(): Promise<void> {
    await this.navigateTo('/');
  }
}
