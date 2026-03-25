import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { Connector, GoogleDriveConfig } from '@/lib/types';
import { createDriveClient } from '@/lib/services/google-drive-auth';
import { testConnection } from '@/lib/services/google-drive-service';
import { logger } from '@/lib/logger';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const connector = db.prepare('SELECT * FROM connectors WHERE id = ?').get(params.id) as Connector | undefined;
    if (!connector) {
      return NextResponse.json({ error: 'Conector no encontrado' }, { status: 404 });
    }
    if (connector.type !== 'google_drive') {
      return NextResponse.json({ error: 'No es un conector Google Drive' }, { status: 400 });
    }

    const config: GoogleDriveConfig = connector.config ? JSON.parse(connector.config) : {};
    const startTime = Date.now();

    logger.info('connectors', 'Google Drive test iniciado', { connectorId: params.id, auth_mode: config.auth_mode });

    const drive = createDriveClient(config);
    const result = await testConnection(drive, config.root_folder_id);
    const durationMs = Date.now() - startTime;

    const testStatus = result.ok ? 'ok' : 'failed';
    const now = new Date().toISOString();

    db.prepare('UPDATE connectors SET test_status = ?, last_tested = ?, updated_at = ? WHERE id = ?')
      .run(testStatus, now, now, params.id);

    logger.info('connectors', 'Google Drive test completado', { connectorId: params.id, status: testStatus, durationMs });

    return NextResponse.json({
      success: result.ok,
      test_status: testStatus,
      account_email: result.account_email,
      files_count: result.files_count,
      duration_ms: durationMs,
      ...(result.error ? { error: result.error } : {}),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('connectors', 'Error en test Google Drive', { connectorId: params.id, error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
