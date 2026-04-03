import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { generateId } from '@/lib/utils';
import type { EmailTemplate, GoogleDriveConfig } from '@/lib/types';
import { createDriveClient } from '@/lib/services/google-drive-auth';
import { createFolder, listFolders } from '@/lib/services/google-drive-service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const DRIVE_CONNECTOR_ID = '9aee88bd-545b-4caa-b514-2ceb7441587d';
const DOCATFLOW_ROOT_FOLDER_NAME = 'DoCatFlow';
const TEMPLATES_FOLDER_NAME = 'templates';

/**
 * Get or create a folder by name inside a parent folder.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrCreateFolder(drive: any, name: string, parentId: string): Promise<string> {
  const existing = await listFolders(drive, parentId);
  const found = existing.find((f) => f.name === name);
  if (found) return found.id!;
  const created = await createFolder(drive, name, parentId);
  return created.id;
}

/**
 * Try to create a Drive folder for the template under DoCatFlow/templates/{name}/.
 * Returns the folder id or null if Drive is not available/configured.
 */
async function tryCreateTemplateDriveFolder(templateName: string): Promise<string | null> {
  try {
    const connector = db.prepare(
      "SELECT * FROM connectors WHERE id = ? AND type = 'google_drive' AND is_active = 1"
    ).get(DRIVE_CONNECTOR_ID) as { config: string } | undefined;
    if (!connector) return null;

    const config = JSON.parse(connector.config) as GoogleDriveConfig;
    if (!config.root_folder_id) return null;

    const drive = createDriveClient(config);

    // Get or create DoCatFlow/ under root
    const docatflowId = await getOrCreateFolder(drive, DOCATFLOW_ROOT_FOLDER_NAME, config.root_folder_id);
    // Get or create DoCatFlow/templates/
    const templatesId = await getOrCreateFolder(drive, TEMPLATES_FOLDER_NAME, docatflowId);
    // Create DoCatFlow/templates/{template-name}/
    const templateFolder = await createFolder(drive, templateName, templatesId);

    logger.info('drive', `Created Drive folder for template "${templateName}"`, { folderId: templateFolder.id });
    return templateFolder.id;
  } catch (err) {
    logger.warn('drive', 'Could not create Drive folder (non-fatal)', { error: (err as Error).message });
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const active = searchParams.get('active');

  let query = 'SELECT id, ref_code, name, description, category, is_active, times_used, created_at, updated_at FROM email_templates';
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (category) { conditions.push('category = ?'); params.push(category); }
  if (active !== null) { conditions.push('is_active = ?'); params.push(active === '0' ? 0 : 1); }
  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY updated_at DESC';

  const templates = db.prepare(query).all(...params);
  return NextResponse.json(templates);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, category, structure } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const id = generateId();
    const now = new Date().toISOString();
    // Generate unique 6-char ref_code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const genCode = () => { let c = ''; for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)]; return c; };
    const existingCodes = new Set((db.prepare("SELECT ref_code FROM email_templates WHERE ref_code IS NOT NULL").all() as Array<{ ref_code: string }>).map(r => r.ref_code));
    let refCode = genCode();
    while (existingCodes.has(refCode)) refCode = genCode();
    const structureStr = structure ? (typeof structure === 'string' ? structure : JSON.stringify(structure)) : JSON.stringify({
      sections: { header: { rows: [] }, body: { rows: [] }, footer: { rows: [] } },
      styles: { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', primaryColor: '#7C3AED', textColor: '#333333', maxWidth: 600 },
    });

    // Try to create a Drive folder — non-blocking, failure is silent
    const driveFolderId = await tryCreateTemplateDriveFolder(name);

    db.prepare(
      'INSERT INTO email_templates (id, ref_code, name, description, category, structure, drive_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, refCode, name, description || null, category || 'general', structureStr, driveFolderId || null, now, now);

    const created = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id) as EmailTemplate;
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
