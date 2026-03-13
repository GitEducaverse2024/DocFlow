import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class RagPOM extends BasePage {
  /** "Indexar documentos" button (initial indexing) */
  readonly indexButton: Locator;

  /** "Re-indexar" button (when RAG already exists) */
  readonly reindexButton: Locator;

  /** Progress bar during indexing (the animated bar inside bg-zinc-800 track) */
  readonly progressBar: Locator;

  /** Progress message text during indexing (animate-pulse text) */
  readonly progressMessage: Locator;

  /** Stats cards container (grid with Vectores, Modelo embeddings, Dimensiones, Coleccion) */
  readonly statsCards: Locator;

  /** Vectores count stat */
  readonly vectoresCard: Locator;

  /** Query input (placeholder="Escribe tu pregunta...") */
  readonly queryInput: Locator;

  /** Query submit button (Search icon button next to query input) */
  readonly querySubmitButton: Locator;

  /** Query results container (space-y-3 area showing result cards) */
  readonly queryResults: Locator;

  /** "Probar consulta" card title */
  readonly querySection: Locator;

  /** "Eliminar" button for deleting the RAG collection */
  readonly deleteButton: Locator;

  /** Collection name input (for initial config) */
  readonly collectionNameInput: Locator;

  /** Embedding model selector */
  readonly embeddingModelSelector: Locator;

  /** "Crear coleccion RAG" card title */
  readonly createCollectionTitle: Locator;

  constructor(page: Page) {
    super(page);
    // Index button: "Indexar documentos" in the initial config view
    this.indexButton = page.getByRole('button', { name: 'Indexar documentos' });
    // Re-index button
    this.reindexButton = page.getByRole('button', { name: /Re-indexar/ }).first();
    // Progress bar (the inner div with bg-violet-500 inside bg-zinc-800 track)
    this.progressBar = page.locator('.bg-violet-500.rounded-full.transition-all');
    // Progress message
    this.progressMessage = page.locator('.text-violet-400.animate-pulse').first();
    // Stats cards grid (4-column grid with stat cards)
    this.statsCards = page.locator('.grid.grid-cols-2.md\\:grid-cols-4').first();
    // Vectores card
    this.vectoresCard = page.getByText('Vectores').first();
    // Query input
    this.queryInput = page.getByPlaceholder('Escribe tu pregunta...');
    // Query submit button (the button right after the query input with Search icon)
    this.querySubmitButton = this.queryInput.locator('..').locator('button').first();
    // Query results container
    this.queryResults = page.locator('.space-y-3.mt-4').first();
    // Query section title
    this.querySection = page.getByText('Probar consulta');
    // Delete button
    this.deleteButton = page.getByRole('button', { name: 'Eliminar' }).last();
    // Collection name input
    this.collectionNameInput = page.locator('input').filter({ hasText: '' }).first();
    // Embedding model selector
    this.embeddingModelSelector = page.locator('button[role="combobox"]').first();
    // Create collection card title
    this.createCollectionTitle = page.getByText('Crear colección RAG');
  }

  /** Navigate to a project's RAG tab by clicking the pipeline step */
  async gotoRagTab(): Promise<void> {
    await this.page.locator('.sticky.top-0').getByText('RAG', { exact: true }).click();
    await this.page.waitForLoadState('networkidle');
  }

  /** Trigger initial indexing */
  async triggerIndex(): Promise<void> {
    await this.indexButton.click();
  }

  /**
   * Submit a RAG query: fill input, click submit, wait for response
   * Handles Qdrant-unavailable gracefully via soft assertions in the spec
   */
  async queryRag(text: string): Promise<void> {
    await this.queryInput.fill(text);
    await this.querySubmitButton.click();
    // Wait briefly for API call
    await this.page.waitForTimeout(1000);
  }

  /** Trigger re-indexing */
  async reindex(): Promise<void> {
    await this.reindexButton.click();
    // If confirm dialog appears, accept it
    this.page.once('dialog', (dialog) => dialog.accept());
  }

  /** Check if indexing is in progress */
  async isIndexing(): Promise<boolean> {
    return await this.progressMessage.isVisible().catch(() => false);
  }
}
