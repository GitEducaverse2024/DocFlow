import db from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Telegram API types
// ---------------------------------------------------------------------------

interface TelegramUser {
  id: number;
  username?: string;
  first_name: string;
}

interface TelegramChat {
  id: number;
  type: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  date: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramConfig {
  id: number;
  token_encrypted: string | null;
  bot_username: string | null;
  status: 'active' | 'paused' | 'inactive';
  authorized_usernames: string;
  authorized_chat_ids: string;
  permissions_no_sudo: string;
  messages_count: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TELEGRAM_API = 'https://api.telegram.org/bot';
const POLL_TIMEOUT = 25; // seconds — Telegram long-poll
const RETRY_DELAY_MS = 10_000; // 10s back-off on error
const MAX_MESSAGE_LENGTH = 4096; // Telegram message char limit

const WELCOME_MESSAGE = `\u{1F43E} \u{00A1}Hola! Soy CatBot, el asistente de DoCatFlow.

Desde aqui puedes:
\u{2022} Consultar tus CatBrains y documentacion
\u{2022} Ver el estado del sistema y metricas
\u{2022} Ejecutar Canvas y CatFlows
\u{2022} Crear y gestionar agentes, tareas y conectores

Para operaciones sensibles necesitaras activar sudo:
/sudo tuclave

\u{00BF}En que puedo ayudarte?`;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class TelegramBotService {
  private running = false;
  private paused = false;
  private offset = 0;
  private token: string | null = null;

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  /**
   * Start the bot polling loop.
   * Idempotent: calling multiple times is safe.
   * SVC-06: auto-starts only when token is configured and status = 'active'.
   */
  async start(): Promise<void> {
    if (this.running) return;

    const config = this.loadConfig();
    if (!config || !config.token_encrypted || config.status !== 'active') {
      logger.info('telegram', 'TelegramBotService skipped (no active config)');
      return;
    }

    try {
      this.token = decrypt(config.token_encrypted);
    } catch (err) {
      logger.error('telegram', 'Failed to decrypt bot token', { error: (err as Error).message });
      return;
    }

    this.running = true;
    this.paused = false;
    logger.info('telegram', 'TelegramBotService started', { bot: config.bot_username });

    // Fire-and-forget — pollLoop runs until stop() is called
    this.pollLoop().catch((err) => {
      logger.error('telegram', 'Poll loop crashed unexpectedly', { error: (err as Error).message });
      this.running = false;
    });
  }

  /**
   * Gracefully stop the polling loop.
   */
  stop(): void {
    this.running = false;
    this.paused = false;
    this.token = null;
    logger.info('telegram', 'TelegramBotService stopped');
  }

  /**
   * SVC-05: pause polling without clearing state.
   */
  pause(): void {
    this.paused = true;
    logger.info('telegram', 'TelegramBotService paused');
  }

  /**
   * SVC-05: resume after a pause.
   */
  resume(): void {
    if (!this.running) {
      // Not started yet — do a full start
      this.start();
      return;
    }
    this.paused = false;
    logger.info('telegram', 'TelegramBotService resumed');
  }

  /** Expose running state for status endpoints. */
  isRunning(): boolean {
    return this.running && !this.paused;
  }

  // ------------------------------------------------------------------
  // DB helpers
  // ------------------------------------------------------------------

  private loadConfig(): TelegramConfig | null {
    try {
      return db.prepare('SELECT * FROM telegram_config WHERE id = 1').get() as TelegramConfig | undefined ?? null;
    } catch {
      return null;
    }
  }

  private incrementMessageCount(): void {
    try {
      db.prepare(
        "UPDATE telegram_config SET messages_count = messages_count + 1, last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = 1"
      ).run();
    } catch (err) {
      logger.error('telegram', 'Failed to update message count', { error: (err as Error).message });
    }
  }

  // ------------------------------------------------------------------
  // Polling loop (SVC-02, SVC-03, SVC-04)
  // ------------------------------------------------------------------

  private async pollLoop(): Promise<void> {
    while (this.running) {
      // SVC-05: if paused, sleep briefly and re-check
      if (this.paused) {
        await this.sleep(1_000);
        continue;
      }

      try {
        const updates = await this.getUpdates();

        // SVC-03: process one at a time (sequential)
        for (const update of updates) {
          if (!this.running) break;
          try {
            await this.processUpdate(update);
          } catch (procErr) {
            logger.error('telegram', 'Error processing update', {
              updateId: update.update_id,
              error: (procErr as Error).message,
            });
          }
          this.offset = update.update_id + 1;
        }
      } catch (err) {
        // SVC-04: retry after 10s back-off
        logger.error('telegram', 'Polling error', { error: (err as Error).message });
        await this.sleep(RETRY_DELAY_MS);
      }
    }
  }

  /**
   * SVC-02: long-poll Telegram getUpdates endpoint.
   */
  private async getUpdates(): Promise<TelegramUpdate[]> {
    const url = `${TELEGRAM_API}${this.token}/getUpdates?offset=${this.offset}&timeout=${POLL_TIMEOUT}`;

    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout((POLL_TIMEOUT + 5) * 1000), // slightly longer than Telegram timeout
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Telegram API error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as { ok: boolean; result: TelegramUpdate[] };
    if (!data.ok) {
      throw new Error('Telegram getUpdates returned ok=false');
    }

    return data.result;
  }

  // ------------------------------------------------------------------
  // Update processing (SVC-07, SVC-08)
  // ------------------------------------------------------------------

  private async processUpdate(update: TelegramUpdate): Promise<void> {
    const msg = update.message;
    if (!msg || !msg.text) return; // ignore non-text updates

    const chatId = msg.chat.id;
    const username = msg.from?.username ?? '';
    const text = msg.text.trim();

    // SVC-07: whitelist check
    if (!this.isAuthorized(chatId, username)) {
      await this.sendMessage(chatId, 'No tienes acceso a este bot. Contacta al administrador.');
      return;
    }

    // Increment stats
    this.incrementMessageCount();

    // SVC-08: /start command
    if (text === '/start') {
      await this.sendMessage(chatId, WELCOME_MESSAGE);
      return;
    }

    // Phase 95 placeholder — CatBot integration is Phase 96
    await this.sendMessage(chatId, 'Mensaje recibido. La integracion con CatBot estara disponible pronto.');
  }

  /**
   * SVC-07: check if a user is authorized by chat_id or @username.
   * If both whitelist arrays are empty, nobody is authorized (must configure first).
   */
  private isAuthorized(chatId: number, username: string): boolean {
    const config = this.loadConfig();
    if (!config) return false;

    let chatIds: number[] = [];
    let usernames: string[] = [];

    try { chatIds = JSON.parse(config.authorized_chat_ids); } catch { /* empty */ }
    try { usernames = JSON.parse(config.authorized_usernames); } catch { /* empty */ }

    // If both lists empty, no one is authorized
    if (chatIds.length === 0 && usernames.length === 0) return false;

    if (chatIds.includes(chatId)) return true;
    if (username && usernames.includes(username)) return true;

    return false;
  }

  // ------------------------------------------------------------------
  // Sending messages (SVC-09)
  // ------------------------------------------------------------------

  /**
   * Send a text message. Splits into chunks if > 4096 chars (SVC-09).
   */
  async sendMessage(chatId: number, text: string): Promise<void> {
    const chunks = this.splitMessage(text);

    for (const chunk of chunks) {
      await this.sendRawMessage(chatId, chunk);
    }
  }

  private async sendRawMessage(chatId: number, text: string): Promise<void> {
    const url = `${TELEGRAM_API}${this.token}/sendMessage`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });

    if (!res.ok) {
      // Retry without parse_mode if Markdown fails (common with unescaped chars)
      const errorBody = await res.text().catch(() => '');
      if (res.status === 400 && errorBody.includes("can't parse")) {
        const retryRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
        });
        if (!retryRes.ok) {
          logger.error('telegram', 'sendMessage failed (retry)', { chatId, status: retryRes.status });
        }
        return;
      }
      logger.error('telegram', 'sendMessage failed', { chatId, status: res.status, body: errorBody });
    }
  }

  /**
   * Delete a message (used by sudo handler in Phase 96).
   */
  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    const url = `${TELEGRAM_API}${this.token}/deleteMessage`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });

    if (!res.ok) {
      logger.error('telegram', 'deleteMessage failed', { chatId, messageId, status: res.status });
    }
  }

  /**
   * SVC-09: split text into chunks of max 4096 chars.
   * Tries to split at newlines to keep messages readable.
   */
  private splitMessage(text: string): string[] {
    if (text.length <= MAX_MESSAGE_LENGTH) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_MESSAGE_LENGTH) {
        chunks.push(remaining);
        break;
      }

      // Find last newline within the limit
      let splitAt = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
      if (splitAt <= 0) {
        // No newline found — split at space
        splitAt = remaining.lastIndexOf(' ', MAX_MESSAGE_LENGTH);
      }
      if (splitAt <= 0) {
        // No space found — hard split
        splitAt = MAX_MESSAGE_LENGTH;
      }

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }

    return chunks;
  }

  // ------------------------------------------------------------------
  // Utility
  // ------------------------------------------------------------------

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const telegramBotService = new TelegramBotService();
