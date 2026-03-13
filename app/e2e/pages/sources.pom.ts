import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class SourcesPOM extends BasePage {
  /** Tab triggers for switching source input mode */
  readonly filesTab: Locator;
  readonly urlsTab: Locator;
  readonly youtubeTab: Locator;
  readonly notesTab: Locator;

  /** Source list container */
  readonly sourceList: Locator;

  /** Search input in source list (placeholder="Buscar...") */
  readonly searchInput: Locator;

  /** Type filter select trigger */
  readonly typeFilter: Locator;

  /** Hidden file input used by react-dropzone for file uploads */
  readonly fileInput: Locator;

  constructor(page: Page) {
    super(page);
    // Tab triggers matching exact text from source-manager.tsx TabsTrigger values
    this.filesTab = page.getByRole('tab', { name: 'Archivos' });
    this.urlsTab = page.getByRole('tab', { name: 'URLs' });
    this.youtubeTab = page.getByRole('tab', { name: 'YouTube' });
    this.notesTab = page.getByRole('tab', { name: 'Notas' });
    // Source list area
    this.sourceList = page.locator('[class*="SortableContext"]').locator('..').first();
    // Search input
    this.searchInput = page.getByPlaceholder('Buscar...');
    // Type filter
    this.typeFilter = page.locator('button').filter({ hasText: 'Tipo' }).first();
    // File input (hidden, used by react-dropzone)
    this.fileInput = page.locator('input[type="file"]');
  }

  /** Upload a file using the hidden file input (react-dropzone pattern) */
  async uploadFile(filePath: string): Promise<void> {
    await this.fileInput.setInputFiles(filePath);
    // Wait for upload API call to complete
    await this.page.waitForLoadState('networkidle');
  }

  /** Find a source item in the list by name */
  findSource(name: string): Locator {
    return this.page.locator('div').filter({ hasText: name }).first();
  }

  /** Delete a source by clicking its delete button and confirming */
  async deleteSource(name: string): Promise<void> {
    const sourceItem = this.findSource(name);
    // Hover to show action buttons
    await sourceItem.hover();
    // Click delete button (Trash icon button within the source item)
    await sourceItem.locator('button').filter({ has: this.page.locator('[class*="lucide-trash"]') }).click();
    // Wait for deletion
    await this.page.waitForLoadState('networkidle');
  }

  /** Search sources by filling the search input */
  async searchSources(query: string): Promise<void> {
    await this.searchInput.fill(query);
  }

  /**
   * Change source input mode by clicking the corresponding tab.
   * Modes: 'files' | 'urls' | 'youtube' | 'notes'
   * Maps to tab labels: Archivos, URLs, YouTube, Notas
   */
  async changeMode(mode: 'files' | 'urls' | 'youtube' | 'notes'): Promise<void> {
    const tabMap: Record<string, Locator> = {
      files: this.filesTab,
      urls: this.urlsTab,
      youtube: this.youtubeTab,
      notes: this.notesTab,
    };
    const tab = tabMap[mode];
    if (tab) {
      await tab.click();
    }
  }

  /** Get the currently active tab panel content */
  get activeTabContent(): Locator {
    return this.page.locator('[role="tabpanel"]');
  }

  /** Get all visible source items count text (e.g. "X fuentes añadidas") */
  get sourcesCountText(): Locator {
    return this.page.locator('div').filter({ hasText: /\d+ fuentes añadidas/ }).first();
  }

  /** "Seleccionar todo" checkbox label */
  readonly selectAllLabel: Locator = this.page.getByText('Seleccionar todo');
}
