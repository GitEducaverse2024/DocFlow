/**
 * Executes Gmail tool calls directly (no HTTP self-fetch).
 * Used by the CatPaw chat route's tool-calling loop.
 */
import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { generateId } from '@/lib/utils';
import { GmailConfig } from '@/lib/types';
import { listEmails, readEmail, searchEmails, draftEmail, markAsRead, replyToMessage } from '@/lib/services/gmail-reader';
import { sendEmail } from '@/lib/services/email-service';
import type { GmailToolDispatch } from './catpaw-gmail-tools';

interface ConnectorRow {
  id: string;
  type: string;
  config: string | null;
  is_active: number;
}

/**
 * Execute a Gmail tool call directly, returning the result as a string for the LLM.
 */
export async function executeGmailToolCall(
  pawId: string,
  dispatch: GmailToolDispatch,
  args: Record<string, unknown>,
): Promise<string> {
  const startTime = Date.now();
  const { connectorId, operation } = dispatch;

  // Load connector
  const connector = db.prepare(
    'SELECT * FROM connectors WHERE id = ? AND is_active = 1'
  ).get(connectorId) as ConnectorRow | undefined;

  if (!connector) {
    return JSON.stringify({ error: 'Conector Gmail no encontrado o inactivo' });
  }
  if (connector.type !== 'gmail') {
    return JSON.stringify({ error: 'Conector no es de tipo Gmail' });
  }

  const config: GmailConfig = connector.config ? JSON.parse(connector.config) : {};

  try {
    let result: unknown;

    switch (operation) {
      case 'list_emails': {
        result = await listEmails(config, {
          folder: args.folder as string,
          limit: (args.limit as number) || 10,
        });
        break;
      }
      case 'search_emails': {
        const query = args.query as string;
        if (!query) return JSON.stringify({ error: 'query es requerido para search_emails' });
        result = await searchEmails(config, query, (args.limit as number) || 10);
        break;
      }
      case 'read_email': {
        const messageId = args.messageId as string;
        if (!messageId) return JSON.stringify({ error: 'messageId es requerido para read_email' });
        result = await readEmail(config, messageId);
        break;
      }
      case 'draft_email': {
        const to = args.to as string;
        const subject = args.subject as string;
        const body = args.body as string;
        if (!to || !subject || !body) return JSON.stringify({ error: 'to, subject y body son requeridos' });
        result = await draftEmail(config, { to, subject, body });
        break;
      }
      case 'send_email': {
        const to = args.to as string;
        const subject = args.subject as string;
        const body = args.body as string;
        const htmlBody = args.html_body as string | undefined;
        const cc = args.cc as string[] | undefined;
        if (!to || !subject) return JSON.stringify({ error: 'to y subject son requeridos' });
        result = await sendEmail(config, {
          to,
          subject,
          ...(htmlBody ? { html_body: htmlBody } : { text_body: body || undefined }),
          ...(cc && cc.length > 0 ? { cc } : {}),
        });
        break;
      }
      case 'mark_as_read': {
        const messageId = args.messageId as string;
        if (!messageId) return JSON.stringify({ error: 'messageId es requerido para mark_as_read' });
        result = await markAsRead(config, messageId);
        break;
      }
      case 'reply_to_message': {
        const threadId = args.threadId as string;
        const messageId = args.messageId as string;
        const to = args.to as string;
        const subject = args.subject as string;
        const body = args.body as string;
        const htmlBody = args.html_body as string | undefined;
        const cc = args.cc as string[] | undefined;
        if (!threadId || !messageId || !to || !subject || !body) {
          return JSON.stringify({ error: 'threadId, messageId, to, subject y body son requeridos' });
        }
        result = await replyToMessage(config, { threadId, messageId, to, subject, body, html_body: htmlBody, cc });
        break;
      }
      default:
        return JSON.stringify({ error: `Operacion Gmail desconocida: ${operation}` });
    }

    // Log to connector_logs
    const durationMs = Date.now() - startTime;
    try {
      db.prepare(
        'INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        generateId(), connectorId,
        JSON.stringify({ operation, pawId }),
        JSON.stringify({ ok: true }),
        'success', durationMs, new Date().toISOString()
      );
    } catch (logErr) {
      logger.error('cat-paws', 'Error logging Gmail tool call', { error: (logErr as Error).message });
    }

    // Update times_used
    try {
      db.prepare('UPDATE connectors SET times_used = times_used + 1, updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), connectorId);
    } catch { /* ignore */ }

    const resultStr = JSON.stringify(result);
    return resultStr.length > 10_000 ? resultStr.slice(0, 10_000) + '... [truncado]' : resultStr;
  } catch (err) {
    const errMsg = (err as Error).message;
    logger.error('cat-paws', 'Gmail tool execution error', {
      pawId, connectorId, operation, error: errMsg,
    });

    // Log failure
    try {
      db.prepare(
        'INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        generateId(), connectorId,
        JSON.stringify({ operation, pawId }),
        JSON.stringify({ ok: false }),
        'failed', Date.now() - startTime, errMsg.substring(0, 5000), new Date().toISOString()
      );
    } catch { /* ignore */ }

    return JSON.stringify({ error: errMsg });
  }
}
