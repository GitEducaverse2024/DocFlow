import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { Connector, GoogleDriveConfig, DriveOperation } from '@/lib/types';
import { createDriveClient } from '@/lib/services/google-drive-auth';
import { listFiles, downloadFile, uploadFile, createFolder } from '@/lib/services/google-drive-service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { operation, folder_id, file_id, file_name, content, mime_type } = body as {
      operation: DriveOperation;
      folder_id?: string;
      file_id?: string;
      file_name?: string;
      content?: string;
      mime_type?: string;
    };

    if (!operation) {
      return NextResponse.json({ ok: false, error: 'operation es requerido (list, download, upload, create_folder)' }, { status: 400 });
    }

    const connector = db.prepare('SELECT * FROM connectors WHERE id = ?').get(params.id) as Connector | undefined;
    if (!connector) {
      return NextResponse.json({ ok: false, error: 'Conector no encontrado' }, { status: 404 });
    }
    if (connector.type !== 'google_drive') {
      return NextResponse.json({ ok: false, error: 'No es un conector Google Drive' }, { status: 400 });
    }
    if (!connector.is_active) {
      return NextResponse.json({ ok: false, error: 'Conector esta desactivado' }, { status: 400 });
    }

    const config: GoogleDriveConfig = connector.config ? JSON.parse(connector.config) : {};
    const drive = createDriveClient(config);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;

    switch (operation) {
      case 'list': {
        const targetFolder = folder_id || config.root_folder_id || 'root';
        result = await listFiles(drive, targetFolder);
        break;
      }
      case 'download': {
        if (!file_id) {
          return NextResponse.json({ ok: false, error: 'file_id es requerido para download' }, { status: 400 });
        }
        const downloaded = await downloadFile(drive, file_id, mime_type || 'application/octet-stream');
        result = {
          content: downloaded.content.toString('utf-8').substring(0, 10000),
          exportedMime: downloaded.exportedMime,
          size: downloaded.content.length,
        };
        break;
      }
      case 'upload': {
        if (!file_name || !content) {
          return NextResponse.json({ ok: false, error: 'file_name y content son requeridos para upload' }, { status: 400 });
        }
        const targetFolder = folder_id || config.root_folder_id || 'root';
        result = await uploadFile(drive, file_name, content, targetFolder, mime_type || 'text/plain');
        break;
      }
      case 'create_folder': {
        if (!file_name) {
          return NextResponse.json({ ok: false, error: 'file_name (nombre de carpeta) es requerido para create_folder' }, { status: 400 });
        }
        const parentFolder = folder_id || config.root_folder_id || 'root';
        result = await createFolder(drive, file_name, parentFolder);
        break;
      }
      default:
        return NextResponse.json({ ok: false, error: `Operacion desconocida: ${operation}` }, { status: 400 });
    }

    const durationMs = Date.now() - startTime;

    // Log to connector_logs
    const logId = uuidv4();
    const now = new Date().toISOString();
    try {
      db.prepare(`
        INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, error_message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        logId, params.id,
        JSON.stringify({ operation, folder_id, file_id, file_name }),
        JSON.stringify({ ok: true }),
        'success', durationMs, null, now
      );
    } catch (logErr) {
      logger.error('connectors', 'Error logging Drive invocation', { error: (logErr as Error).message });
    }

    // Increment times_used
    try {
      db.prepare('UPDATE connectors SET times_used = times_used + 1, updated_at = ? WHERE id = ?').run(now, params.id);
    } catch (updateErr) {
      logger.error('connectors', 'Error updating times_used', { error: (updateErr as Error).message });
    }

    return NextResponse.json({ ok: true, operation, ...result });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('connectors', 'Error invoking Drive connector', { connectorId: params.id, durationMs, error: msg });

    // Log failure
    try {
      const logId = uuidv4();
      db.prepare(`
        INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, error_message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(logId, params.id, '{}', JSON.stringify({ ok: false, error: msg }), 'failed', durationMs, msg, new Date().toISOString());
    } catch { /* ignore log errors */ }

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
