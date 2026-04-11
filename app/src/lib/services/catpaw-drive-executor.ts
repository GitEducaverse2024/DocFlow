/**
 * Executes Google Drive tool calls directly (no HTTP self-fetch).
 * Used by the CatPaw chat route's tool-calling loop.
 */
import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { generateId } from '@/lib/utils';
import { GoogleDriveConfig } from '@/lib/types';
import { createDriveClient } from './google-drive-auth';
import { listFiles, downloadFile, uploadFile, createFolder } from './google-drive-service';
import type { DriveToolDispatch } from './catpaw-drive-tools';

interface ConnectorRow {
  id: string;
  type: string;
  config: string | null;
  is_active: number;
}

/**
 * INC-13 closure — safe stringify with hard cap (10_000 chars) so Drive log
 * rows never blow up with file contents.
 */
function safeStringify(value: unknown): string {
  try {
    const s = JSON.stringify(value);
    if (s == null) return '';
    return s.length > 10_000 ? s.slice(0, 10_000) + '"...[truncado]"' : s;
  } catch {
    return '{"error":"unstringifiable"}';
  }
}

/**
 * INC-13 closure + redaction policy — Drive args may carry raw file contents
 * on upload_file. Replace `content` with size_bytes and never persist binary
 * blobs. See .planning/knowledge/connector-logs-redaction-policy.md
 */
function redactAndTrimDriveArgs(args: Record<string, unknown>): Record<string, unknown> {
  const REDACT_KEYS = new Set([
    'access_token', 'refresh_token', 'api_key', 'password', 'client_secret',
    'authorization', 'cookie', 'oauth_token',
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
      continue;
    }
    if (k === 'content') {
      if (typeof v === 'string') {
        out.content_len = v.length;
      }
      continue;
    }
    if (typeof v === 'string' && v.length > 10_000) {
      out[k] = v.slice(0, 10_000) + '...[truncado]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Execute a Drive tool call directly, returning the result as a string for the LLM.
 */
export async function executeDriveToolCall(
  pawId: string,
  dispatch: DriveToolDispatch,
  args: Record<string, unknown>,
): Promise<string> {
  const startTime = Date.now();
  const { connectorId, operation } = dispatch;

  // Load connector
  const connector = db.prepare(
    'SELECT * FROM connectors WHERE id = ? AND is_active = 1'
  ).get(connectorId) as ConnectorRow | undefined;

  if (!connector) {
    return JSON.stringify({ error: 'Conector Google Drive no encontrado o inactivo' });
  }
  if (connector.type !== 'google_drive') {
    return JSON.stringify({ error: 'Conector no es de tipo Google Drive' });
  }

  const config: GoogleDriveConfig = connector.config ? JSON.parse(connector.config) : {};
  const drive = createDriveClient(config);

  try {
    let result: unknown;

    switch (operation) {
      case 'list_files': {
        const folderId = (args.folder_id as string) || config.root_folder_id || 'root';
        const { files } = await listFiles(drive, folderId);
        result = {
          folder_id: folderId,
          count: files.length,
          files: files.map(f => ({
            id: f.id,
            name: f.name,
            type: friendlyMimeType(f.mimeType),
            mimeType: f.mimeType,
            modified: f.modifiedTime,
            size: f.size,
            link: f.webViewLink,
          })),
        };
        break;
      }

      case 'search_files': {
        const query = args.query as string;
        if (!query) return JSON.stringify({ error: 'query es requerido para search_files' });
        const limit = Math.min((args.limit as number) || 20, 50);

        // Build search query — search in name and fullText
        const escapedQuery = query.replace(/'/g, "\\'");
        let q = `(name contains '${escapedQuery}' or fullText contains '${escapedQuery}') and trashed = false`;
        if (config.root_folder_id) {
          q += ` and '${config.root_folder_id}' in parents`;
        }

        const res = await drive.files.list({
          q,
          pageSize: limit,
          fields: 'files(id, name, mimeType, modifiedTime, size, webViewLink)',
          orderBy: 'modifiedTime desc',
        });

        const files = res.data.files || [];
        result = {
          query,
          count: files.length,
          files: files.map((f: Record<string, string>) => ({
            id: f.id,
            name: f.name,
            type: friendlyMimeType(f.mimeType),
            mimeType: f.mimeType,
            modified: f.modifiedTime,
            size: f.size,
            link: f.webViewLink,
          })),
        };
        break;
      }

      case 'read_file': {
        const fileId = args.file_id as string;
        if (!fileId) return JSON.stringify({ error: 'file_id es requerido para read_file' });

        // Get file metadata first
        const meta = await drive.files.get({
          fileId,
          fields: 'id, name, mimeType, size',
        });
        const mimeType = meta.data.mimeType as string;
        const fileName = meta.data.name as string;

        // Check if it's a binary file that can't be read as text
        if (isBinaryMime(mimeType)) {
          result = {
            file_id: fileId,
            name: fileName,
            mimeType,
            error: `Este archivo es binario (${friendlyMimeType(mimeType)}). No se puede leer como texto. Usa el enlace de Drive para verlo.`,
          };
          break;
        }

        const { content, exportedMime } = await downloadFile(drive, fileId, mimeType);
        let text = content.toString('utf-8');

        // Truncate large files
        if (text.length > 15_000) {
          text = text.slice(0, 15_000) + '\n\n... [contenido truncado a 15,000 caracteres]';
        }

        result = {
          file_id: fileId,
          name: fileName,
          mimeType,
          exportedAs: exportedMime !== mimeType ? exportedMime : undefined,
          content: text,
        };
        break;
      }

      case 'get_file_info': {
        const fileId = args.file_id as string;
        if (!fileId) return JSON.stringify({ error: 'file_id es requerido para get_file_info' });

        const meta = await drive.files.get({
          fileId,
          fields: 'id, name, mimeType, modifiedTime, size, owners, webViewLink, createdTime, sharingUser',
        });

        result = {
          id: meta.data.id,
          name: meta.data.name,
          type: friendlyMimeType(meta.data.mimeType),
          mimeType: meta.data.mimeType,
          size: meta.data.size,
          created: meta.data.createdTime,
          modified: meta.data.modifiedTime,
          owners: meta.data.owners?.map((o: Record<string, string>) => o.displayName || o.emailAddress),
          link: meta.data.webViewLink,
        };
        break;
      }

      case 'upload_file': {
        const fileName = args.file_name as string;
        if (!fileName) return JSON.stringify({ error: 'file_name es requerido para upload_file' });
        const content = args.content as string;
        if (!content) return JSON.stringify({ error: 'content es requerido para upload_file' });
        const folderId = (args.folder_id as string) || config.root_folder_id || 'root';
        const mimeType = (args.mime_type as string) || 'text/plain';

        const uploaded = await uploadFile(drive, fileName, content, folderId, mimeType);
        result = {
          id: uploaded.id,
          name: uploaded.name,
          link: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
          folder_id: folderId,
          mime_type: mimeType,
          message: `Archivo "${uploaded.name}" creado exitosamente en Google Drive`,
        };
        break;
      }

      case 'create_folder': {
        const folderName = args.folder_name as string;
        if (!folderName) return JSON.stringify({ error: 'folder_name es requerido para create_folder' });
        const parentId = (args.parent_folder_id as string) || config.root_folder_id || 'root';

        const folder = await createFolder(drive, folderName, parentId);
        result = {
          id: folder.id,
          name: folder.name,
          parent_folder_id: parentId,
          message: `Carpeta "${folder.name}" creada exitosamente en Google Drive`,
        };
        break;
      }

      default:
        return JSON.stringify({ error: `Operacion Drive desconocida: ${operation}` });
    }

    // INC-13 closure — rich log payloads for Drive ops.
    const durationMs = Date.now() - startTime;
    try {
      db.prepare(
        'INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        generateId(), connectorId,
        safeStringify({ operation, pawId, args: redactAndTrimDriveArgs(args) }),
        safeStringify(result),
        'success', durationMs, new Date().toISOString()
      );
    } catch (logErr) {
      logger.error('cat-paws', 'Error logging Drive tool call', { error: (logErr as Error).message });
    }

    // Update times_used
    try {
      db.prepare('UPDATE connectors SET times_used = times_used + 1, updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), connectorId);
    } catch { /* ignore */ }

    const resultStr = JSON.stringify(result);
    return resultStr.length > 20_000 ? resultStr.slice(0, 20_000) + '... [truncado]' : resultStr;
  } catch (err) {
    const errMsg = (err as Error).message;
    logger.error('cat-paws', 'Drive tool execution error', {
      pawId, connectorId, operation, error: errMsg,
    });

    // INC-13 closure — rich log on failure path.
    try {
      db.prepare(
        'INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        generateId(), connectorId,
        safeStringify({ operation, pawId, args: redactAndTrimDriveArgs(args) }),
        safeStringify({ ok: false, error: errMsg }),
        'failed', Date.now() - startTime, errMsg.substring(0, 5000), new Date().toISOString()
      );
    } catch { /* ignore */ }

    return JSON.stringify({ error: errMsg });
  }
}

function friendlyMimeType(mime: string): string {
  const map: Record<string, string> = {
    'application/vnd.google-apps.document': 'Google Doc',
    'application/vnd.google-apps.spreadsheet': 'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.folder': 'Carpeta',
    'application/vnd.google-apps.form': 'Google Form',
    'application/vnd.google-apps.drawing': 'Google Drawing',
    'application/pdf': 'PDF',
    'text/plain': 'Texto',
    'text/csv': 'CSV',
    'text/html': 'HTML',
    'application/json': 'JSON',
    'image/png': 'Imagen PNG',
    'image/jpeg': 'Imagen JPEG',
    'application/zip': 'ZIP',
  };
  return map[mime] || mime;
}

function isBinaryMime(mime: string): boolean {
  if (mime.startsWith('application/vnd.google-apps.')) return false; // exportable
  if (mime.startsWith('text/')) return false;
  if (mime === 'application/json') return false;
  if (mime === 'application/xml') return false;
  return true; // images, zips, videos, etc.
}
