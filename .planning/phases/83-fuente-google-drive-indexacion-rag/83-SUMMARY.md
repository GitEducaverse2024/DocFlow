---
phase: 83-fuente-google-drive-indexacion-rag
plan: 01
subsystem: drive-source-rag
tags: [google-drive, sources, polling, rag-indexing, content-extraction, sync]
dependency_graph:
  requires: [82-PLAN]
  provides: [drive-source-endpoint, DrivePollingService, manual-sync-endpoint, drive-source-ui]
  affects: [types, instrumentation, source-list, source-item, i18n, logger]
tech_stack:
  added: []
  patterns: [singleton-polling, sha256-hash-comparison, changes-list-api, incremental-sync]
key_files:
  created:
    - app/src/app/api/catbrains/[id]/sources/drive/route.ts
    - app/src/lib/services/drive-polling.ts
    - app/src/app/api/catbrains/[id]/sources/drive/[sourceId]/sync/route.ts
  modified:
    - app/src/lib/types.ts
    - app/src/instrumentation.ts
    - app/src/components/sources/source-list.tsx
    - app/src/components/sources/source-item.tsx
    - app/src/lib/logger.ts
decisions:
  - "DrivePollingService sigue patron singleton de TaskScheduler con master tick 60s e intervalos por job"
  - "Polling usa changes.list API con page tokens (no listado completo) para eficiencia"
  - "SHA-256 hash comparison para evitar re-indexacion si contenido no cambio"
  - "RAG append pipeline sin cambios — sources con is_pending_append=1 y content_text poblado son recogidos automaticamente"
  - "Archivos eliminados en Drive marcan source como status=error (no delete) para preservar historial"
metrics:
  duration: "20m"
  completed: "2026-03-25"
---

# Phase 83 Summary: Fuente Google Drive + Indexacion RAG

Endpoint para crear fuentes desde carpeta Drive con descarga, extraccion de contenido y creacion de sources RAG-ready; DrivePollingService singleton para deteccion incremental de cambios via changes.list API; endpoint de sync manual por archivo; UI con badge DRIVE y filtro en lista de fuentes.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1.1 | google_drive en Source type union + drive_file_id/drive_sync_job_id | 299ebd0 | types.ts |
| 1.2 | POST /api/catbrains/[id]/sources/drive (indexacion carpeta) | 299ebd0 | sources/drive/route.ts |
| 2.1 | DrivePollingService singleton (master tick + per-job intervals) | 299ebd0 | drive-polling.ts |
| 2.2 | POST manual sync endpoint (re-download si hash cambio) | 299ebd0 | sources/drive/[sourceId]/sync/route.ts |
| 3.1 | Registro DrivePollingService en instrumentation.ts | 299ebd0 | instrumentation.ts |
| 3.2 | Badge DRIVE, filtro, stats, badge SINCRONIZANDO en source-list | 299ebd0 | source-list.tsx |
| 3.3 | Icono Drive (HardDrive sky-500) y badge tipo DRIVE en source-item | 299ebd0 | source-item.tsx |

## What Was Built

### Endpoint de indexacion de carpeta Drive (`sources/drive/route.ts`)

`POST /api/catbrains/[id]/sources/drive` con body `{connector_id, folder_id, folder_name, sync_interval_minutes}`.

Flujo:
1. Obtiene conector y crea Drive client via `createDriveClient(config)`
2. Crea `drive_sync_jobs` row con page token inicial via `getStartPageToken()`
3. Lista archivos en carpeta con `listFiles(drive, folder_id)`
4. Por cada archivo (excepto carpetas):
   - Descarga contenido via `downloadFile()` (con export para Google Docs)
   - Guarda archivo en `{PROJECTS_PATH}/{catbrainId}/sources/{sourceId}.{ext}`
   - Extrae texto via `extractContent(filePath)`
   - Inserta source row con `type: 'google_drive'`, `is_pending_append: 1`
   - Registra en `drive_indexed_files` con SHA-256 content hash
5. Actualiza `files_indexed` en sync job
6. Retorna `{sync_job_id, sources_created, sources[], files_skipped}`

El pipeline RAG existente recoge automaticamente las sources con `is_pending_append: 1` y `content_text` poblado — sin cambios necesarios en `/rag/append`.

### DrivePollingService (`drive-polling.ts`)

Singleton que sigue el patron de TaskScheduler:

- **Master tick**: `setInterval(60s)` que revisa que jobs estan pendientes
- **Per-job intervals**: cada job tiene su `sync_interval_minutes` (default 15min)
- **loadActiveJobs()**: carga jobs activos de DB al iniciar y en cada tick
- **refreshJob(jobId)**: notificacion hot-reload cuando se crea/actualiza un job
- **pollJob(job)**: flujo de deteccion de cambios:
  1. Obtiene conector y crea Drive client
  2. Si no hay page token, obtiene token inicial y retorna (primera vez)
  3. Llama `getChanges(drive, pageToken)` para cambios incrementales
  4. Filtra cambios relevantes (files cuyo parent es la carpeta monitoreada)
  5. Para archivos eliminados: marca source como `status='error'` con mensaje
  6. Para archivos nuevos/modificados: descarga, calcula SHA-256 hash
  7. Si hash igual al existente: skip (sin cambio real de contenido)
  8. Si hash diferente o archivo nuevo: guarda, extrae, actualiza/crea source con `is_pending_append: 1`
  9. Actualiza `last_synced_at`, `last_page_token`, `files_indexed`
- **Error handling**: errores por job almacenados en `last_error` sin interrumpir el ciclo

### Endpoint de sync manual (`sources/drive/[sourceId]/sync/route.ts`)

`POST /api/catbrains/[id]/sources/drive/[sourceId]/sync`

- Busca source tipo `google_drive` con `drive_file_id` y `drive_sync_job_id`
- Obtiene conector via sync job, crea Drive client
- Descarga archivo y calcula SHA-256 hash
- Si hash igual: retorna `{changed: false}`
- Si hash diferente: re-escribe archivo, re-extrae contenido, marca `is_pending_append: 1`
- Retorna `{changed: true, message: 'Contenido actualizado y marcado para re-indexar'}`

### Registro en instrumentation.ts

DrivePollingService se inicia junto a TaskScheduler en `register()`:
```typescript
const { drivePollingService } = await import('@/lib/services/drive-polling');
drivePollingService.start();
```

### UI de fuentes Drive

**source-list.tsx:**
- Stats counter incluye `google_drive` count
- Stats display muestra `{drive} Drive` en el resumen
- Filtro tipo incluye opcion "Google Drive"
- Badge `SINCRONIZANDO` con `animate-pulse` sky-400 para sources con `drive_sync_job_id` activo

**source-item.tsx:**
- Icono `HardDrive` (lucide-react) en sky-500 para tipo google_drive
- Badge tipo `DRIVE` en sky-500 (matching Drive brand color)

### Logger
- Agregados `'drive'` y `'drive-polling'` como log sources validos

## Deviations from Plan

Ninguna — el plan se ejecuto exactamente como fue escrito.

## Verification

| Check | Estado |
|-------|--------|
| `npm run build` | Compiled successfully |
| 3 nuevas rutas API compiladas | OK |
| DrivePollingService singleton exporta correctamente | OK |
| Tipos Source actualizados sin errores | OK |
| UI badges y filtros renderizan | OK |
| Logger acepta 'drive' y 'drive-polling' | OK |
