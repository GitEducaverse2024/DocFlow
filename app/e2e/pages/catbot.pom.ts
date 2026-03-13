import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class CatBotPOM extends BasePage {
  // Floating trigger button (visible when panel is closed)
  readonly triggerButton: Locator;

  // Panel container (visible when open)
  readonly panel: Locator;
  readonly panelHeader: Locator;
  readonly panelTitle: Locator;

  // Panel controls
  readonly closeButton: Locator;
  readonly minimizeButton: Locator;
  readonly clearHistoryButton: Locator;

  // Chat input area
  readonly messageInput: Locator;
  readonly sendButton: Locator;

  // Message list
  readonly messageList: Locator;
  readonly userMessages: Locator;
  readonly assistantMessages: Locator;

  // Suggestions (contextual chips)
  readonly suggestionsContainer: Locator;
  readonly suggestionButtons: Locator;

  // Welcome text
  readonly welcomeText: Locator;

  constructor(page: Page) {
    super(page);

    // Floating button: has title="Abrir CatBot" and contains the cat image
    this.triggerButton = page.locator('button[title="Abrir CatBot"]');

    // Panel: fixed positioned container with CatBot header
    this.panel = page.locator('.fixed').filter({ hasText: 'CatBot' }).filter({ has: page.locator('input[placeholder*="mensaje"]') });
    this.panelHeader = this.panel.locator('div').filter({ hasText: 'CatBot' }).first();
    this.panelTitle = page.getByText('CatBot').first();

    // Controls
    this.closeButton = page.locator('button[title="Cerrar"]');
    this.minimizeButton = page.locator('button[title="Minimizar"]');
    this.clearHistoryButton = page.locator('button[title="Limpiar historial"]');

    // Chat
    this.messageInput = page.locator('input[placeholder*="mensaje"]');
    this.sendButton = this.panel.locator('button[type="submit"]');

    // Messages
    this.messageList = this.panel.locator('.overflow-y-auto').first();
    this.userMessages = this.panel.locator('.bg-violet-600\\/20');
    this.assistantMessages = this.panel.locator('.bg-zinc-800');

    // Suggestions: the suggestion buttons in the panel footer area
    this.suggestionsContainer = this.panel.locator('.flex.flex-wrap.gap-1\\.5');
    this.suggestionButtons = this.panel.locator('button').filter({ hasText: /^(?!CatBot).{3,}$/ });

    // Welcome
    this.welcomeText = page.getByText('Hola! Soy');
  }

  async open() {
    // Only open if trigger button is visible (panel is closed)
    if (await this.triggerButton.isVisible()) {
      await this.triggerButton.click();
      await this.panel.waitFor({ state: 'visible' });
    }
  }

  async close() {
    if (await this.closeButton.isVisible()) {
      await this.closeButton.click();
      await this.triggerButton.waitFor({ state: 'visible' });
    }
  }

  async sendMessage(text: string) {
    await this.messageInput.fill(text);
    await this.sendButton.click();
  }

  async getSuggestions(): Promise<string[]> {
    const buttons = this.suggestionsContainer.locator('button');
    const count = await buttons.count();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await buttons.nth(i).textContent();
      if (text) texts.push(text.trim());
    }
    return texts;
  }

  async isOpen(): Promise<boolean> {
    return this.panel.isVisible();
  }

  async isClosed(): Promise<boolean> {
    return this.triggerButton.isVisible();
  }
}
