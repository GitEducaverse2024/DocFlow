import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { generateId } from '@/lib/utils';
import { GmailConfig } from '@/lib/types';
import { listEmails, readEmail, searchEmails, draftEmail } from '@/lib/services/gmail-reader';
import { sendEmail } from '@/lib/services/email-service';

export const dynamic = 'force-dynamic';

interface ConnectorRow {
  id: string;
  type: string;
  config: string | null;
  is_active: number;
}

interface PawConnectorRow {
  connector_id: string;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const startTime = Date.now();

  try {
    const { id } = await params;
    const body = await request.json();
    const { connectorId, operation, params: opParams } = body;

    if (!connectorId || !operation) {
      return NextResponse.json({ error: 'connectorId y operation son requeridos' }, { status: 400 });
    }

    // Verify CatPaw exists
    const paw = db.prepare('SELECT id, name FROM cat_paws WHERE id = ?').get(id) as { id: string; name: string } | undefined;
    if (!paw) {
      return NextResponse.json({ error: 'CatPaw no encontrado' }, { status: 404 });
    }

    // Verify connector is linked to this CatPaw
    const relation = db.prepare(
      'SELECT connector_id FROM cat_paw_connectors WHERE paw_id = ? AND connector_id = ? AND is_active = 1'
    ).get(id, connectorId) as PawConnectorRow | undefined;
    if (!relation) {
      return NextResponse.json({ error: 'Conector no vinculado a este CatPaw' }, { status: 403 });
    }

    // Load connector and parse config
    const connector = db.prepare(
      'SELECT * FROM connectors WHERE id = ? AND is_active = 1'
    ).get(connectorId) as ConnectorRow | undefined;
    if (!connector) {
      return NextResponse.json({ error: 'Conector no encontrado o inactivo' }, { status: 404 });
    }
    if (connector.type !== 'gmail') {
      return NextResponse.json({ error: 'Conector no es de tipo Gmail' }, { status: 400 });
    }

    const config: GmailConfig = connector.config ? JSON.parse(connector.config) : {};

    logger.info('cat-paws', 'Gmail operation', {
      pawId: id, connectorId, operation,
    });

    let result: unknown;

    switch (operation) {
      case 'list_emails': {
        const { folder, limit } = opParams || {};
        result = await listEmails(config, { folder, limit: limit || 10 });
        break;
      }

      case 'search_emails': {
        const { query, limit } = opParams || {};
        if (!query) {
          return NextResponse.json({ error: 'query es requerido para search_emails' }, { status: 400 });
        }
        result = await searchEmails(config, query, limit || 10);
        break;
      }

      case 'read_email': {
        const { messageId } = opParams || {};
        if (!messageId) {
          return NextResponse.json({ error: 'messageId es requerido para read_email' }, { status: 400 });
        }
        result = await readEmail(config, messageId);
        break;
      }

      case 'draft_email': {
        const { to, subject, body: emailBody } = opParams || {};
        if (!to || !subject || !emailBody) {
          return NextResponse.json({ error: 'to, subject y body son requeridos para draft_email' }, { status: 400 });
        }
        result = await draftEmail(config, { to, subject, body: emailBody });
        break;
      }

      case 'send_email': {
        const { to, subject, body: emailBody, html_body } = opParams || {};
        if (!to || !subject) {
          return NextResponse.json({ error: 'to y subject son requeridos para send_email' }, { status: 400 });
        }
        result = await sendEmail(config, {
          to,
          subject,
          html_body: html_body || undefined,
          text_body: emailBody || undefined,
        });
        break;
      }

      default:
        return NextResponse.json({ error: `Operacion desconocida: ${operation}` }, { status: 400 });
    }

    // Log to connector_logs (without credentials)
    const durationMs = Date.now() - startTime;
    try {
      db.prepare(
        'INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        generateId(),
        connectorId,
        JSON.stringify({ operation, params: { ...opParams, password: undefined, credentials: undefined } }),
        JSON.stringify({ ok: true }),
        'success',
        durationMs,
        new Date().toISOString()
      );
    } catch (logErr) {
      logger.error('cat-paws', 'Error logging Gmail operation', { error: (logErr as Error).message });
    }

    // Update times_used
    try {
      db.prepare('UPDATE connectors SET times_used = times_used + 1, updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), connectorId);
    } catch { /* ignore */ }

    return NextResponse.json({ ok: true, operation, result });
  } catch (err) {
    const error = err as Error;
    logger.error('cat-paws', 'Gmail operation error', { error: error.message });

    return NextResponse.json({
      ok: false,
      error: error.message,
    }, { status: 500 });
  }
}
