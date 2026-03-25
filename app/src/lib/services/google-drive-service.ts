import { DriveClient } from './google-drive-auth';
import { DriveFile } from '@/lib/types';
import { Readable } from 'stream';

const GOOGLE_DOCS_MIME = 'application/vnd.google-apps.';

/**
 * Test connection: list up to 5 files in root/specified folder.
 */
export async function testConnection(
  drive: DriveClient,
  folderId?: string
): Promise<{ ok: boolean; files_count: number; account_email?: string; error?: string }> {
  try {
    const q = folderId
      ? `'${folderId}' in parents and trashed = false`
      : 'trashed = false';
    const res = await drive.files.list({
      q,
      pageSize: 5,
      fields: 'files(id, name, mimeType)',
    });
    // Get account info via about.get
    const about = await drive.about.get({ fields: 'user(emailAddress)' });
    return {
      ok: true,
      files_count: res.data.files?.length || 0,
      account_email: about.data.user?.emailAddress,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, files_count: 0, error: msg };
  }
}

/**
 * List files in a folder (for browse/picker and list operation).
 */
export async function listFiles(
  drive: DriveClient,
  folderId: string,
  pageToken?: string
): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    pageSize: 100,
    pageToken: pageToken || undefined,
    fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, parents, iconLink, webViewLink)',
    orderBy: 'folder,name',
  });
  return {
    files: (res.data.files || []) as DriveFile[],
    nextPageToken: res.data.nextPageToken || undefined,
  };
}

/**
 * List only folders (for folder picker / browse endpoint).
 */
export async function listFolders(
  drive: DriveClient,
  parentId: string
): Promise<DriveFile[]> {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    pageSize: 200,
    fields: 'files(id, name, mimeType, modifiedTime)',
    orderBy: 'name',
  });
  return (res.data.files || []) as DriveFile[];
}

/**
 * Download a file's content. For Google Docs, exports to text/plain.
 */
export async function downloadFile(
  drive: DriveClient,
  fileId: string,
  mimeType: string
): Promise<{ content: Buffer; exportedMime: string }> {
  if (mimeType.startsWith(GOOGLE_DOCS_MIME)) {
    // Export Google Workspace files
    const exportMime = getExportMimeType(mimeType);
    const res = await drive.files.export(
      { fileId, mimeType: exportMime },
      { responseType: 'arraybuffer' }
    );
    return { content: Buffer.from(res.data as ArrayBuffer), exportedMime: exportMime };
  }
  // Binary download
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return { content: Buffer.from(res.data as ArrayBuffer), exportedMime: mimeType };
}

/**
 * Upload content as a file to Drive.
 */
export async function uploadFile(
  drive: DriveClient,
  name: string,
  content: string | Buffer,
  parentFolderId: string,
  mimeType: string = 'text/plain'
): Promise<{ id: string; name: string; webViewLink?: string }> {
  const media = {
    mimeType,
    body: Readable.from([typeof content === 'string' ? Buffer.from(content) : content]),
  };
  const res = await drive.files.create({
    requestBody: { name, parents: [parentFolderId] },
    media,
    fields: 'id, name, webViewLink',
  });
  return {
    id: res.data.id!,
    name: res.data.name!,
    webViewLink: res.data.webViewLink || undefined,
  };
}

/**
 * Create a folder in Drive.
 */
export async function createFolder(
  drive: DriveClient,
  name: string,
  parentFolderId: string
): Promise<{ id: string; name: string }> {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id, name',
  });
  return { id: res.data.id!, name: res.data.name! };
}

/**
 * Get changes since last page token (for polling).
 */
export async function getChanges(
  drive: DriveClient,
  pageToken: string
): Promise<{
  changes: Array<{ fileId: string; removed: boolean; file?: DriveFile }>;
  newStartPageToken?: string;
  nextPageToken?: string;
}> {
  const res = await drive.changes.list({
    pageToken,
    pageSize: 100,
    fields: 'newStartPageToken, nextPageToken, changes(fileId, removed, file(id, name, mimeType, modifiedTime, size, parents, trashed))',
    includeRemoved: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const changes = (res.data.changes || []).map((c: any) => ({
    fileId: c.fileId as string,
    removed: !!(c.removed || c.file?.trashed),
    file: c.file as DriveFile | undefined,
  }));
  return {
    changes,
    newStartPageToken: res.data.newStartPageToken || undefined,
    nextPageToken: res.data.nextPageToken || undefined,
  };
}

/**
 * Get a start page token for changes.list polling.
 */
export async function getStartPageToken(drive: DriveClient): Promise<string> {
  const res = await drive.changes.getStartPageToken({});
  return res.data.startPageToken!;
}

/**
 * Determine export MIME type for Google Workspace files.
 */
function getExportMimeType(googleMime: string): string {
  switch (googleMime) {
    case 'application/vnd.google-apps.document':
      return 'text/plain';
    case 'application/vnd.google-apps.spreadsheet':
      return 'text/csv';
    case 'application/vnd.google-apps.presentation':
      return 'application/pdf';
    case 'application/vnd.google-apps.drawing':
      return 'application/pdf';
    default:
      return 'application/pdf';
  }
}
