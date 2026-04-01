import db from '@/lib/db';
import fs from 'fs';
import type { GoogleDriveConfig, TemplateStructure } from '@/lib/types';
import { createDriveClient } from './google-drive-auth';
import { uploadFile, createFolder, listFolders } from './google-drive-service';
import { logger } from '@/lib/logger';

const DRIVE_CONNECTOR_ID = '9aee88bd-545b-4caa-b514-2ceb7441587d';
const DOCATFLOW_ROOT_FOLDER_NAME = 'DoCatFlow';
const TEMPLATES_FOLDER_NAME = 'templates';

interface AssetRow {
  id: string;
  template_id: string;
  filename: string;
  local_path: string | null;
  drive_url: string | null;
  drive_file_id: string | null;
  mime_type: string | null;
}

/**
 * Get or create a folder by name inside a parent.
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
 * Resolve all local asset URLs in a template structure to public Drive URLs.
 * Uploads assets to Drive if they don't have a drive_url yet.
 * Mutates the structure in place and returns it.
 */
export async function resolveAssetsForEmail(
  templateId: string,
  structure: TemplateStructure
): Promise<TemplateStructure> {
  // Get Drive connector
  const connector = db.prepare(
    "SELECT config FROM connectors WHERE id = ? AND type = 'google_drive' AND is_active = 1"
  ).get(DRIVE_CONNECTOR_ID) as { config: string } | undefined;
  if (!connector) return structure; // No Drive — can't resolve

  const config = JSON.parse(connector.config) as GoogleDriveConfig;

  // Build asset lookup: local URL pattern → asset row
  const assets = db.prepare(
    'SELECT id, template_id, filename, local_path, drive_url, drive_file_id, mime_type FROM template_assets WHERE template_id = ?'
  ).all(templateId) as AssetRow[];

  if (assets.length === 0) return structure;

  // Map local URLs to assets
  const localUrlToAsset = new Map<string, AssetRow>();
  for (const asset of assets) {
    const localUrl = `/api/email-templates/${asset.template_id}/assets/${asset.id}`;
    localUrlToAsset.set(localUrl, asset);
  }

  // Find assets that need uploading (have local_path but no drive_url)
  const needsUpload = assets.filter(a => !a.drive_url && a.local_path);

  if (needsUpload.length > 0) {
    try {
      const drive = createDriveClient(config);

      // Ensure folder structure exists
      let folderId: string;
      if (config.root_folder_id) {
        const docatflowId = await getOrCreateFolder(drive, DOCATFLOW_ROOT_FOLDER_NAME, config.root_folder_id);
        const templatesId = await getOrCreateFolder(drive, TEMPLATES_FOLDER_NAME, docatflowId);
        folderId = await getOrCreateFolder(drive, templateId, templatesId);
      } else {
        // No root folder — create in Drive root
        const docatflowId = await getOrCreateFolder(drive, DOCATFLOW_ROOT_FOLDER_NAME, 'root');
        const templatesId = await getOrCreateFolder(drive, TEMPLATES_FOLDER_NAME, docatflowId);
        folderId = await getOrCreateFolder(drive, templateId, templatesId);
      }

      // Update template drive_folder_id if not set
      db.prepare('UPDATE email_templates SET drive_folder_id = ? WHERE id = ? AND drive_folder_id IS NULL')
        .run(folderId, templateId);

      // Upload each pending asset
      for (const asset of needsUpload) {
        try {
          if (!asset.local_path || !fs.existsSync(asset.local_path)) continue;

          const buffer = fs.readFileSync(asset.local_path);
          const uploaded = await uploadFile(drive, asset.filename, buffer, folderId, asset.mime_type || 'application/octet-stream');
          if (!uploaded.id) continue;

          // Set public sharing
          await drive.permissions.create({
            fileId: uploaded.id,
            requestBody: { type: 'anyone', role: 'reader' },
          });

          const driveUrl = `https://lh3.googleusercontent.com/d/${uploaded.id}`;

          // Update DB
          db.prepare('UPDATE template_assets SET drive_url = ?, drive_file_id = ? WHERE id = ?')
            .run(driveUrl, uploaded.id, asset.id);

          // Update in-memory
          asset.drive_url = driveUrl;
          asset.drive_file_id = uploaded.id;

          logger.info('drive', `Asset auto-uploaded for email: ${asset.filename}`, { fileId: uploaded.id });
        } catch (uploadErr) {
          logger.warn('drive', `Failed to upload asset ${asset.filename}`, { error: (uploadErr as Error).message });
        }
      }
    } catch (driveErr) {
      logger.warn('drive', 'Drive asset resolution failed', { error: (driveErr as Error).message });
      return structure;
    }
  }

  // Now replace all local URLs in structure with Drive URLs
  for (const sectionKey of ['header', 'body', 'footer'] as const) {
    const section = structure.sections[sectionKey];
    if (!section?.rows) continue;
    for (const row of section.rows) {
      if (!row.columns) continue;
      for (const col of row.columns) {
        if (col.block.src) {
          // Check if it's a local asset URL
          const asset = localUrlToAsset.get(col.block.src);
          if (asset?.drive_url) {
            col.block.src = asset.drive_url;
          }
        }
      }
    }
  }

  return structure;
}
