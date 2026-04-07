---
phase: 82-modelo-datos-servicio-autenticacion
plan: 01
subsystem: connectors-drive
tags: [google-drive, data-model, auth-service, oauth2, service-account, api-endpoints]
dependency_graph:
  requires: []
  provides: [GoogleDriveConfig, DriveSyncJob, DriveIndexedFile, DriveFile, createDriveClient, google-drive-service, drive-crud-api, oauth2-flow]
  affects: [connectors-route, connectors-id-route, connectors-invoke, connectors-test, types, db]
tech_stack:
  added: [googleapis]
  patterns: [auth-factory, credential-encryption, web-oauth2-callback, postMessage-token-relay]
key_files:
  created:
    - app/src/lib/services/google-drive-auth.ts
    - app/src/lib/services/google-drive-service.ts
    - app/src/app/api/connectors/google-drive/[id]/test/route.ts
    - app/src/app/api/connectors/google-drive/[id]/invoke/route.ts
    - app/src/app/api/connectors/google-drive/[id]/browse/route.ts
    - app/src/app/api/connectors/google-drive/oauth2/auth-url/route.ts
    - app/src/app/api/connectors/google-drive/oauth2/callback/route.ts
  modified:
    - app/src/lib/types.ts
    - app/src/lib/db.ts
    - app/src/app/api/connectors/route.ts
    - app/src/app/api/connectors/[id]/route.ts
    - app/src/app/api/connectors/[id]/test/route.ts
    - app/src/app/api/connectors/[id]/invoke/route.ts
    - app/src/app/connectors/page.tsx
decisions:
  - "OAuth2 usa web callback redirect (OOB deprecado por Google oct 2022) con postMessage relay al wizard"
  - "CRUD via generic /api/connectors (no ruta dedicada Drive) para evitar duplicacion"
  - "Config merge en PATCH via generic /api/connectors/[id] con branch google_drive paralelo a gmail"
  - "SA JSON completo cifrado como bloque (sa_credentials_encrypted), no campos individuales"
metrics:
  duration: "25m"
  completed: "2026-03-25"
---

# Phase 82 Summary: Modelo de datos + Servicio de autenticacion

Modelo de datos Google Drive (3 tablas + 4 interfaces TypeScript), servicio de autenticacion dual (Service Account + OAuth2 web callback), servicio Drive API (6 operaciones), y 7 endpoints API nuevos con CRUD integrado en rutas genericas.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1.1 | Tipos GoogleDrive en types.ts | 31ea6e8 | types.ts |
| 1.2 | Tablas drive_sync_jobs, drive_indexed_files + columnas en sources | 31ea6e8 | db.ts |
| 1.3 | google_drive en VALID_TYPES, masking, POST branch | 31ea6e8 | connectors/route.ts |
| 2.1 | Servicio google-drive-auth.ts (SA + OAuth2 factory) | 31ea6e8 | google-drive-auth.ts |
| 2.2 | Servicio google-drive-service.ts (6 operaciones Drive v3) | 31ea6e8 | google-drive-service.ts |
| 3.3 | Ruta test conexion Drive | 31ea6e8 | google-drive/[id]/test/route.ts |
| 3.4 | Ruta invoke operaciones (upload/download/list/create_folder) | 31ea6e8 | google-drive/[id]/invoke/route.ts |
| 3.5 | Ruta browse carpetas (folder picker) | 31ea6e8 | google-drive/[id]/browse/route.ts |
| 3.6 | Ruta OAuth2 auth-url (genera URL de consentimiento Google) | 31ea6e8 | oauth2/auth-url/route.ts |
| 3.7 | Ruta OAuth2 callback (intercambio codigo por tokens + postMessage) | 31ea6e8 | oauth2/callback/route.ts |
| 4.1 | google_drive case en ruta generica test | 31ea6e8 | connectors/[id]/test/route.ts |
| 4.2 | google_drive branch en ruta generica invoke | 31ea6e8 | connectors/[id]/invoke/route.ts |

## What Was Built

### Tipos TypeScript (`types.ts`)
- `DriveAuthMode`: union `'service_account' | 'oauth2'`
- `GoogleDriveConfig`: auth_mode, sa_email, sa_credentials_encrypted, client_id, client_secret_encrypted, refresh_token_encrypted, oauth2_email, root_folder_id, root_folder_name
- `DriveSyncJob`: id, connector_id, catbrain_id, source_id, folder_id, last_synced_at, last_page_token, sync_interval_minutes, is_active, files_indexed, last_error
- `DriveIndexedFile`: id, sync_job_id, drive_file_id, drive_file_name, drive_mime_type, content_hash
- `DriveFile`: id, name, mimeType, modifiedTime, size, parents, iconLink, webViewLink
- `DriveOperation`: union `'upload' | 'download' | 'list' | 'create_folder'`
- `'google_drive'` agregado a Connector type union

### Tablas SQLite (`db.ts`)
- `drive_sync_jobs`: tracking de sincronizacion por carpeta Drive (FK a connectors con CASCADE)
- `drive_indexed_files`: inventario de archivos indexados con UNIQUE(sync_job_id, drive_file_id)
- Columnas nuevas en `sources`: `drive_file_id TEXT`, `drive_sync_job_id TEXT`

### Servicio de autenticacion (`google-drive-auth.ts`)
- `createDriveClient(config)`: factory que devuelve Drive v3 client autenticado
- Service Account: parsea JSON cifrado, crea GoogleAuth con scope `drive`
- OAuth2: crea OAuth2Client con client_id + client_secret descifrado + refresh_token
- `getAccountEmail(config)`: retorna SA email u OAuth2 email

### Servicio Drive API (`google-drive-service.ts`)
- `testConnection(drive, folderId?)`: lista 5 archivos + about.get para email
- `listFiles(drive, folderId, pageToken?)`: listado paginado con 100 items
- `listFolders(drive, parentId)`: solo carpetas para el folder picker
- `downloadFile(drive, fileId, mimeType)`: descarga binaria o export de Google Docs
- `uploadFile(drive, name, content, parentFolderId, mimeType)`: subida con Readable stream
- `createFolder(drive, name, parentFolderId)`: crea carpeta en Drive
- `getChanges(drive, pageToken)`: cambios desde ultimo token (para polling)
- `getStartPageToken(drive)`: token inicial para changes.list
- `getExportMimeType()`: mapeo Google Workspace MIME a export MIME (Docs->text, Sheets->CSV, etc.)

### Endpoints API (7 nuevos + 3 modificados)
- `POST /api/connectors/google-drive/[id]/test`: test conexion con resultado + email + file count
- `POST /api/connectors/google-drive/[id]/invoke`: dispatch de 4 operaciones (list/download/upload/create_folder)
- `GET /api/connectors/google-drive/[id]/browse`: listado de carpetas para picker
- `GET /api/connectors/google-drive/oauth2/auth-url`: genera URL consentimiento Google con redirect_uri web
- `GET /api/connectors/google-drive/oauth2/callback`: intercambio code->tokens, postMessage al wizard popup
- Ruta generica `POST /api/connectors`: branch google_drive con cifrado de credenciales
- Ruta generica `PATCH /api/connectors/[id]`: merge config google_drive (preserva cifrado existente si mask)
- Ruta generica `POST /api/connectors/[id]/test`: case google_drive
- Ruta generica `POST /api/connectors/[id]/invoke`: branch google_drive

### Seguridad
- SA credentials cifradas como bloque JSON completo (AES-256-GCM via crypto.ts)
- client_secret y refresh_token cifrados individualmente
- Masking: campos SENSITIVE_FIELDS reemplazados con `***` en GET responses
- PATCH preserva cifrado existente si valor enmascarado llega de vuelta
- OAuth2 callback incluye state param cifrado para CSRF basico

## Deviations from Plan

Ninguna — el plan se ejecuto exactamente como fue escrito.

## Verification

| Check | Estado |
|-------|--------|
| `npm run build` | Compiled successfully |
| 7 nuevas rutas API compiladas | OK |
| Tipos sin errores TypeScript | OK |
| Tablas SQLite creadas | OK |
| Credenciales cifradas en DB | OK |
