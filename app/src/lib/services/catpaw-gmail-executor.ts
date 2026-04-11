/**
 * Executes Gmail tool calls directly (no HTTP self-fetch).
 * Used by the CatPaw chat route's tool-calling loop.
 */
import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { generateId } from '@/lib/utils';
import { GmailConfig } from '@/lib/types';
import { listEmails, readEmail, searchEmails, draftEmail, markAsRead, replyToMessage, getThread } from '@/lib/services/gmail-reader';
import { sendEmail } from '@/lib/services/email-service';
import type { GmailToolDispatch } from './catpaw-gmail-tools';

interface ConnectorRow {
  id: string;
  type: string;
  config: string | null;
  is_active: number;
}

/**
 * INC-13 closure — stringify with a hard cap so log rows do not blow up on
 * large email bodies or search result arrays.
 */
function safeStringify(value: unknown): string {
  try {
    const s = JSON.stringify(value);
    if (s == null) return '';
    return s.length > 10_000 ? s.slice(0, 10_000) + '"...[truncado]"' : s;
  } catch {
    return '{"error":"unstringifiable"}';
  }
}

/**
 * INC-13 closure + redaction policy — for send_email replace body / html_body
 * with their length (keep to/subject/cc as-is) and strip any incoming token /
 * credential field. See .planning/knowledge/connector-logs-redaction-policy.md
 */
function redactAndTrimArgs(args: Record<string, unknown>): Record<string, unknown> {
  const REDACT_KEYS = new Set([
    'access_token', 'refresh_token', 'api_key', 'password', 'client_secret',
    'authorization', 'cookie', 'oauth_token',
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
      continue;
    }
    if (k === 'body' || k === 'html_body') {
      if (typeof v === 'string') {
        out[`${k}_len`] = v.length;
      }
      continue;
    }
    if (typeof v === 'string' && v.length > 10_000) {
      out[k] = v.slice(0, 10_000) + '...[truncado]';
    } else {
      out[k] = v;
    }
  }
  return out;
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
        // INC-12 closure — validación estricta + messageId mandatorio en response.
        const to = args.to as string | undefined;
        const subject = args.subject as string | undefined;
        const body = args.body as string | undefined;
        const htmlBody = args.html_body as string | undefined;
        const cc = args.cc as string[] | undefined;

        if (!to || !to.trim()) {
          return JSON.stringify({ error: 'send_email: field "to" is required and non-empty' });
        }
        if (!subject || !subject.trim()) {
          return JSON.stringify({ error: 'send_email: field "subject" is required and non-empty' });
        }
        if ((!body || !body.trim()) && (!htmlBody || !htmlBody.trim())) {
          return JSON.stringify({
            error: 'send_email: at least one of "body" or "html_body" is required and non-empty',
          });
        }

        result = await sendEmail(config, {
          to,
          subject,
          ...(htmlBody ? { html_body: htmlBody } : {}),
          ...(body ? { text_body: body } : {}),
          ...(cc && cc.length > 0 ? { cc } : {}),
        });

        // INC-12 — messageId es mandatorio. Sin él, el envío NO se considera exitoso.
        const sendResult = result as { ok?: boolean; messageId?: string; error?: string };
        if (!sendResult || !sendResult.messageId) {
          return JSON.stringify({
            error: 'send_email: el conector no devolvió messageId; envío considerado fallido',
            raw_response: sendResult,
          });
        }
        break;
      }
      case 'get_thread': {
        const threadId = args.threadId as string;
        if (!threadId) return JSON.stringify({ error: 'threadId es requerido para get_thread' });
        const checkReplyFrom = args.checkReplyFrom as string | undefined;
        result = await getThread(config, threadId, checkReplyFrom);
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

    // INC-13 closure — rich log payloads for post-mortem.
    const durationMs = Date.now() - startTime;
    try {
      db.prepare(
        'INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        generateId(), connectorId,
        safeStringify({ operation, pawId, args: redactAndTrimArgs(args) }),
        safeStringify(result),
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

    // INC-13 closure — rich log on failure path too.
    try {
      db.prepare(
        'INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        generateId(), connectorId,
        safeStringify({ operation, pawId, args: redactAndTrimArgs(args) }),
        safeStringify({ ok: false, error: errMsg }),
        'failed', Date.now() - startTime, errMsg.substring(0, 5000), new Date().toISOString()
      );
    } catch { /* ignore */ }

    return JSON.stringify({ error: errMsg });
  }
}
