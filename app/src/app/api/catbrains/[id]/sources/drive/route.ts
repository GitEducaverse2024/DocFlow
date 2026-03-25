import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { extractContent } from '@/lib/services/content-extractor';
import { createDriveClient } from '@/lib/services/google-drive-auth';
import { listFiles, downloadFile, getStartPageToken } from '@/lib/services/google-drive-service';
import { GoogleDriveConfig } from '@/lib/types';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Map exported MIME type to file extension for extractContent() to identify correctly.
 */
function mimeToExtension(mime: string): string {
  switch (mime) {
    case 'text/plain': return 'txt';
    case 'text/csv': return 'csv';
    case 'application/pdf': return 'pdf';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return 'docx';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': return 'xlsx';
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation': return 'pptx';
    default: {
      const parts = mime.split('/');
      return parts[parts.length - 1]?.split('+')[0] || 'bin';
    }
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: catbrainId } = await params;
    const catbrain = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(catbrainId) as { id: string; rag_enabled: number } | undefined;

    if (!catbrain) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    const body = await request.json();
    const { connector_id, folder_id, folder_name, sync_interval_minutes = 15 } = body;

    if (!connector_id || !folder_id) {
      return NextResponse.json({ error: 'connector_id and folder_id are required' }, { status: 400 });
    }

    // 1. Get connector and create Drive client
    const connector = db.prepare('SELECT * FROM connectors WHERE id = ? AND type = ?').get(connector_id, 'google_drive') as { id: string; config: string } | undefined;
    if (!connector) {
      return NextResponse.json({ error: 'Google Drive connector not found' }, { status: 404 });
    }
    const config = JSON.parse(connector.config) as GoogleDriveConfig;
    const drive = createDriveClient(config);

    // 2. Create sync job
    const syncJobId = uuidv4();
    const isPendingAppend = catbrain.rag_enabled === 1 ? 1 : 0;

    // Get initial page token for future polling
    let startPageToken: string | null = null;
    try {
      startPageToken = await getStartPageToken(drive);
    } catch (e) {
      logger.warn('drive', 'Could not get start page token', { error: (e as Error).message });
    }

    db.prepare(`
      INSERT INTO drive_sync_jobs (id, connector_id, catbrain_id, folder_id, folder_name, sync_interval_minutes, last_page_token, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(syncJobId, connector_id, catbrainId, folder_id, folder_name || '', sync_interval_minutes, startPageToken);

    // 3. List files in folder
    const { files } = await listFiles(drive, folder_id);

    // 4. For each file: download, save, extract, create source
    const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');
    const sourcesDir = path.join(projectsPath, catbrainId, 'sources');
    fs.mkdirSync(sourcesDir, { recursive: true });

    // Get current max order_index
    const maxOrderRow = db.prepare('SELECT MAX(order_index) as maxOrder FROM sources WHERE project_id = ?').get(catbrainId) as { maxOrder: number | null };
    let nextOrderIndex = (maxOrderRow.maxOrder !== null ? maxOrderRow.maxOrder : -1) + 1;

    const createdSources: Array<{ id: string; name: string; drive_file_id: string }> = [];
    let filesIndexed = 0;

    for (const file of files) {
      // Skip folders
      if (file.mimeType === 'application/vnd.google-apps.folder') continue;

      try {
        const { content, exportedMime } = await downloadFile(drive, file.id, file.mimeType);
        const ext = mimeToExtension(exportedMime);
        const sourceId = uuidv4();
        const filePath = path.join(sourcesDir, `${sourceId}.${ext}`);
        fs.writeFileSync(filePath, content);

        const hash = crypto.createHash('sha256').update(content).digest('hex');
        const extraction = await extractContent(filePath);

        // Insert source row
        db.prepare(`
          INSERT INTO sources (id, project_id, type, name, file_path, file_type, file_size, content_text, status, drive_file_id, drive_sync_job_id, is_pending_append, order_index)
          VALUES (?, ?, 'google_drive', ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?)
        `).run(
          sourceId, catbrainId, file.name, filePath, exportedMime, content.length,
          extraction.text, file.id, syncJobId, isPendingAppend, nextOrderIndex++
        );

        // Track indexed file
        db.prepare(`
          INSERT INTO drive_indexed_files (id, sync_job_id, drive_file_id, drive_file_name, drive_mime_type, drive_modified_time, source_id, content_hash)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), syncJobId, file.id, file.name, file.mimeType, file.modifiedTime || null, sourceId, hash);

        createdSources.push({ id: sourceId, name: file.name, drive_file_id: file.id });
        filesIndexed++;
      } catch (fileErr) {
        logger.error('drive', `Error processing Drive file: ${file.name}`, { error: (fileErr as Error).message, fileId: file.id });
      }
    }

    // 5. Update sync job with files_indexed count
    db.prepare('UPDATE drive_sync_jobs SET files_indexed = ?, last_synced_at = ? WHERE id = ?')
      .run(filesIndexed, new Date().toISOString(), syncJobId);

    logger.info('drive', `Drive folder indexed: ${folder_name || folder_id}`, {
      catbrainId, syncJobId, filesIndexed, totalFiles: files.length
    });

    return NextResponse.json({
      sync_job_id: syncJobId,
      sources_created: createdSources.length,
      sources: createdSources,
      files_skipped: files.length - filesIndexed - files.filter(f => f.mimeType === 'application/vnd.google-apps.folder').length,
    }, { status: 201 });

  } catch (error) {
    logger.error('drive', 'Error creating Drive sources', { error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
