# Phase 84 Research: Integracion Canvas y Tareas (I/O)

## Goal
El nodo CONNECTOR en Canvas y los pasos de Tareas pueden usar Google Drive para subir outputs o descargar inputs.

## Dependencies
- Phase 82 (data model + auth + API): **DONE** — all files exist
  - `google-drive-auth.ts`: `createDriveClient(config)` returns Drive v3 client
  - `google-drive-service.ts`: `listFiles`, `downloadFile`, `uploadFile`, `createFolder`
  - Invoke endpoint: `POST /api/connectors/google-drive/[id]/invoke` handles all 4 operations
  - Types: `GoogleDriveConfig`, `DriveFile`, `DriveOperation` in `types.ts`

## Codebase Analysis

### 1. Canvas Executor — Connector Node (`canvas-executor.ts:515-638`)
Current connector dispatch:
- `gmail` → `parseOutputToEmailPayload()` + `sendEmail()`, returns predecessor output
- `mcp_server` → JSON-RPC call, returns MCP output
- Generic (n8n_webhook, http_api) → fetch webhook URL, before/after mode

**Gap for Phase 84:** No `google_drive` branch. Need to add dispatch that:
1. Parses `data.operation` from node config (upload/download/list/create_folder)
2. Calls invoke endpoint OR calls service directly
3. For upload: serializes predecessor output as file content
4. For download: returns file content as node output
5. For list: returns JSON array as output
6. Logs to `connector_logs`

**Design decision: Direct service call vs API endpoint?**
- Gmail in canvas-executor calls `sendEmail()` directly (no API)
- MCP calls external URL directly
- Google Drive should call service directly (same process, avoid HTTP overhead)
- But still log to `connector_logs` for consistency

### 2. CatBrain Connector Executor (`catbrain-connector-executor.ts`)
Current types handled: `n8n_webhook`, `http_api`, `mcp_server`, `email`, `gmail`
- `ConnectorRow.type` union does NOT include `'google_drive'`
- `executeConnector()` switch handles 5 types
- **Gap:** Need `google_drive` case in switch

**CatBrain context:** When a CatBrain has a google_drive connector attached, queries should be able to trigger Drive operations. The query text becomes the operation context.

### 3. Generic Invoke Route (`/api/connectors/[id]/invoke/route.ts`)
Already handles `google_drive` type (lines 94-138):
- Dispatches by `operation` field
- Logs to `connector_logs`
- Increments `times_used`
- This was added in Phase 82

### 4. Node Config Panel (`node-config-panel.tsx:585-627`)
Current `renderConnectorForm()`:
- Dropdown to select connector
- Mode selector (before/after)
- Payload template textarea

**Gap:** No Google Drive-specific fields. When a google_drive connector is selected, should show:
- Operation selector (upload/download/list/create_folder)
- Dynamic fields based on operation:
  - **list**: folder_id (optional, defaults to root)
  - **download**: file_id (required), mime_type hint
  - **upload**: file_name (required), folder_id (optional)
  - **create_folder**: folder name, parent folder_id

### 5. Connector Logs
Already handled via generic invoke route. Canvas executor needs to log directly to `connector_logs` table when calling service.

### 6. i18n Keys Needed
- `nodeConfig.connector.operation` — "Operacion"
- `nodeConfig.connector.operationUpload` — "Subir archivo"
- `nodeConfig.connector.operationDownload` — "Descargar archivo"
- `nodeConfig.connector.operationList` — "Listar archivos"
- `nodeConfig.connector.operationCreateFolder` — "Crear carpeta"
- `nodeConfig.connector.folderId` — "ID de carpeta"
- `nodeConfig.connector.fileId` — "ID de archivo"
- `nodeConfig.connector.fileName` — "Nombre de archivo"

## Key Design Decisions

1. **Canvas executor calls service directly** (not API): avoids HTTP overhead, consistent with gmail pattern
2. **Upload default behavior**: predecessor output serialized as `.md` (configurable via file_name extension)
3. **Download returns content as string**: next node receives file content
4. **List returns JSON string**: `JSON.stringify(files)` for downstream processing
5. **create_folder returns folder ID**: useful for chaining with upload
6. **Node config shows Drive fields conditionally**: only when selected connector is `google_drive` type
7. **CatBrain executor**: google_drive invoked via internal API call (simpler than importing service in executor)

## Files to Modify

| File | Change |
|------|--------|
| `canvas-executor.ts` | Add `google_drive` branch in connector case |
| `catbrain-connector-executor.ts` | Add `google_drive` case + ConnectorRow type |
| `node-config-panel.tsx` | Add Drive operation fields when google_drive selected |
| `messages/es.json` | i18n keys for Drive operations |
| `messages/en.json` | i18n keys for Drive operations |

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/services/__tests__/canvas-executor-drive.test.ts` | Unit tests for Drive canvas execution |

## Risk Assessment

- **Low risk**: Additive changes only — new branches in existing switch statements
- **No breaking changes**: Existing connector types unaffected
- **Testing**: Mock Google Drive service functions for unit tests
