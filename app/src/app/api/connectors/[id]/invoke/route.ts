import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { sendEmail } from '@/lib/services/email-service';
import { Connector, GmailConfig, EmailPayload } from '@/lib/types';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Parse the pipeline output into an EmailPayload.
 * Strategy 1: JSON with to+subject fields -> use as EmailPayload
 * Strategy 2: JSON without email fields -> fallback with output as body
 * Strategy 3: Plain text -> fallback with text as body
 */
function parseOutputToPayload(output: string, fallbackTo: string): EmailPayload {
  const dateStr = new Date().toLocaleString('es-ES');
  const fallbackSubject = `DoCatFlow — Resultado del ${dateStr}`;

  try {
    const parsed = JSON.parse(output);
    if (parsed && typeof parsed === 'object' && parsed.to && parsed.subject) {
      return {
        to: parsed.to,
        subject: parsed.subject,
        ...(parsed.html_body ? { html_body: parsed.html_body } : {}),
        ...(parsed.text_body ? { text_body: parsed.text_body } : {}),
        ...(parsed.reply_to ? { reply_to: parsed.reply_to } : {}),
      } as EmailPayload;
    }
    // JSON but no email fields — fallback
    return {
      to: fallbackTo,
      subject: fallbackSubject,
      text_body: output,
    };
  } catch {
    // Not JSON — plain text fallback
    return {
      to: fallbackTo,
      subject: fallbackSubject,
      text_body: output,
    };
  }
}

/**
 * Sanitize request payload for logging (remove credentials).
 */
function sanitizeForLog(payload: Record<string, unknown>): string {
  const safe = { ...payload };
  delete safe.app_password;
  delete safe.app_password_encrypted;
  delete safe.client_secret;
  delete safe.client_secret_encrypted;
  delete safe.refresh_token;
  delete safe.refresh_token_encrypted;
  return JSON.stringify(safe);
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { output } = body;

    if (!output || typeof output !== 'string') {
      return NextResponse.json({ ok: false, error: 'output (string) es requerido' }, { status: 400 });
    }

    // Load connector
    const connector = db.prepare('SELECT * FROM connectors WHERE id = ?').get(params.id) as Connector | undefined;
    if (!connector) {
      return NextResponse.json({ ok: false, error: 'Conector no encontrado' }, { status: 404 });
    }

    if (!connector.is_active) {
      return NextResponse.json({ ok: false, error: 'Conector esta desactivado' }, { status: 400 });
    }

    if (connector.type !== 'gmail') {
      return NextResponse.json({ ok: false, error: 'Solo conectores tipo gmail soportan invoke' }, { status: 400 });
    }

    // Parse config
    const config = connector.config ? JSON.parse(connector.config) as GmailConfig : null;
    if (!config) {
      return NextResponse.json({ ok: false, error: 'Conector sin configuracion' }, { status: 400 });
    }

    // Build email payload
    const payload = parseOutputToPayload(output, config.user);

    logger.info('connectors', 'Invoking gmail connector', {
      connectorId: params.id,
      to: Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
      subject: payload.subject,
    });

    // Send email
    const result = await sendEmail(config, payload);
    const durationMs = Date.now() - startTime;

    // Log to connector_logs
    const logId = uuidv4();
    const now = new Date().toISOString();
    try {
      db.prepare(`
        INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, error_message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        logId,
        params.id,
        sanitizeForLog({ to: payload.to, subject: payload.subject, output_length: output.length }),
        JSON.stringify({ ok: result.ok, messageId: result.messageId }),
        result.ok ? 'success' : 'failed',
        durationMs,
        result.error || null,
        now
      );
    } catch (logErr) {
      logger.error('connectors', 'Error logging connector invocation', { error: (logErr as Error).message });
    }

    // Increment times_used
    try {
      db.prepare('UPDATE connectors SET times_used = times_used + 1, updated_at = ? WHERE id = ?')
        .run(now, params.id);
    } catch (updateErr) {
      logger.error('connectors', 'Error updating times_used', { error: (updateErr as Error).message });
    }

    if (result.ok) {
      return NextResponse.json({
        ok: true,
        messageId: result.messageId,
        to: Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
        subject: payload.subject,
      });
    }

    return NextResponse.json({ ok: false, error: result.error });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('connectors', 'Error invoking connector', {
      connectorId: params.id,
      durationMs,
      error: (error as Error).message,
    });
    return NextResponse.json({ ok: false, error: 'Error interno del servidor' }, { status: 500 });
  }
}
