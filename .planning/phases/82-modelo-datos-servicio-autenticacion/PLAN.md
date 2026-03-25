# Phase 82 Plan: Modelo de datos + Servicio de autenticacion

**Phase:** 82
**Goal:** Create tables, TypeScript interfaces, Drive auth service, Drive API service, and all CRUD+OAuth2 endpoints.
**Requirements:** DATA-01..05, AUTH-01..04, API-01..08
**Estimated plans:** 1 (this file — all tasks are tightly coupled)

---

## Wave 1: Types + Database Migrations

### Task 1.1: Add GoogleDrive types to types.ts
**File:** `app/src/lib/types.ts`
**Action:** Edit existing file
**Requirements:** DATA-04, DATA-05

1. Add `'google_drive'` to the Connector `type` union at line 211:
   ```typescript
   type: 'n8n_webhook' | 'http_api' | 'mcp_server' | 'email' | 'gmail' | 'google_drive';
   ```

2. After line 297 (end of EmailPayload), add new interfaces:
   ```typescript
   // --- Google Drive Connector Types (v19.0) ---
   export type DriveAuthMode = 'service_account' | 'oauth2';

   export interface GoogleDriveConfig {
     auth_mode: DriveAuthMode;
     // Service Account
     sa_email?: string;              // stored in clear for display
     sa_credentials_encrypted?: string; // entire JSON key encrypted
     // OAuth2
     client_id?: string;             // stored in clear
     client_secret_encrypted?: string;
     refresh_token_encrypted?: string;
     oauth2_email?: string;          // user email from token info
     // Common
     root_folder_id?: string;        // selected root folder
     root_folder_name?: string;      // display name
   }

   export interface DriveSyncJob {
     id: string;
     connector_id: string;
     catbrain_id: string;
     source_id: string;
     folder_id: string;
     folder_name: string;
     last_synced_at: string | null;
     last_page_token: string | null;
     sync_interval_minutes: number;
     is_active: number;
     files_indexed: number;
     last_error: string | null;
     created_at: string;
     updated_at: string;
   }

   export interface DriveIndexedFile {
     id: string;
     sync_job_id: string;
     drive_file_id: string;
     drive_file_name: string;
     drive_mime_type: string;
     drive_modified_time: string;
     source_id: string;
     content_hash: string;
     indexed_at: string;
     created_at: string;
   }

   export interface DriveFile {
     id: string;
     name: string;
     mimeType: string;
     modifiedTime: string;
     size?: string;
     parents?: string[];
     iconLink?: string;
     webViewLink?: string;
   }

   export type DriveOperation = 'upload' | 'download' | 'list' | 'create_folder';
   ```

3. Add `'google_drive'` to Source `type` field (line 30) — note: Source type is implicit (string), but update any enum/union if one exists.

**Verify:** `npm run build` passes with no type errors on new interfaces.

---

### Task 1.2: Create database tables and migrations in db.ts
**File:** `app/src/lib/db.ts`
**Action:** Edit existing file (append after line 1579)
**Requirements:** DATA-01, DATA-02, DATA-03

1. Add new tables (CREATE TABLE IF NOT EXISTS):

   ```typescript
   // === v19.0 Google Drive Connector ===

   // DATA-01: drive_sync_jobs table
   db.exec(`
     CREATE TABLE IF NOT EXISTS drive_sync_jobs (
       id TEXT PRIMARY KEY,
       connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
       catbrain_id TEXT NOT NULL,
       source_id TEXT,
       folder_id TEXT NOT NULL,
       folder_name TEXT NOT NULL DEFAULT '',
       last_synced_at TEXT,
       last_page_token TEXT,
       sync_interval_minutes INTEGER DEFAULT 15,
       is_active INTEGER DEFAULT 1,
       files_indexed INTEGER DEFAULT 0,
       last_error TEXT,
       created_at TEXT DEFAULT (datetime('now')),
       updated_at TEXT DEFAULT (datetime('now'))
     )
   `);

   // DATA-02: drive_indexed_files table
   db.exec(`
     CREATE TABLE IF NOT EXISTS drive_indexed_files (
       id TEXT PRIMARY KEY,
       sync_job_id TEXT NOT NULL REFERENCES drive_sync_jobs(id) ON DELETE CASCADE,
       drive_file_id TEXT NOT NULL,
       drive_file_name TEXT NOT NULL,
       drive_mime_type TEXT NOT NULL DEFAULT '',
       drive_modified_time TEXT,
       source_id TEXT,
       content_hash TEXT,
       indexed_at TEXT DEFAULT (datetime('now')),
       created_at TEXT DEFAULT (datetime('now')),
       UNIQUE(sync_job_id, drive_file_id)
     )
   `);

   // DATA-03: Add Drive columns to sources table
   try { db.exec('ALTER TABLE sources ADD COLUMN drive_file_id TEXT'); } catch { /* already exists */ }
   try { db.exec('ALTER TABLE sources ADD COLUMN drive_sync_job_id TEXT'); } catch { /* already exists */ }
   ```

**Verify:** App starts without SQLite errors. Tables visible via `sqlite3 data/docflow.db ".tables"`.

---

### Task 1.3: Add 'google_drive' to VALID_TYPES and masking
**File:** `app/src/app/api/connectors/route.ts`
**Action:** Edit existing file
**Requirements:** API-01, API-02

1. Line 8 — add `'google_drive'` to VALID_TYPES:
   ```typescript
   const VALID_TYPES = ['n8n_webhook', 'http_api', 'mcp_server', 'email', 'gmail', 'google_drive'];
   ```

2. Add Drive-specific sensitive fields to SENSITIVE_FIELDS (line 10):
   ```typescript
   const SENSITIVE_FIELDS = ['app_password_encrypted', 'client_secret_encrypted', 'refresh_token_encrypted', 'sa_credentials_encrypted'];
   ```

3. Rename `maskGmailConfig` to `maskSensitiveConfig` (or add parallel function) that handles both `gmail` and `google_drive` types:
   ```typescript
   function maskSensitiveConfig(connector: Record<string, unknown>): Record<string, unknown> {
     if (!connector.config) return connector;
     if (connector.type !== 'gmail' && connector.type !== 'google_drive') return connector;
     try {
       const config = typeof connector.config === 'string' ? JSON.parse(connector.config) : connector.config;
       for (const field of SENSITIVE_FIELDS) {
         if (config[field]) {
           config[field] = MASK;
         }
       }
       return { ...connector, config: JSON.stringify(config) };
     } catch {
       return connector;
     }
   }
   ```

4. In POST handler, add `google_drive` branch (parallel to Gmail config building at lines 64-88):
   ```typescript
   } else if (type === 'google_drive') {
     const { auth_mode, sa_email, sa_credentials, client_id, client_secret,
             refresh_token, oauth2_email, root_folder_id, root_folder_name } = body;
     const driveConfig: GoogleDriveConfig = {
       auth_mode: auth_mode || 'service_account',
       ...(sa_email ? { sa_email } : {}),
       ...(sa_credentials ? { sa_credentials_encrypted: encrypt(JSON.stringify(sa_credentials)) } : {}),
       ...(client_id ? { client_id } : {}),
       ...(client_secret ? { client_secret_encrypted: encrypt(client_secret) } : {}),
       ...(refresh_token ? { refresh_token_encrypted: encrypt(refresh_token) } : {}),
       ...(oauth2_email ? { oauth2_email } : {}),
       ...(root_folder_id ? { root_folder_id } : {}),
       ...(root_folder_name ? { root_folder_name } : {}),
     };
     finalConfig = JSON.stringify(driveConfig);
   }
   ```

**Verify:** `POST /api/connectors` with `type: 'google_drive'` creates a connector. `GET /api/connectors` masks credentials.

---

## Wave 2: Auth + Service Layer

### Task 2.1: Create google-drive-auth.ts
**File:** `app/src/lib/services/google-drive-auth.ts` — **NEW**
**Action:** Create new file
**Requirements:** AUTH-01, AUTH-02, AUTH-03

Factory that returns an authenticated Google Drive v3 client based on `auth_mode`.

```typescript
import { decrypt } from '@/lib/crypto';
import { GoogleDriveConfig } from '@/lib/types';
import { logger } from '@/lib/logger';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { google } = require('googleapis');

export type DriveClient = ReturnType<typeof google.drive>;

/**
 * Create an authenticated Drive v3 client from connector config.
 */
export function createDriveClient(config: GoogleDriveConfig): DriveClient {
  let auth;

  if (config.auth_mode === 'service_account') {
    if (!config.sa_credentials_encrypted) {
      throw new Error('Service Account credentials not configured');
    }
    const saJson = JSON.parse(decrypt(config.sa_credentials_encrypted));
    auth = new google.auth.GoogleAuth({
      credentials: saJson,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
  } else if (config.auth_mode === 'oauth2') {
    if (!config.client_id || !config.client_secret_encrypted || !config.refresh_token_encrypted) {
      throw new Error('OAuth2 credentials not configured');
    }
    const oauth2Client = new google.auth.OAuth2(
      config.client_id,
      decrypt(config.client_secret_encrypted),
    );
    oauth2Client.setCredentials({
      refresh_token: decrypt(config.refresh_token_encrypted),
    });
    auth = oauth2Client;
  } else {
    throw new Error(`Unknown auth_mode: ${config.auth_mode}`);
  }

  return google.drive({ version: 'v3', auth });
}

/**
 * Get the authenticated account email (SA email or OAuth2 user email).
 */
export function getAccountEmail(config: GoogleDriveConfig): string {
  if (config.auth_mode === 'service_account') {
    return config.sa_email || 'unknown';
  }
  return config.oauth2_email || 'unknown';
}
```

**Verify:** Unit-testable — but real verification happens in Task 2.2 and Task 3.4 (test endpoint).

---

### Task 2.2: Create google-drive-service.ts
**File:** `app/src/lib/services/google-drive-service.ts` — **NEW**
**Action:** Create new file
**Requirements:** AUTH-04 (test connection), API-05 (invoke operations), API-06 (browse)

Service wrapping Drive v3 operations. All methods receive a `DriveClient` instance.

```typescript
import { DriveClient } from './google-drive-auth';
import { DriveFile, DriveOperation } from '@/lib/types';
import { logger } from '@/lib/logger';
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
    body: typeof content === 'string' ? Readable.from([content]) : Readable.from([content]),
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
  const changes = (res.data.changes || []).map((c: Record<string, unknown>) => ({
    fileId: c.fileId as string,
    removed: !!(c.removed || (c.file as Record<string, unknown>)?.trashed),
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
```

**Verify:** Exports compile. Real verification via test endpoint (Task 3.4).

---

## Wave 3: API Routes

### Task 3.1: Google Drive CRUD routes
**File:** `app/src/app/api/connectors/google-drive/route.ts` — **NEW**
**Action:** Create new file
**Requirements:** API-01, API-02

Dedicated route for Drive connectors (list + create). Follows Gmail route pattern but with Drive-specific config.

- **GET**: List all Drive connectors (filter `type = 'google_drive'`), mask sensitive fields
- **POST**: Create Drive connector — validate required fields per auth_mode, encrypt credentials, insert into `connectors` table

Note: The generic `/api/connectors` route also works (Task 1.3 added google_drive support), but having a dedicated route allows Drive-specific validation.

**Decision:** Use the GENERIC `/api/connectors` route for create/list (already updated in Task 1.3). This task creates the dedicated `google-drive/` directory for the Drive-specific routes below (test, invoke, browse, oauth2). No separate list/create route needed — avoids duplication.

---

### Task 3.2: Google Drive individual CRUD route
**File:** `app/src/app/api/connectors/google-drive/[id]/route.ts` — **NEW**
**Action:** Create new file
**Requirements:** API-03

- **GET**: Fetch connector by ID, verify `type === 'google_drive'`, mask config, return
- **PUT**: Update connector — smart merge (same pattern as Gmail PATCH in generic route). Check `isEncrypted()` before re-encrypting. Handle SA JSON re-upload vs keep existing.
- **DELETE**: Delete connector + cascade (drive_sync_jobs, drive_indexed_files via FK CASCADE)

Pattern: Follow `app/src/app/api/connectors/[id]/route.ts` but scoped to `google_drive` type. Can delegate to generic route or be standalone.

**Decision:** Delegate to the existing generic `/api/connectors/[id]` route for GET/PATCH/DELETE. Add google_drive merge logic in the PATCH handler (parallel to Gmail merge at lines 51-92). This avoids creating a redundant route.

**Edit `app/src/app/api/connectors/[id]/route.ts`:**
Add `google_drive` config merge branch in PATCH handler:
```typescript
} else if (existingConnector.type === 'google_drive') {
  const existingConfig = JSON.parse(existingConnector.config || '{}');
  const incoming = typeof newConfigValue === 'string' ? JSON.parse(newConfigValue) : newConfigValue;
  const merged: GoogleDriveConfig = {
    auth_mode: incoming.auth_mode ?? existingConfig.auth_mode,
    sa_email: incoming.sa_email ?? existingConfig.sa_email,
    root_folder_id: incoming.root_folder_id ?? existingConfig.root_folder_id,
    root_folder_name: incoming.root_folder_name ?? existingConfig.root_folder_name,
    oauth2_email: incoming.oauth2_email ?? existingConfig.oauth2_email,
    client_id: incoming.client_id ?? existingConfig.client_id,
  };
  // Encrypted fields: keep existing unless new plaintext provided
  for (const field of ['sa_credentials_encrypted', 'client_secret_encrypted', 'refresh_token_encrypted'] as const) {
    if (incoming[field] && incoming[field] !== MASK) {
      merged[field] = isEncrypted(incoming[field]) ? incoming[field] : encrypt(incoming[field]);
    } else {
      merged[field] = existingConfig[field];
    }
  }
  finalConfig = JSON.stringify(merged);
}
```

**Verify:** PATCH update preserves encrypted fields when mask is sent back.

---

### Task 3.3: Test connection route
**File:** `app/src/app/api/connectors/google-drive/[id]/test/route.ts` — **NEW**
**Action:** Create new file
**Requirements:** API-04, AUTH-04

```typescript
// POST /api/connectors/google-drive/[id]/test
// 1. Fetch connector from DB
// 2. Parse config as GoogleDriveConfig
// 3. Create Drive client via createDriveClient(config)
// 4. Call testConnection(drive, config.root_folder_id)
// 5. Update test_status + last_tested in DB
// 6. Return { success, test_status, account_email, files_count, duration_ms }
```

Also add a `'google_drive'` case to the generic test route at `app/src/app/api/connectors/[id]/test/route.ts` (if it dispatches by type).

**Verify:** `POST /api/connectors/google-drive/{id}/test` with valid SA credentials returns `{ success: true, files_count: N }`.

---

### Task 3.4: Invoke route (operations)
**File:** `app/src/app/api/connectors/google-drive/[id]/invoke/route.ts` — **NEW**
**Action:** Create new file
**Requirements:** API-05

```typescript
// POST /api/connectors/google-drive/[id]/invoke
// Body: { operation: DriveOperation, folder_id?, file_id?, file_name?, content? }
// 1. Fetch connector, parse config, create Drive client
// 2. Switch on operation:
//    - 'list': listFiles(drive, folder_id)
//    - 'download': downloadFile(drive, file_id, mime_type)
//    - 'upload': uploadFile(drive, file_name, content, folder_id)
//    - 'create_folder': createFolder(drive, name, folder_id)
// 3. Log to connector_logs
// 4. Increment times_used
// 5. Return operation result
```

Also update the generic invoke route (`app/src/app/api/connectors/[id]/invoke/route.ts`) to remove the Gmail-only guard (line 82-84) and add a `google_drive` branch.

**Verify:** All 4 operations return expected results against real Drive API.

---

### Task 3.5: Browse route (folder picker)
**File:** `app/src/app/api/connectors/google-drive/[id]/browse/route.ts` — **NEW**
**Action:** Create new file
**Requirements:** API-06

```typescript
// GET /api/connectors/google-drive/[id]/browse?parent_id=...
// 1. Fetch connector, parse config, create Drive client
// 2. Call listFolders(drive, parent_id || 'root')
// 3. Return { folders: DriveFile[] }
```

This is a new pattern (no Gmail equivalent). Used by the DriveFolderPicker component in Phase 85.

**Verify:** `GET /api/connectors/google-drive/{id}/browse` returns folder list.

---

### Task 3.6: OAuth2 auth-url route
**File:** `app/src/app/api/connectors/google-drive/oauth2/auth-url/route.ts` — **NEW**
**Action:** Create new file
**Requirements:** API-07

Based on Gmail pattern but with web callback redirect URI instead of OOB.

**IMPORTANT:** Must include `export const dynamic = 'force-dynamic';` (no dynamic params in path).

```typescript
// GET /api/connectors/google-drive/oauth2/auth-url?client_id=...&client_secret=...&redirect_uri=...
// 1. Create OAuth2Client with redirect_uri (defaults to origin + '/api/connectors/google-drive/oauth2/callback')
// 2. Generate auth URL with:
//    - scope: ['https://www.googleapis.com/auth/drive']
//    - access_type: 'offline'
//    - prompt: 'consent'
// 3. Return { url }
```

**Key difference from Gmail:** Uses web callback redirect URI, NOT `urn:ietf:wg:oauth:2.0:oob` (deprecated).

The redirect_uri should be constructed from the request origin or passed as query param:
```typescript
const origin = request.headers.get('origin') || request.headers.get('referer')?.replace(/\/[^/]*$/, '') || '';
const redirect_uri = `${origin}/api/connectors/google-drive/oauth2/callback`;
```

**Verify:** Returns valid Google consent URL with correct redirect_uri.

---

### Task 3.7: OAuth2 callback route
**File:** `app/src/app/api/connectors/google-drive/oauth2/callback/route.ts` — **NEW**
**Action:** Create new file
**Requirements:** API-08

**IMPORTANT:** Must include `export const dynamic = 'force-dynamic';` (no dynamic params in path).

```typescript
// GET /api/connectors/google-drive/oauth2/callback?code=...&state=...
// (Google redirects here after user consent)
// 1. Extract code from query params
// 2. Retrieve client_id + client_secret from state param (base64 JSON) or session
// 3. Create OAuth2Client, exchange code for tokens
// 4. Encrypt refresh_token + client_secret
// 5. Return HTML page that posts result to parent window via postMessage
//    OR redirect to /conectores?drive_oauth=success&tokens=...
```

**Design decision:** Since this is a redirect from Google (not an API call from frontend), the callback should:
1. Exchange the code for tokens server-side
2. Render a minimal HTML page that uses `window.opener.postMessage()` to send the encrypted tokens back to the wizard
3. Close the popup window

```typescript
const html = `
  <html><body><script>
    window.opener.postMessage({
      type: 'drive-oauth-callback',
      refresh_token_encrypted: '${refresh_token_encrypted}',
      client_secret_encrypted: '${client_secret_encrypted}',
      client_id: '${client_id}',
      email: '${email}'
    }, '*');
    window.close();
  </script></body></html>
`;
return new Response(html, { headers: { 'Content-Type': 'text/html' } });
```

**Security note:** The `state` param should include a CSRF nonce verified on callback. For simplicity in this single-user app, we can encode `client_id:client_secret` in an encrypted state param.

**Verify:** Full OAuth2 flow: auth-url → Google consent → callback → tokens returned to frontend.

---

## Wave 4: Integration Updates

### Task 4.1: Update generic connector test route
**File:** `app/src/app/api/connectors/[id]/test/route.ts`
**Action:** Edit existing file

Add `'google_drive'` case to the type switch:
```typescript
case 'google_drive': {
  const driveConfig = config as GoogleDriveConfig;
  const driveClient = createDriveClient(driveConfig);
  const result = await testConnection(driveClient, driveConfig.root_folder_id);
  if (!result.ok) {
    throw new Error(result.error || 'Error de conexion Google Drive');
  }
  message = `Conexion Drive verificada: ${result.files_count} archivos encontrados`;
  break;
}
```

### Task 4.2: Update generic invoke route
**File:** `app/src/app/api/connectors/[id]/invoke/route.ts`
**Action:** Edit existing file

Remove Gmail-only guard (lines 82-84) and add google_drive branch with operation dispatch.

---

## Verification Checklist

| Req | Criterion | How to verify |
|-----|-----------|---------------|
| DATA-01 | `drive_sync_jobs` table exists | `sqlite3 data/docflow.db ".schema drive_sync_jobs"` |
| DATA-02 | `drive_indexed_files` table exists with UNIQUE constraint | `.schema drive_indexed_files` |
| DATA-03 | `sources` has `drive_file_id`, `drive_sync_job_id` columns | `.schema sources` |
| DATA-04 | `'google_drive'` in Connector type union | `grep "google_drive" app/src/lib/types.ts` |
| DATA-05 | All interfaces defined | `npm run build` — no type errors |
| AUTH-01 | SA JSON encrypted on create | POST connector with SA creds, check DB config |
| AUTH-02 | OAuth2 web callback flow works | auth-url → callback → tokens encrypted |
| AUTH-03 | `createDriveClient()` returns Drive v3 client | Test endpoint succeeds |
| AUTH-04 | Test connection lists files + returns email | POST test endpoint returns `{ ok: true }` |
| API-01 | GET /api/connectors lists Drive connectors | curl GET, see google_drive entries |
| API-02 | POST creates connector with encrypted creds | curl POST, verify masked GET |
| API-03 | GET/PUT/DELETE individual connector | CRUD cycle works |
| API-04 | POST test connection | Returns success with file count |
| API-05 | POST invoke operations | All 4 ops return expected results |
| API-06 | GET browse folders | Returns folder tree |
| API-07 | GET auth-url | Returns valid Google consent URL |
| API-08 | GET callback | Exchanges code, returns encrypted tokens |

---

## File Summary

| File | Action | Wave |
|------|--------|------|
| `app/src/lib/types.ts` | EDIT — add types + union | 1 |
| `app/src/lib/db.ts` | EDIT — add tables + migrations | 1 |
| `app/src/app/api/connectors/route.ts` | EDIT — add google_drive to VALID_TYPES, masking, POST branch | 1 |
| `app/src/lib/services/google-drive-auth.ts` | CREATE | 2 |
| `app/src/lib/services/google-drive-service.ts` | CREATE | 2 |
| `app/src/app/api/connectors/google-drive/[id]/test/route.ts` | CREATE | 3 |
| `app/src/app/api/connectors/google-drive/[id]/invoke/route.ts` | CREATE | 3 |
| `app/src/app/api/connectors/google-drive/[id]/browse/route.ts` | CREATE | 3 |
| `app/src/app/api/connectors/google-drive/oauth2/auth-url/route.ts` | CREATE | 3 |
| `app/src/app/api/connectors/google-drive/oauth2/callback/route.ts` | CREATE | 3 |
| `app/src/app/api/connectors/[id]/route.ts` | EDIT — add google_drive merge in PATCH | 3 |
| `app/src/app/api/connectors/[id]/test/route.ts` | EDIT — add google_drive case | 4 |
| `app/src/app/api/connectors/[id]/invoke/route.ts` | EDIT — add google_drive branch | 4 |

**Total:** 5 EDIT + 7 CREATE = 12 files

---
*Plan created: 2026-03-25*
*Phase: 82 — Modelo de datos + Servicio de autenticacion*
