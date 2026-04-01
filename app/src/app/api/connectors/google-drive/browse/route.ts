import { NextRequest, NextResponse } from 'next/server';
import { GoogleDriveConfig } from '@/lib/types';
import { createDriveClient } from '@/lib/services/google-drive-auth';
import { listFolders } from '@/lib/services/google-drive-service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * POST browse endpoint for wizard use — no connector ID needed.
 * Accepts OAuth2 credentials directly in body to browse Drive folders
 * before the connector has been created.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { client_id, client_secret_encrypted, refresh_token_encrypted, parent_id = 'root' } = body;

    if (!client_id || !client_secret_encrypted || !refresh_token_encrypted) {
      return NextResponse.json(
        { error: 'client_id, client_secret_encrypted y refresh_token_encrypted son requeridos' },
        { status: 400 }
      );
    }

    const config: GoogleDriveConfig = {
      auth_mode: 'oauth2',
      client_id,
      client_secret_encrypted,
      refresh_token_encrypted,
    };

    const drive = createDriveClient(config);
    const folders = await listFolders(drive, parent_id);

    return NextResponse.json({ folders });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('connectors', 'Error browsing Drive folders (wizard)', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
