import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { generateId } from '@/lib/utils';
import fs from 'fs';
import path from 'path';
import type { GoogleDriveConfig } from '@/lib/types';
import { createDriveClient } from '@/lib/services/google-drive-auth';
import { uploadFile } from '@/lib/services/google-drive-service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const DATA_PATH = process['env']['DATA_PATH'] || path.join(process.cwd(), 'data');
const DRIVE_CONNECTOR_ID = '9aee88bd-545b-4caa-b514-2ceb7441587d';

/**
 * Upload a file buffer to Drive in the given folder and set it publicly readable.
 * Returns { driveFileId, driveUrl } or null on failure.
 */
async function uploadToDrive(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  folderId: string
): Promise<{ driveFileId: string; driveUrl: string } | null> {
  try {
    const connector = db.prepare(
      "SELECT * FROM connectors WHERE id = ? AND type = 'google_drive' AND is_active = 1"
    ).get(DRIVE_CONNECTOR_ID) as { config: string } | undefined;
    if (!connector) return null;

    const config = JSON.parse(connector.config) as GoogleDriveConfig;
    const drive = createDriveClient(config);

    const uploaded = await uploadFile(drive, filename, buffer, folderId, mimeType);
    if (!uploaded.id) return null;

    // Set sharing: anyone with link can view
    await drive.permissions.create({
      fileId: uploaded.id,
      requestBody: { type: 'anyone', role: 'reader' },
    });

    const driveUrl = `https://lh3.googleusercontent.com/d/${uploaded.id}`;
    logger.info('drive', `Asset uploaded to Drive: ${filename}`, { fileId: uploaded.id });
    return { driveFileId: uploaded.id, driveUrl };
  } catch (err) {
    logger.warn('drive', 'Drive upload failed (non-fatal)', { error: (err as Error).message });
    return null;
  }
}

interface AssetListRow {
  id: string;
  template_id: string;
  filename: string;
  drive_file_id: string | null;
  drive_url: string | null;
  local_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = db.prepare('SELECT * FROM template_assets WHERE template_id = ? ORDER BY created_at').all(id) as AssetListRow[];

  // Annotate each asset with the preferred public URL
  const assets = rows.map((a) => ({
    ...a,
    url: a.drive_url || `/api/email-templates/${a.template_id}/assets/${a.id}`,
  }));

  return NextResponse.json(assets);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: templateId } = await params;

    const template = db.prepare('SELECT id, drive_folder_id FROM email_templates WHERE id = ?').get(templateId) as
      | { id: string; drive_folder_id: string | null }
      | undefined;
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });

    const assetId = generateId();
    const ext = path.extname(file.name) || '.png';
    const filename = `${assetId}${ext}`;
    const dir = path.join(DATA_PATH, 'templates', templateId);
    fs.mkdirSync(dir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buffer);

    const mimeType = file.type || 'application/octet-stream';
    const now = new Date().toISOString();

    // Attempt Drive upload if template has a Drive folder
    let driveFileId: string | null = null;
    let driveUrl: string | null = null;
    if (template.drive_folder_id) {
      const driveResult = await uploadToDrive(buffer, file.name, mimeType, template.drive_folder_id);
      if (driveResult) {
        driveFileId = driveResult.driveFileId;
        driveUrl = driveResult.driveUrl;
      }
    }

    db.prepare(
      'INSERT INTO template_assets (id, template_id, filename, local_path, mime_type, size_bytes, drive_file_id, drive_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(assetId, templateId, file.name, filePath, mimeType, buffer.length, driveFileId, driveUrl, now);

    const localUrl = `/api/email-templates/${templateId}/assets/${assetId}`;
    const publicUrl = driveUrl || localUrl;

    return NextResponse.json({
      id: assetId,
      filename: file.name,
      url: publicUrl,
      local_url: localUrl,
      drive_url: driveUrl,
      drive_file_id: driveFileId,
      mime_type: mimeType,
      size_bytes: buffer.length,
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
