import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class ProcessingPOM extends BasePage {
  /** Agent list selector area (AgentListSelector component) */
  readonly agentSelector: Locator;

  /** Model selector dropdown (Select with model groups) */
  readonly modelSelector: Locator;

  /** Process button: "Procesar con {agentName}" */
  readonly processButton: Locator;

  /** Loading/streaming indicator during processing */
  readonly streamingIndicator: Locator;

  /** Version history section (VersionHistory component) */
  readonly versionHistory: Locator;

  /** Skills section (checkboxes for selecting skills) */
  readonly skillsSection: Locator;

  /** Source modes section (process / direct / exclude toggles) */
  readonly sourceModes: Locator;

  /** Active processing run card (shows status, elapsed time) */
  readonly activeRunCard: Locator;

  /** "Detener" / Stop button during streaming */
  readonly stopButton: Locator;

  constructor(page: Page) {
    super(page);
    // Agent selector — look for the agent selection area with agent cards/radio buttons
    this.agentSelector = page.locator('[class*="AgentListSelector"]').first()
      .or(page.getByText('Agente asignado').first())
      .or(page.getByText('Asignar agente').first());
    // Model selector — Select dropdown for LLM model
    this.modelSelector = page.locator('button[role="combobox"]').first();
    // Process button — matches "Procesar con ..." text
    this.processButton = page.getByRole('button', { name: /Procesar con/ });
    // Streaming indicator: the preview panel with streaming content or stage info
    this.streamingIndicator = page.locator('[class*="animate-pulse"]').first();
    // Version history
    this.versionHistory = page.getByText('versiones').first();
    // Skills section
    this.skillsSection = page.getByText('Skills disponibles').first();
    // Source modes section
    this.sourceModes = page.getByText('Procesar con IA').first();
    // Active run card
    this.activeRunCard = page.locator('[class*="border-violet"]').first();
    // Stop button
    this.stopButton = page.getByRole('button', { name: /Detener|Cancelar/ });
  }

  /** Select an agent by clicking on its name in the agent list */
  async selectAgent(name: string): Promise<void> {
    await this.page.getByText(name).first().click();
  }

  /** Trigger processing by clicking the process button */
  async triggerProcessing(): Promise<void> {
    await this.processButton.click();
  }

  /** Check if processing is currently active (streaming or polling) */
  async isProcessing(): Promise<boolean> {
    return await this.streamingIndicator.isVisible().catch(() => false);
  }
}
