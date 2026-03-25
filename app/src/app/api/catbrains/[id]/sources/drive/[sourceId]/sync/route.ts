import { NextResponse } from 'next/server';
import db from '@/lib/db';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { extractContent } from '@/lib/services/content-extractor';
import { createDriveClient } from '@/lib/services/google-drive-auth';
import { downloadFile } from '@/lib/services/google-drive-service';
import { GoogleDriveConfig } from '@/lib/types';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  try {
    const { id: catbrainId, sourceId } = await params;

    // Get source
    const source = db.prepare(
      "SELECT * FROM sources WHERE id = ? AND project_id = ? AND type = 'google_drive'"
    ).get(sourceId, catbrainId) as { id: string; drive_file_id: string; drive_sync_job_id: string; file_path: string } | undefined;

    if (!source) {
      return NextResponse.json({ error: 'Drive source not found' }, { status: 404 });
    }

    if (!source.drive_file_id || !source.drive_sync_job_id) {
      return NextResponse.json({ error: 'Source is missing Drive metadata' }, { status: 400 });
    }

    // Get sync job and connector
    const syncJob = db.prepare('SELECT * FROM drive_sync_jobs WHERE id = ?').get(source.drive_sync_job_id) as { connector_id: string } | undefined;
    if (!syncJob) {
      return NextResponse.json({ error: 'Sync job not found' }, { status: 404 });
    }

    const connector = db.prepare('SELECT * FROM connectors WHERE id = ? AND type = ?').get(syncJob.connector_id, 'google_drive') as { config: string } | undefined;
    if (!connector) {
      return NextResponse.json({ error: 'Drive connector not found' }, { status: 404 });
    }

    const config = JSON.parse(connector.config) as GoogleDriveConfig;
    const drive = createDriveClient(config);

    // Download file — get MIME type from drive_indexed_files
    const indexedFile = db.prepare(
      'SELECT * FROM drive_indexed_files WHERE sync_job_id = ? AND drive_file_id = ?'
    ).get(source.drive_sync_job_id, source.drive_file_id) as { content_hash: string; drive_mime_type: string } | undefined;

    const mimeType = indexedFile?.drive_mime_type || 'application/octet-stream';
    const { content } = await downloadFile(drive, source.drive_file_id, mimeType);
    const newHash = crypto.createHash('sha256').update(content).digest('hex');

    if (indexedFile && indexedFile.content_hash === newHash) {
      return NextResponse.json({ changed: false, message: 'El contenido no ha cambiado' });
    }

    // Content changed — re-extract
    const filePath = source.file_path || path.join(
      process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects'),
      catbrainId, 'sources', `${sourceId}.bin`
    );
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);

    const extraction = await extractContent(filePath);

    db.prepare(`
      UPDATE sources SET content_text = ?, file_size = ?, content_updated_at = ?, is_pending_append = 1, status = 'ready'
      WHERE id = ?
    `).run(extraction.text, content.length, new Date().toISOString(), sourceId);

    if (indexedFile) {
      db.prepare('UPDATE drive_indexed_files SET content_hash = ?, indexed_at = ? WHERE sync_job_id = ? AND drive_file_id = ?')
        .run(newHash, new Date().toISOString(), source.drive_sync_job_id, source.drive_file_id);
    }

    logger.info('drive', `Manual sync completed: ${sourceId}`, { changed: true, catbrainId });

    return NextResponse.json({ changed: true, message: 'Contenido actualizado y marcado para re-indexar' });

  } catch (error) {
    logger.error('drive', 'Error in manual sync', { error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
