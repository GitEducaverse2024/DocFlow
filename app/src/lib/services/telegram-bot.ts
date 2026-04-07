import crypto from 'crypto';
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

const SUDO_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 min lockout (SUDO-05)
const SUDO_MAX_FAILURES = 5;

const WELCOME_MESSAGE = `\u{1F43E} \u{00A1}Hola! Soy CatBot, el asistente de DoCatFlow.

Desde aqui puedes:
\u{2022} Consultar tus CatBrains y documentacion
\u{2022} Ver el estado del sistema y metricas
\u{2022} Ejecutar Canvas y CatFlows
\u{2022} Crear y gestionar agentes, tareas y conectores

Para operaciones sensibles necesitaras activar sudo:
/sudo tuclave

\u{00BF}En que puedo ayudarte?`;

const SUDO_REQUIRED_MESSAGE = `\u{1F512} Esta accion requiere autorizacion sudo.
Responde con /sudo seguido de tu clave.
Ejemplo: /sudo miclaveaqui`;

interface SudoConfig {
  enabled: boolean;
  hash: string;
  duration_minutes: number;
  protected_actions: string[];
}

interface CatBotResponse {
  reply?: string;
  content?: string;
  message?: string;
  tool_calls?: Array<{ name: string; args: Record<string, unknown>; result: unknown; sudo?: boolean }>;
  actions?: Array<{ type: string; url: string; label: string }>;
  sudo_required?: boolean;
  sudo_active?: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class TelegramBotService {
  private running = false;
  private paused = false;
  private offset = 0;
  private token: string | null = null;

  // SUDO-01, SUDO-03: in-memory sudo sessions per chat_id
  private sudoSessions: Map<number, number> = new Map(); // chat_id → expires_at_ms
  // SUDO-05: failure tracking per chat_id
  private sudoFailures: Map<number, { count: number; blockedUntil: number }> = new Map();

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

    // Clear any stale webhook or ghost polling session before starting
    try {
      const delRes = await fetch(`${TELEGRAM_API}${this.token}/deleteWebhook`, { method: 'POST' });
      if (!delRes.ok) logger.warn('telegram', 'deleteWebhook failed', { status: delRes.status });
    } catch (err) {
      logger.warn('telegram', 'deleteWebhook error (non-fatal)', { error: (err as Error).message });
    }

    logger.info('telegram', 'TelegramBotService started', { bot: config.bot_username });

    // Fire-and-forget — pollLoop runs until stop() is called
    // Auto-restart on crash after 5s delay
    this.pollLoop().catch((err) => {
      logger.error('telegram', 'Poll loop crashed — will auto-restart in 5s', { error: (err as Error).message });
      this.running = false;
      setTimeout(() => {
        logger.info('telegram', 'Auto-restarting poll loop after crash');
        this.running = false; // reset so start() can proceed
        this.start();
      }, 5_000);
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
    let cycleCount = 0;

    while (this.running) {
      // SVC-05: if paused, sleep briefly and re-check
      if (this.paused) {
        await this.sleep(1_000);
        continue;
      }

      try {
        cycleCount++;
        // Heartbeat log every 100 cycles (~40 min at 25s poll timeout)
        if (cycleCount % 100 === 1) {
          logger.info('telegram', 'Poll loop alive', { cycle: cycleCount, offset: this.offset });
        }

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
        // Catch EVERYTHING — never let the loop die
        logger.error('telegram', 'Polling error — retrying in 10s', { error: (err as Error).message });
        await this.sleep(RETRY_DELAY_MS);
      }
    }

    logger.info('telegram', 'Poll loop exited', { reason: this.running ? 'unknown' : 'stopped' });
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

    // SUDO-01: handle /sudo command
    if (text.startsWith('/sudo')) {
      await this.handleSudo(chatId, msg.message_id, text);
      return;
    }

    // INT-01: Forward message to CatBot endpoint
    await this.handleCatBotMessage(chatId, text);
  }

  // ------------------------------------------------------------------
  // Sudo system (SUDO-01..06)
  // ------------------------------------------------------------------

  /**
   * SUDO-01: Handle /sudo {key} command.
   * Validates scrypt password against catbot_sudo settings.
   */
  private async handleSudo(chatId: number, messageId: number, text: string): Promise<void> {
    // SUDO-04: Always try to delete the /sudo message to hide the password
    this.deleteMessage(chatId, messageId).catch(() => {
      // Silently ignore — bot may not have delete permissions
    });

    // Extract key from "/sudo {key}"
    const key = text.slice('/sudo'.length).trim();
    if (!key) {
      await this.sendMessage(chatId, 'Uso: /sudo tuclave');
      return;
    }

    // SUDO-05: Check if chat_id is locked out
    const failure = this.sudoFailures.get(chatId);
    if (failure && failure.blockedUntil > Date.now()) {
      const remainMin = Math.ceil((failure.blockedUntil - Date.now()) / 60_000);
      await this.sendMessage(chatId, `\u{1F6AB} Demasiados intentos fallidos. Bloqueado por ${remainMin} minuto(s).`);
      return;
    }

    // SUDO-02: Load sudo config (same scrypt hash as web)
    const sudoConfig = this.getSudoConfig();
    if (!sudoConfig || !sudoConfig.enabled) {
      await this.sendMessage(chatId, '\u{26A0}\u{FE0F} El sistema sudo no esta configurado. Ve a Configuracion > CatBot > Seguridad en la web.');
      return;
    }

    // Validate password using scrypt with timing-safe comparison
    const valid = this.verifySudoPassword(key, sudoConfig.hash);

    if (valid) {
      // SUDO-01, SUDO-03: Activate session
      const durationMs = (sudoConfig.duration_minutes || 15) * 60 * 1000;
      this.sudoSessions.set(chatId, Date.now() + durationMs);
      // Clear failures on success
      this.sudoFailures.delete(chatId);

      logger.info('telegram', 'Sudo session activated', { chatId, durationMin: sudoConfig.duration_minutes });
      await this.sendMessage(chatId, `\u{2705} Autorizado. Sesion sudo activa ${sudoConfig.duration_minutes} minutos.`);
    } else {
      // SUDO-05: Increment failure count
      const entry = failure || { count: 0, blockedUntil: 0 };
      entry.count += 1;

      if (entry.count >= SUDO_MAX_FAILURES) {
        entry.blockedUntil = Date.now() + SUDO_LOCKOUT_DURATION_MS;
        this.sudoFailures.set(chatId, entry);
        logger.warn('telegram', 'Sudo lockout activated', { chatId, failures: entry.count });
        await this.sendMessage(chatId, `\u{1F6AB} Demasiados intentos fallidos. Bloqueado 15 minutos.`);
      } else {
        this.sudoFailures.set(chatId, entry);
        const remaining = SUDO_MAX_FAILURES - entry.count;
        await this.sendMessage(chatId, `\u{274C} Clave incorrecta. ${remaining} intento(s) restante(s).`);
      }
    }
  }

  /**
   * SUDO-03: Check if sudo session is active for a chat_id.
   */
  private isSudoActive(chatId: number): boolean {
    const expires = this.sudoSessions.get(chatId);
    if (!expires) return false;
    if (Date.now() > expires) {
      this.sudoSessions.delete(chatId);
      return false;
    }
    return true;
  }

  /**
   * SUDO-02: Load sudo config from settings (same as web).
   */
  private getSudoConfig(): SudoConfig | null {
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'catbot_sudo'").get() as { value: string } | undefined;
      if (!row) return null;
      return JSON.parse(row.value) as SudoConfig;
    } catch {
      return null;
    }
  }

  /**
   * SUDO-02: Verify password using scrypt with timing-safe comparison.
   * Matches the pattern from lib/sudo.ts verifyPassword().
   */
  private verifySudoPassword(password: string, storedHash: string): boolean {
    try {
      const [salt, hash] = storedHash.split(':');
      if (!salt || !hash) return false;
      const derived = crypto.scryptSync(password, salt, 64).toString('hex');
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Permission gate — pre-call intent detection
  // ------------------------------------------------------------------

  /**
   * Map operations (telegram_config.permissions_no_sudo) to keyword patterns.
   * If a message matches keywords for an operation NOT in permissions_no_sudo,
   * and sudo is not active, block and ask for /sudo.
   */
  private static readonly OPERATION_KEYWORDS: Record<string, RegExp> = {
    execute_canvas: /\b(ejecut[ao]r?|arranc[ao]r?|lanz[ao]r?|run|execute|start)\b.*\b(canvas|catflow|flujo|pipeline|workflow)\b/i,
    create_resources: /\b(cre[ao]r?|nuev[oa]|create|new)\b.*\b(agente|catpaw|tarea|task|conector|connector|catbrain|proyecto)\b/i,
    send_emails: /\b(envi[ao]r?|mand[ao]r?|send)\b.*\b(email|correo|mail)\b/i,
  };

  /**
   * Check if the message intends a protected operation.
   * Returns the operation name if blocked, null if allowed.
   */
  private checkPermissionGate(chatId: number, text: string): string | null {
    if (this.isSudoActive(chatId)) return null; // sudo active → everything allowed

    const config = this.loadConfig();
    if (!config) return null;

    let permissionsNoSudo: string[] = [];
    try { permissionsNoSudo = JSON.parse(config.permissions_no_sudo || '[]'); } catch { /* empty */ }
    if (!Array.isArray(permissionsNoSudo)) permissionsNoSudo = [];

    for (const [operation, pattern] of Object.entries(TelegramBotService.OPERATION_KEYWORDS)) {
      if (pattern.test(text) && !permissionsNoSudo.includes(operation)) {
        return operation;
      }
    }

    return null; // no protected operation detected, or it's allowed without sudo
  }

  // ------------------------------------------------------------------
  // CatBot integration (INT-01, INT-04, INT-05, INT-06)
  // ------------------------------------------------------------------

  /**
   * INT-01: Forward user message to /api/catbot/chat and send response back.
   */
  private async handleCatBotMessage(chatId: number, text: string): Promise<void> {
    // Permission gate: check BEFORE calling CatBot
    // Wrapped in its own try-catch so a failure here never kills the message flow
    try {
      const blockedOp = this.checkPermissionGate(chatId, text);
      if (blockedOp) {
        logger.info('telegram', 'Operation blocked — sudo required', { chatId, operation: blockedOp });
        await this.sendMessage(chatId, SUDO_REQUIRED_MESSAGE);
        return;
      }
    } catch (gateErr) {
      // Fail safe: if gate crashes, assume protected → ask for sudo
      logger.error('telegram', 'checkPermissionGate crashed — failing safe to sudo', { chatId, error: (gateErr as Error).message });
      if (!this.isSudoActive(chatId)) {
        await this.sendMessage(chatId, SUDO_REQUIRED_MESSAGE);
        return;
      }
      // sudo is active → proceed despite gate error
    }

    const baseUrl = process['env']['NEXTAUTH_URL'] || `http://localhost:${process['env']['PORT'] || 3000}`;
    const sudoActive = this.isSudoActive(chatId);

    try {
      const response = await fetch(`${baseUrl}/api/catbot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: text }],
          context: { page: 'telegram', channel: 'telegram' },
          channel: 'telegram',
          sudo_active: sudoActive,
          stream: false,
        }),
        signal: AbortSignal.timeout(60_000), // CatBot may use tools — allow 60s
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        logger.error('telegram', 'CatBot API error', { status: response.status, body: errorText });
        await this.sendMessage(chatId, '\u{26A0}\u{FE0F} Error conectando con CatBot. Intenta de nuevo.');
        return;
      }

      const data = (await response.json()) as CatBotResponse;

      // SUDO-06: If CatBot reports sudo_required, send the sudo prompt
      if (data.sudo_required) {
        await this.sendMessage(chatId, SUDO_REQUIRED_MESSAGE);
        return;
      }

      // INT-04, INT-05, INT-06: Adapt response for Telegram
      const adaptedText = this.adaptResponse(data);

      if (adaptedText) {
        await this.sendMessage(chatId, adaptedText);
      } else {
        await this.sendMessage(chatId, '\u{1F431} No tengo respuesta para eso. Intenta reformular tu pregunta.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.error('telegram', 'CatBot request failed', { error: msg });

      if (msg.includes('TimeoutError') || msg.includes('aborted')) {
        await this.sendMessage(chatId, '\u{23F3} La operacion tomo demasiado tiempo. Intenta de nuevo o simplifica la consulta.');
      } else {
        await this.sendMessage(chatId, '\u{26A0}\u{FE0F} Error procesando tu mensaje. Intenta de nuevo.');
      }
    }
  }

  /**
   * INT-04, INT-05, INT-06: Adapt CatBot response for Telegram format.
   */
  private adaptResponse(response: CatBotResponse): string {
    let text = response.reply || response.content || response.message || '';

    // INT-04: Convert navigation actions to text with route
    if (response.actions && response.actions.length > 0) {
      for (const action of response.actions) {
        if (action.type === 'navigate' && action.label && action.url) {
          text += `\n\n\u{1F517} ${action.label}: ${action.url}`;
        }
      }
    }

    // INT-05: Show tool calls as text with emoji (summary)
    if (response.tool_calls && response.tool_calls.length > 0) {
      const toolSummary = response.tool_calls
        .map(tc => `\u{1F527} ${tc.name}`)
        .join(', ');
      // Only append if the main text doesn't already mention the tools
      if (!text.includes(response.tool_calls[0].name)) {
        text += `\n\n_Herramientas usadas: ${toolSummary}_`;
      }
    }

    // INT-06: Adapt Markdown to Telegram format
    // Replace HTML tags that CatBot might include
    text = text.replace(/<strong>(.*?)<\/strong>/g, '*$1*');
    text = text.replace(/<em>(.*?)<\/em>/g, '_$1_');
    text = text.replace(/<code>(.*?)<\/code>/g, '`$1`');
    text = text.replace(/<br\s*\/?>/g, '\n');
    text = text.replace(/<[^>]+>/g, ''); // strip remaining HTML

    return text.trim();
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
