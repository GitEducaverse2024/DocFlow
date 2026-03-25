import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { Connector, GoogleDriveConfig } from '@/lib/types';
import { createDriveClient } from '@/lib/services/google-drive-auth';
import { listFolders } from '@/lib/services/google-drive-service';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const connector = db.prepare('SELECT * FROM connectors WHERE id = ?').get(params.id) as Connector | undefined;
    if (!connector) {
      return NextResponse.json({ error: 'Conector no encontrado' }, { status: 404 });
    }
    if (connector.type !== 'google_drive') {
      return NextResponse.json({ error: 'No es un conector Google Drive' }, { status: 400 });
    }

    const config: GoogleDriveConfig = connector.config ? JSON.parse(connector.config) : {};
    const drive = createDriveClient(config);

    const parentId = request.nextUrl.searchParams.get('parent_id') || 'root';
    const folders = await listFolders(drive, parentId);

    return NextResponse.json({ folders });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('connectors', 'Error browsing Drive folders', { connectorId: params.id, error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
