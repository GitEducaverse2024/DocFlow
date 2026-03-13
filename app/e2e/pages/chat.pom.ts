import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class ChatPOM extends BasePage {
  /** The message input field */
  readonly messageInput: Locator;
  /** Send button (gradient violet button with Send icon) */
  readonly sendButton: Locator;
  /** Stop streaming button */
  readonly stopButton: Locator;
  /** Container for all chat messages */
  readonly messagesContainer: Locator;
  /** Example questions section header */
  readonly exampleQuestionsLabel: Locator;
  /** Individual example question buttons */
  readonly exampleQuestions: Locator;
  /** The welcome heading when chat is empty */
  readonly welcomeHeading: Locator;
  /** Streaming indicator ("Pensando...") */
  readonly streamingIndicator: Locator;
  /** Streaming cursor area (has streaming-cursor class) */
  readonly streamingCursor: Locator;
  /** Bot message bubbles (assistant responses) */
  readonly botMessages: Locator;
  /** User message bubbles */
  readonly userMessages: Locator;
  /** "Chat not available" message when RAG not enabled */
  readonly chatUnavailableMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.messageInput = page.getByPlaceholder('Pregunta algo sobre la documentacion del proyecto...');
    this.sendButton = page.locator('button:has(svg.lucide-send)');
    this.stopButton = page.getByRole('button', { name: 'Parar generacion' });
    this.messagesContainer = page.locator('.overflow-y-auto').first();
    this.exampleQuestionsLabel = page.getByText('Ejemplos de preguntas');
    this.exampleQuestions = page.locator('button', { hasText: /Cuales son las tecnologias|Resume los puntos clave|Que riesgos se identificaron/ });
    this.welcomeHeading = page.getByText('Tu asistente esta listo');
    this.streamingIndicator = page.getByText('Pensando...');
    this.streamingCursor = page.locator('.streaming-cursor');
    this.botMessages = page.locator('.bg-zinc-800.rounded-tl-none');
    this.userMessages = page.locator('.bg-violet-600.rounded-tr-none');
    this.chatUnavailableMessage = page.getByText('El chat no esta disponible');
  }

  /** Navigate to a project's chat tab */
  async navigateToProjectChat(projectId: string) {
    await this.navigateTo(`/projects/${projectId}`);
    // Click the chat tab
    const chatTab = this.page.locator('[value="chat"]');
    if (await chatTab.isVisible()) {
      await chatTab.click();
    }
  }

  /** Type a message and send it */
  async sendMessage(text: string) {
    await this.messageInput.fill(text);
    await this.sendButton.click();
  }

  /** Click an example question by its text */
  async clickExampleQuestion(questionText: string) {
    await this.page.getByText(questionText, { exact: false }).click();
  }

  /** Get the count of bot messages displayed */
  async getBotMessageCount(): Promise<number> {
    return this.botMessages.count();
  }

  /** Get the count of user messages displayed */
  async getUserMessageCount(): Promise<number> {
    return this.userMessages.count();
  }
}
