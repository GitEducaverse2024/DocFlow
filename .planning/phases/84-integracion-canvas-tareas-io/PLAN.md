# Phase 84 Plan: Integracion Canvas y Tareas (I/O)

**Phase:** 84
**Goal:** El nodo CONNECTOR en Canvas y los pasos de Tareas pueden usar Google Drive para subir outputs o descargar inputs.
**Requirements:** CANVAS-01..07
**Depends on:** Phase 82 (DONE)
**Estimated plans:** 1 (this file — all tasks are tightly coupled)

---

## Wave 1: Canvas Executor — Google Drive Branch

### Task 1.1: Add google_drive branch to canvas-executor.ts
**File:** `app/src/lib/services/canvas-executor.ts`
**Action:** Edit existing file
**Requirements:** CANVAS-01, CANVAS-02, CANVAS-03, CANVAS-04, CANVAS-05

After the `gmail` block (line ~540, before the `mcp_server` check), add a `google_drive` branch:

```typescript
// Google Drive connector: execute Drive operation with predecessor output
if ((connector.type as string) === 'google_drive') {
  const driveConfig: GoogleDriveConfig = connector.config ? JSON.parse(connector.config as string) : {};
  const operation = (data.drive_operation as string) || 'upload';
  const folderId = (data.drive_folder_id as string) || driveConfig.root_folder_id || 'root';
  const fileName = (data.drive_file_name as string) || `output-${node.id}.md`;
  const fileId = (data.drive_file_id as string) || '';

  try {
    const drive = createDriveClient(driveConfig);
    let driveResult: string = predecessorOutput;

    switch (operation) {
      case 'upload': {
        const result = await uploadFile(drive, fileName, predecessorOutput, folderId);
        logger.info('canvas', 'Drive upload completed', {
          canvasId, nodeId: node.id, fileId: result.id, fileName: result.name,
        });
        // Return predecessor output (upload is a side-effect)
        driveResult = predecessorOutput;
        break;
      }
      case 'download': {
        if (!fileId) {
          logger.error('canvas', 'Drive download: file_id missing', { nodeId: node.id });
          return { output: predecessorOutput };
        }
        const downloaded = await downloadFile(drive, fileId, (data.drive_mime_type as string) || 'application/octet-stream');
        driveResult = downloaded.content.toString('utf-8');
        logger.info('canvas', 'Drive download completed', {
          canvasId, nodeId: node.id, fileId, bytes: downloaded.content.length,
        });
        break;
      }
      case 'list': {
        const listed = await listFiles(drive, folderId);
        driveResult = JSON.stringify(listed.files.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType })));
        logger.info('canvas', 'Drive list completed', {
          canvasId, nodeId: node.id, folderId, count: listed.files.length,
        });
        break;
      }
      case 'create_folder': {
        const folder = await createFolder(drive, fileName, folderId);
        driveResult = JSON.stringify({ id: folder.id, name: folder.name });
        logger.info('canvas', 'Drive create_folder completed', {
          canvasId, nodeId: node.id, folderId: folder.id, folderName: folder.name,
        });
        break;
      }
    }

    // Log to connector_logs
    const logId = generateId();
    const now = new Date().toISOString();
    try {
      db.prepare(`INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(logId, connectorId, JSON.stringify({ operation, folder_id: folderId, file_id: fileId, file_name: fileName, canvas_id: canvasId, node_id: node.id }),
          JSON.stringify({ ok: true }), 'success', Date.now() - executionStart, now);
    } catch (logErr) { logger.error('canvas', 'Error logging Drive invoke', { error: (logErr as Error).message }); }
    try { db.prepare('UPDATE connectors SET times_used = times_used + 1, updated_at = ? WHERE id = ?').run(now, connectorId); } catch { /* ignore */ }

    return { output: driveResult };
  } catch (err) {
    const errMsg = (err as Error).message;
    logger.error('canvas', 'Drive connector error', { nodeId: node.id, operation, error: errMsg });

    // Log failure
    const logId = generateId();
    const now = new Date().toISOString();
    try {
      db.prepare(`INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(logId, connectorId, JSON.stringify({ operation, folder_id: folderId, file_id: fileId, file_name: fileName }),
          JSON.stringify({ ok: false }), 'failed', Date.now() - executionStart, errMsg.substring(0, 5000), now);
    } catch { /* ignore */ }

    return { output: predecessorOutput };
  }
}
```

**Imports to add at top of file:**
```typescript
import { GoogleDriveConfig } from '@/lib/types';
import { createDriveClient } from '@/lib/services/google-drive-auth';
import { listFiles, downloadFile, uploadFile, createFolder } from '@/lib/services/google-drive-service';
```

**Note:** Need to capture `executionStart` timestamp. Check if there's already a timing variable in the connector case. If not, add `const executionStart = Date.now();` at the start of the `connector` case block.

Also add `import { generateId } from '@/lib/utils';` if not already imported (check — it may already be there for other uses).

**Verify:** `npm run build` passes. Canvas with google_drive CONNECTOR node executes upload/download/list/create_folder.

---

## Wave 2: CatBrain Connector Executor — Google Drive Branch

### Task 2.1: Add google_drive to catbrain-connector-executor.ts
**File:** `app/src/lib/services/catbrain-connector-executor.ts`
**Action:** Edit existing file
**Requirements:** CANVAS-06

1. Update `ConnectorRow.type` union (line ~22) to include `'google_drive'`:
   ```typescript
   type: 'n8n_webhook' | 'http_api' | 'mcp_server' | 'email' | 'gmail' | 'google_drive';
   ```

2. Add `google_drive` case in `executeConnector()` switch (after the `gmail` case, before default/closing):
   ```typescript
   case 'google_drive': {
     // CatBrain connector: use invoke API endpoint (simpler than importing service directly)
     const baseUrl = process['env']['NEXTAUTH_URL'] || 'http://localhost:3500';
     const invokeRes = await fetch(`${baseUrl}/api/connectors/${connector.id}/invoke`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         output: query,
         operation: config.default_operation || 'list',
         folder_id: config.root_folder_id || 'root',
         file_name: `catbrain-output-${Date.now()}.md`,
       }),
       signal,
     });
     if (!invokeRes.ok) {
       const errText = await invokeRes.text();
       throw new Error(`Drive invoke HTTP ${invokeRes.status}: ${errText.substring(0, 500)}`);
     }
     return await invokeRes.json();
   }
   ```

**Design note:** For CatBrain connectors, we call the invoke API instead of importing the service directly. This keeps the executor lightweight and reuses all logging/validation from the API route. The CatBrain context primarily uses the `list` operation (to get file listings for context enrichment).

**Verify:** A CatBrain with a google_drive connector attached can list Drive files during query execution.

---

## Wave 3: Node Config Panel — Drive Operation Fields

### Task 3.1: Add type to Connector interface and conditional Drive fields
**File:** `app/src/components/canvas/node-config-panel.tsx`
**Action:** Edit existing file
**Requirements:** CANVAS-07

1. Add `type` to the local `Connector` interface (line ~27):
   ```typescript
   interface Connector {
     id: string;
     name: string;
     emoji?: string;
     type?: string;
   }
   ```

2. Replace `renderConnectorForm()` (lines 585-627) with enhanced version that shows Drive-specific fields when a `google_drive` connector is selected:

   ```typescript
   function renderConnectorForm() {
     const selectedConnector = connectors.find(c => c.id === (data.connectorId as string));
     const isDrive = selectedConnector?.type === 'google_drive';

     return (
       <div className="grid grid-cols-2 gap-3">
         <div>
           <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.connector.connector')}</label>
           <select
             className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
             value={(data.connectorId as string) || ''}
             onChange={e => {
               const connector = connectors.find(c => c.id === e.target.value);
               update({
                 connectorId: e.target.value || null,
                 connectorName: connector?.name || null,
                 // Reset Drive fields when changing connector
                 ...(connector?.type !== 'google_drive' ? {
                   drive_operation: null, drive_folder_id: null, drive_file_id: null, drive_file_name: null,
                 } : {}),
               });
             }}
           >
             <option value="">{t('nodeConfig.connector.noConnector')}</option>
             {connectors.map(c => (
               <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>
             ))}
           </select>
         </div>

         {!isDrive && (
           <div>
             <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.connector.mode')}</label>
             <select
               className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
               value={(data.mode as string) || 'after'}
               onChange={e => update({ mode: e.target.value })}
             >
               <option value="before">{t('nodeConfig.connector.modeBefore')}</option>
               <option value="after">{t('nodeConfig.connector.modeAfter')}</option>
             </select>
           </div>
         )}

         {isDrive && (
           <>
             <div>
               <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.connector.operation')}</label>
               <select
                 className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                 value={(data.drive_operation as string) || 'upload'}
                 onChange={e => update({ drive_operation: e.target.value })}
               >
                 <option value="upload">{t('nodeConfig.connector.operationUpload')}</option>
                 <option value="download">{t('nodeConfig.connector.operationDownload')}</option>
                 <option value="list">{t('nodeConfig.connector.operationList')}</option>
                 <option value="create_folder">{t('nodeConfig.connector.operationCreateFolder')}</option>
               </select>
             </div>

             {/* folder_id — shown for upload, list, create_folder */}
             {((data.drive_operation as string) || 'upload') !== 'download' && (
               <div className="col-span-2">
                 <label className="block text-xs text-zinc-400 mb-1">
                   {t('nodeConfig.connector.folderId')} <span className="text-zinc-600">({t('nodeConfig.merge.optional')})</span>
                 </label>
                 <input
                   type="text"
                   className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 font-mono text-xs"
                   placeholder="root"
                   value={(data.drive_folder_id as string) || ''}
                   onChange={e => update({ drive_folder_id: e.target.value })}
                 />
               </div>
             )}

             {/* file_id — shown for download */}
             {(data.drive_operation as string) === 'download' && (
               <div className="col-span-2">
                 <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.connector.fileId')}</label>
                 <input
                   type="text"
                   className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 font-mono text-xs"
                   placeholder="Google Drive file ID"
                   value={(data.drive_file_id as string) || ''}
                   onChange={e => update({ drive_file_id: e.target.value })}
                 />
               </div>
             )}

             {/* file_name — shown for upload and create_folder */}
             {((data.drive_operation as string) === 'upload' || (data.drive_operation as string) === 'create_folder' || !(data.drive_operation as string)) && (
               <div className="col-span-2">
                 <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.connector.fileName')}</label>
                 <input
                   type="text"
                   className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 font-mono text-xs"
                   placeholder={((data.drive_operation as string) === 'create_folder') ? 'Mi Carpeta' : 'output.md'}
                   value={(data.drive_file_name as string) || ''}
                   onChange={e => update({ drive_file_name: e.target.value })}
                 />
               </div>
             )}
           </>
         )}

         {!isDrive && (
           <div className="col-span-2">
             <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.connector.payloadTemplate')}</label>
             <textarea
               className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-vertical focus:outline-none focus:border-zinc-500 font-mono text-xs"
               rows={2}
               placeholder={t('nodeConfig.connector.payloadPlaceholder')}
               value={(data.payload as string) || ''}
               onChange={e => update({ payload: e.target.value })}
             />
           </div>
         )}
       </div>
     );
   }
   ```

3. Update `fetch('/api/connectors')` response handling (line ~115) to include `type` in mapped data:
   ```typescript
   fetch('/api/connectors').then(r => r.json()).then(data => {
     setConnectors(Array.isArray(data) ? data.map((c: Record<string, unknown>) => ({
       id: c.id as string, name: c.name as string, emoji: c.emoji as string, type: c.type as string,
     })) : []);
   }).catch(() => {});
   ```

   **Check first:** The current code does `.then(setConnectors)` — the API returns the full connector objects, so `type` is already in the data. The local interface just needs to declare it. If the API response is an array directly, `setConnectors` will work if the interface matches. Verify the API response shape.

**Verify:** Select a google_drive connector in Canvas node config. Operation selector appears. Dynamic fields show/hide based on operation. Build passes.

---

## Wave 4: i18n Keys

### Task 4.1: Add i18n keys for Drive operations
**Files:** `app/messages/es.json` + `app/messages/en.json`
**Action:** Edit existing files

Add under the `canvas.nodeConfig.connector` namespace:

**es.json:**
```json
"operation": "Operacion",
"operationUpload": "Subir archivo",
"operationDownload": "Descargar archivo",
"operationList": "Listar archivos",
"operationCreateFolder": "Crear carpeta",
"folderId": "ID de carpeta",
"fileId": "ID de archivo",
"fileName": "Nombre de archivo"
```

**en.json:**
```json
"operation": "Operation",
"operationUpload": "Upload file",
"operationDownload": "Download file",
"operationList": "List files",
"operationCreateFolder": "Create folder",
"folderId": "Folder ID",
"fileId": "File ID",
"fileName": "File name"
```

**Verify:** No missing i18n key warnings. UI labels display correctly in Spanish.

---

## Wave 5: Tests

### Task 5.1: Unit tests for canvas-executor Drive branch
**File:** `app/src/__tests__/canvas-executor-drive.test.ts` — **NEW**
**Action:** Create new file

Test cases using Vitest with mocked dependencies:
1. **Upload**: google_drive connector node with operation=upload calls `uploadFile()` with predecessor output, returns predecessor output
2. **Download**: operation=download calls `downloadFile()`, returns file content as output
3. **List**: operation=list calls `listFiles()`, returns JSON stringified array
4. **Create folder**: operation=create_folder calls `createFolder()`, returns folder info JSON
5. **Missing file_id on download**: returns predecessor output (graceful fallback)
6. **Connector logs**: verifies `connector_logs` INSERT is called after operation
7. **Error handling**: Drive API failure logs error, returns predecessor output

Mock setup:
```typescript
vi.mock('@/lib/services/google-drive-auth', () => ({
  createDriveClient: vi.fn().mockReturnValue({}),
}));
vi.mock('@/lib/services/google-drive-service', () => ({
  uploadFile: vi.fn().mockResolvedValue({ id: 'file-1', name: 'output.md' }),
  downloadFile: vi.fn().mockResolvedValue({ content: Buffer.from('file content'), exportedMime: 'text/plain' }),
  listFiles: vi.fn().mockResolvedValue({ files: [{ id: '1', name: 'doc.pdf', mimeType: 'application/pdf' }] }),
  createFolder: vi.fn().mockResolvedValue({ id: 'folder-1', name: 'New Folder' }),
}));
```

**Note:** The canvas-executor function `executeNodeByType` is not exported directly — it's an internal function within `executeCanvas`. Testing may require either:
- Exporting `executeNodeByType` for testability
- Testing via the full `executeCanvas` path with a minimal canvas
- Testing the Drive logic in isolation by extracting it to a helper

**Decision:** Extract the Drive execution logic into a testable helper function `executeDriveConnectorNode()` and export it. This is cleaner than mocking the entire canvas flow.

### Task 5.2: API test for invoke endpoint with Drive operations
**File:** `app/e2e/api/connectors-drive.spec.ts` — **NEW**
**Action:** Create new file

Playwright API tests against running Docker app:
1. **POST /api/connectors** with type=google_drive — creates connector (uses mock/invalid creds, just tests API shape)
2. **POST /api/connectors/{id}/invoke** with operation=list — tests dispatch (will fail auth but verifies routing + error shape)
3. **Verify connector_logs entry** created after invoke

**Note:** Real Drive API tests require valid credentials. These API tests verify routing and error handling shapes, not actual Drive operations.

**Verify:** `npx vitest run src/__tests__/canvas-executor-drive.test.ts` passes. Playwright API spec passes shape assertions.

---

## Verification Checklist

| Req | Criterion | How to verify |
|-----|-----------|---------------|
| CANVAS-01 | Canvas CONNECTOR node with type google_drive executes upload/download/list/create_folder | Unit tests + manual Canvas run |
| CANVAS-02 | Upload serializes predecessor output as .md/.txt with configurable name | Unit test: uploadFile called with predecessor output |
| CANVAS-03 | Download returns file content as string input for next node | Unit test: output === file content string |
| CANVAS-04 | List returns JSON array of file names/IDs | Unit test: output === JSON.stringify(files) |
| CANVAS-05 | Every invocation logged in connector_logs | Unit test: db.prepare INSERT called |
| CANVAS-06 | catbrain-connector-executor handles google_drive type | Type check + manual CatBrain test |
| CANVAS-07 | Node config panel shows operation selector + dynamic fields | Manual UI test + build passes |

---

## File Summary

| File | Action | Wave |
|------|--------|------|
| `app/src/lib/services/canvas-executor.ts` | EDIT — add google_drive branch + imports | 1 |
| `app/src/lib/services/catbrain-connector-executor.ts` | EDIT — add google_drive case + type | 2 |
| `app/src/components/canvas/node-config-panel.tsx` | EDIT — add type to interface + Drive fields | 3 |
| `app/messages/es.json` | EDIT — add i18n keys | 4 |
| `app/messages/en.json` | EDIT — add i18n keys | 4 |
| `app/src/__tests__/canvas-executor-drive.test.ts` | CREATE — unit tests | 5 |
| `app/e2e/api/connectors-drive.spec.ts` | CREATE — API tests | 5 |

**Total:** 5 EDIT + 2 CREATE = 7 files

---
*Plan created: 2026-03-25*
*Phase: 84 — Integracion Canvas y Tareas (I/O)*
