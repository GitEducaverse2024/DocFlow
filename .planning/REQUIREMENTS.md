# Requirements: v19.0 Conector Google Drive

**Defined:** 2026-03-25
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.

## v19.0 Requirements

Conector Google Drive nativo en DoCatFlow con dos capas: (1) fuente de indexacion RAG — carpetas de Drive indexadas automaticamente como cualquier archivo local, y (2) conector de I/O en Canvas y Tareas — CatPaws leen y escriben archivos en Drive.

Autenticacion: Service Account (primaria) y OAuth2 web callback (secundaria, reemplaza OOB deprecado).
Dependencias ya resueltas: `googleapis` instalado, cifrado AES-256-GCM, pipeline RAG, extractores multi-formato, wizard Gmail como plantilla.

### DATA — Modelo de datos

- [ ] **DATA-01**: Tabla `drive_sync_jobs` con campos: id, connector_id (FK connectors), catbrain_id, source_id, folder_id, folder_name, last_synced_at, last_page_token, sync_interval_minutes (default 15), is_active, files_indexed, last_error, created_at, updated_at
- [ ] **DATA-02**: Tabla `drive_indexed_files` con campos: id, sync_job_id (FK drive_sync_jobs), drive_file_id, drive_file_name, drive_mime_type, drive_modified_time, source_id, content_hash (SHA-256), indexed_at, created_at. UNIQUE constraint en (sync_job_id, drive_file_id)
- [ ] **DATA-03**: ALTER TABLE `sources` — columnas `drive_file_id TEXT` y `drive_sync_job_id TEXT`
- [ ] **DATA-04**: Tipo `'google_drive'` anadido al union type de Connector en `types.ts`
- [ ] **DATA-05**: Interfaces `GoogleDriveConfig`, `DriveSyncJob`, `DriveIndexedFile`, `DriveFile`, `DriveOperation` en `types.ts`

### AUTH — Autenticacion

- [ ] **AUTH-01**: Service Account — subida de JSON, cifrado AES-256-GCM del JSON completo, display del SA email sin cifrar
- [ ] **AUTH-02**: OAuth2 — flujo web callback (redirect a `/api/connectors/google-drive/oauth2/callback`), cifrado de client_secret y refresh_token
- [ ] **AUTH-03**: `google-drive-auth.ts` — factory que devuelve cliente Drive v3 autenticado segun `auth_mode` (service_account | oauth2)
- [ ] **AUTH-04**: Endpoint test de conexion — lista 5 archivos de la carpeta raiz, retorna `{ ok, account_email, files_count }`

### API — Endpoints CRUD

- [ ] **API-01**: `GET /api/connectors/google-drive` — lista conectores Drive
- [ ] **API-02**: `POST /api/connectors/google-drive` — crea conector con credenciales cifradas
- [ ] **API-03**: `GET/PUT/DELETE /api/connectors/google-drive/[id]` — CRUD individual, GET enmascara credenciales
- [ ] **API-04**: `POST /api/connectors/google-drive/[id]/test` — prueba conexion real
- [ ] **API-05**: `POST /api/connectors/google-drive/[id]/invoke` — ejecuta operacion (upload/download/list/create_folder)
- [ ] **API-06**: `GET /api/connectors/google-drive/[id]/browse` — arbol de carpetas para el picker
- [ ] **API-07**: `GET /api/connectors/google-drive/oauth2/auth-url` — genera URL OAuth2 con redirect URI
- [ ] **API-08**: `GET /api/connectors/google-drive/oauth2/callback` — recibe code de Google, intercambia por tokens, cifra y almacena

### SRC — Fuentes de CatBrain

- [ ] **SRC-01**: Tipo `google_drive` en enum de tipos de fuente
- [ ] **SRC-02**: Endpoint `POST /api/catbrains/[id]/sources/drive` — crea fuente apuntando a archivo/carpeta Drive con metadata
- [ ] **SRC-03**: `extractContent()` — rama `google_drive`: descarga via `google-drive-service` + export para Google Docs + pasa por extractores existentes
- [ ] **SRC-04**: Badge Drive en `source-list.tsx` con nombre de archivo y carpeta origen
- [ ] **SRC-05**: Badge `SINCRONIZANDO` pulsante mientras hay polling activo en esa fuente
- [ ] **SRC-06**: Endpoint `POST /api/catbrains/[id]/sources/drive/[sourceId]/sync` — sync manual
- [ ] **SRC-07**: Integracion con `/rag/append` existente — fuentes Drive se indexan sin cambios en el append handler

### POLL — Polling daemon

- [ ] **POLL-01**: `DrivePollingService` singleton con `setInterval`
- [ ] **POLL-02**: Al arrancar, carga todos los `drive_sync_jobs` activos de SQLite
- [ ] **POLL-03**: Usa `changes.list` con `pageToken` para detectar solo archivos nuevos/modificados, filtrando por parent folder IDs
- [ ] **POLL-04**: Compara `content_hash` (SHA-256) antes de re-indexar (evita trabajo innecesario)
- [ ] **POLL-05**: Actualiza `last_synced_at` y `last_page_token` en `drive_sync_jobs` tras cada ciclo
- [ ] **POLL-06**: Intervalo configurable: 5/15/30/60 min o 0 (manual)
- [ ] **POLL-07**: Errores de polling se guardan en `last_error` (no interrumpen el ciclo)

### CANVAS — Integracion Canvas y Tareas

- [ ] **CANVAS-01**: `executeConnectorNode()` en `canvas-executor.ts` — rama `google_drive`
- [ ] **CANVAS-02**: Soporte operaciones: upload, download, list, create_folder
- [ ] **CANVAS-03**: Upload serializa output del nodo previo como `.md` o `.txt` con nombre configurable
- [ ] **CANVAS-04**: Download devuelve contenido como string para el nodo siguiente
- [ ] **CANVAS-05**: Logs en `connector_logs` con operacion, file_id/folder_id, duracion, estado
- [ ] **CANVAS-06**: `catbrain-connector-executor.ts` — mismo soporte que canvas-executor
- [ ] **CANVAS-07**: Panel de configuracion del nodo Drive en Canvas — selector operacion + campos dinamicos

### WIZ — Wizard UI

- [ ] **WIZ-01**: Componente `google-drive-wizard.tsx` — Dialog de 4 pasos (no Sheet)
- [ ] **WIZ-02**: Paso 1 — cards SA vs OAuth2 con descripcion y recomendacion
- [ ] **WIZ-03**: Paso 2 SA — area drag-drop para JSON + campo carpeta raiz + `DriveFolderPicker` + HelpCircle modal
- [ ] **WIZ-04**: Paso 2 OAuth2 — Client ID/Secret + flujo web callback + carpeta raiz
- [ ] **WIZ-05**: `DriveFolderPicker` — arbol lazy-loaded con breadcrumb, boton "Seleccionar"
- [ ] **WIZ-06**: Paso 3 — test animado con 3 lineas de estado, opcion reintentar
- [ ] **WIZ-07**: Paso 4 — badge esmeralda "Listo", SA email, carpeta raiz, N archivos, snippets de uso
- [ ] **WIZ-08**: `DriveSubtitle` en lista de conectores — SA email / cuenta OAuth + carpeta raiz
- [ ] **WIZ-09**: Card de tipo Drive con badge `sky-500` en la grid de `/conectores`

### CATBOT — Herramientas CatBot

- [ ] **CATBOT-01**: Tool `list_drive_files` gateada por existencia de conector Drive activo
- [ ] **CATBOT-02**: Tool `upload_to_drive` con confirmacion obligatoria antes de ejecutar
- [ ] **CATBOT-03**: Tool `download_from_drive` devuelve primeros 2000 chars del contenido
- [ ] **CATBOT-04**: Tool `sync_drive_source` fuerza re-sync de una fuente Drive por nombre
- [ ] **CATBOT-05**: System prompt de CatBot actualizado con seccion "Google Drive"

### SYS — Sistema / Footer

- [ ] **SYS-01**: Card "Google Drive" en `/system` — visible solo si hay conector Drive activo
- [ ] **SYS-02**: Estado del card: Verde (ultima llamada OK), Rojo (error), Gris (sin sync jobs)
- [ ] **SYS-03**: Info: SA email / cuenta OAuth, ultima sincronizacion, archivos indexados totales
- [ ] **SYS-04**: Dot en footer (auto-detected si existe conector Drive activo, no variable de entorno manual)

### TEST — Tests

- [ ] **TEST-01**: E2E wizard Service Account — subida de JSON ficticio, test de conexion mockeado, confirmacion
- [ ] **TEST-02**: E2E wizard OAuth2 — generacion URL, exchange de codigo, confirmacion
- [ ] **TEST-03**: E2E fuente Drive en CatBrain — anadir carpeta, badge Drive, trigger sync manual
- [ ] **TEST-04**: E2E nodo Canvas Drive — upload, ejecucion completa del nodo
- [ ] **TEST-05**: E2E CatBot Drive — listar archivos, subir archivo con confirmacion
- [ ] **TEST-06**: API CRUD + invoke + browse + sync (5 test suites)

### DOC — Documentacion

- [ ] **DOC-01**: Seccion "Conector Google Drive" en `CONNECTORS.md` — setup SA, setup OAuth2, troubleshooting 6 errores comunes
- [ ] **DOC-02**: Seccion "Fuentes Google Drive" en `GUIA_USUARIO.md`
- [ ] **DOC-03**: `progressSesionN.md` documentando v19.0 completo
- [ ] **DOC-04**: i18n — claves en namespace `connectors` (es + en) para todos los textos del wizard y pantallas Drive

## Future Requirements

### Google Drive Enhancements (deferred)
- **FUTURE-01**: Google Workspace Shared Drives (solo My Drive por ahora)
- **FUTURE-02**: Edicion en tiempo real de archivos en Drive
- **FUTURE-03**: Drive como destino de backup automatico de DoCatFlow
- **FUTURE-04**: Watch via Google Drive Push Notifications/webhooks (requiere dominio publico)
- **FUTURE-05**: Multi-cuenta Drive (una configuracion por conector)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Google Workspace Shared Drives | Solo My Drive y drives compartidos con la SA |
| Google Docs/Sheets/Slides en formato nativo | Solo exportados a PDF/text via Drive export API |
| Edicion en tiempo real | Fuera del scope de indexacion/I/O |
| Drive como backup destino | Feature separado |
| Push Notifications/webhooks | Requiere dominio publico verificado — usar polling |
| Subida de binarios no-texto (imagenes, videos) como fuente RAG | No extraible como texto |
| Multi-cuenta Drive | Una configuracion por conector |
| Rate limiter distribuido | Single-server, Map en memoria suficiente |
| OAuth2 OOB flow | Deprecado por Google oct 2022 — usar web callback |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01..05 | Phase 82 | Pending |
| AUTH-01..04 | Phase 82 | Pending |
| API-01..08 | Phase 82 | Pending |
| SRC-01..07 | Phase 83 | Pending |
| POLL-01..07 | Phase 83 | Pending |
| CANVAS-01..07 | Phase 84 | Pending |
| WIZ-01..09 | Phase 85 | Pending |
| CATBOT-01..05 | Phase 86 | Pending |
| SYS-01..04 | Phase 86 | Pending |
| TEST-01..06 | Phase 86 | Pending |
| DOC-01..04 | Phase 86 | Pending |

**Coverage:**
- v19.0 requirements: 56 total
- Mapped to phases: 56
- Unmapped: 0

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-25 after initial definition*
