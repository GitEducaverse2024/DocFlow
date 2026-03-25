# Roadmap: DoCatFlow

## Milestones

- v12.0 WebSearch CatBrain -- Phases 48-49 (shipped 2026-03-16) -- [archive](.planning/milestones/v12.0-ROADMAP.md)
- v13.0 Conector Gmail -- Phases 50-51 (shipped 2026-03-16)
- v14.0 CatBrain UX Redesign -- Phases 52-56 (shipped 2026-03-21) -- [archive](.planning/milestones/v14.0-ROADMAP.md)
- v15.0 Tasks Unified -- Phases 57-62 (shipped 2026-03-22) -- [archive](.planning/milestones/v15.0-ROADMAP.md)
- v16.0 CatFlow -- Phases 63-70 (shipped 2026-03-22) -- [archive](.planning/milestones/v16.0-ROADMAP.md)
- v17.0 Holded MCP -- Phases 71-76 (shipped 2026-03-24)
- v18.0 Holded MCP: Auditoria API + Safe Deletes -- Phases 77-81 (shipped 2026-03-24)
- **v19.0 Conector Google Drive -- Phases 82-86 (active)**

---

## v19.0 — Conector Google Drive

**Goal:** Implementar conector Google Drive nativo en DoCatFlow con dos capas: (1) fuente de indexacion RAG — carpetas de Drive indexadas automaticamente, y (2) conector de I/O en Canvas y Tareas — CatPaws leen/escriben archivos en Drive. Autenticacion via Service Account (primaria) y OAuth2 web callback (secundaria).

**Repo:** `~/docflow/app/` (todo en DoCatFlow)

**Dependencies resueltas:** `googleapis` ya instalado, cifrado AES-256-GCM, pipeline RAG completo, extractores multi-formato, wizard Gmail como plantilla.

## Phases

- [ ] **Phase 82: Modelo de datos + Servicio de autenticacion** - Tablas SQLite, tipos TypeScript, servicio de autenticacion Drive, endpoints CRUD
- [ ] **Phase 83: Fuente Google Drive + Indexacion RAG** - Tipo fuente `google_drive`, descarga/export/extraccion, polling daemon, integracion RAG
- [ ] **Phase 84: Integracion Canvas y Tareas (I/O)** - Nodo CONNECTOR Drive en Canvas (upload/download/list/create_folder), ejecutores, logs
- [ ] **Phase 85: Wizard + UI de conectores + Polling arranque** - Wizard 4 pasos (SA + OAuth2), DriveFolderPicker, integracion /conectores, arranque polling
- [ ] **Phase 86: CatBot tools + /system + Tests + Documentacion** - 4 CatBot tools, card sistema, footer dot, E2E/API tests, CONNECTORS.md, i18n

## Phase Details

### Phase 82: Modelo de datos + Servicio de autenticacion
**Goal**: Crear tablas, tipos TypeScript y el servicio de autenticacion de Drive con endpoints CRUD completos.
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, AUTH-01, AUTH-02, AUTH-03, AUTH-04, API-01, API-02, API-03, API-04, API-05, API-06, API-07, API-08
**Success Criteria** (what must be TRUE):
  1. Tables `drive_sync_jobs` and `drive_indexed_files` exist in SQLite with all specified columns and constraints
  2. `sources` table has `drive_file_id` and `drive_sync_job_id` columns
  3. `GoogleDriveConfig` and related interfaces defined in `types.ts`, connector type union includes `'google_drive'`
  4. `google-drive-auth.ts` creates authenticated Drive v3 client for both Service Account (JSON credentials) and OAuth2 (refresh token)
  5. `google-drive-service.ts` methods (listFiles, downloadFile, uploadFile, createFolder, getChanges, exportFile) work against Drive API
  6. All CRUD endpoints functional: create connector (encrypts credentials), read (masks secrets), update, delete, test connection, browse folders
  7. OAuth2 auth-url generates valid Google consent URL with web callback redirect; callback endpoint exchanges code for encrypted tokens
**Key files:**
- `app/src/lib/types.ts` — interfaces nuevas
- `app/src/lib/db.ts` — migraciones
- `app/src/lib/services/google-drive-auth.ts` — **nuevo**
- `app/src/lib/services/google-drive-service.ts` — **nuevo**
- `app/src/app/api/connectors/google-drive/route.ts` — **nuevo**
- `app/src/app/api/connectors/google-drive/[id]/route.ts` — **nuevo**
- `app/src/app/api/connectors/google-drive/[id]/test/route.ts` — **nuevo**
- `app/src/app/api/connectors/google-drive/[id]/invoke/route.ts` — **nuevo**
- `app/src/app/api/connectors/google-drive/[id]/browse/route.ts` — **nuevo**
- `app/src/app/api/connectors/google-drive/oauth2/auth-url/route.ts` — **nuevo**
- `app/src/app/api/connectors/google-drive/oauth2/callback/route.ts` — **nuevo**

### Phase 83: Fuente Google Drive + Indexacion RAG
**Goal**: El usuario puede anadir una carpeta de Drive como fuente de un CatBrain. Los archivos se descargan, extraen y se indexan igual que cualquier archivo local. Polling daemon detecta cambios.
**Depends on**: Phase 82
**Requirements**: SRC-01, SRC-02, SRC-03, SRC-04, SRC-05, SRC-06, SRC-07, POLL-01, POLL-02, POLL-03, POLL-04, POLL-05, POLL-06, POLL-07
**Success Criteria** (what must be TRUE):
  1. Source type `google_drive` creates a source in CatBrain with Drive metadata (folder_id, drive_file_id)
  2. `extractContent()` downloads Drive files (binary) or exports Google Docs (to text/PDF) and passes them through existing extractors
  3. Sources of type `google_drive` can be appended to RAG via existing `/rag/append` without changes to the append handler
  4. `DrivePollingService` singleton loads active sync_jobs on startup, polls `changes.list` at configured intervals
  5. Polling compares `content_hash` (SHA-256) before re-indexing; only changed files trigger re-extraction
  6. Badge "Drive" visible in source-list with file name, folder origin, and pulsating "SINCRONIZANDO" during active polling
  7. Manual sync endpoint triggers immediate re-download and re-index if content hash changed
**Key files:**
- `app/src/lib/services/drive-polling.ts` — **nuevo** (singleton con setInterval)
- `app/src/app/api/catbrains/[id]/sources/drive/route.ts` — **nuevo**
- `app/src/app/api/catbrains/[id]/sources/drive/[sourceId]/sync/route.ts` — **nuevo**
- `app/src/components/sources/source-list.tsx` — badge Drive
- `app/src/lib/services/content-extractor.ts` — rama google_drive
- `app/scripts/rag-worker.mjs` — sin cambios (recibe contenido extraido)

### Phase 84: Integracion Canvas y Tareas (I/O)
**Goal**: El nodo CONNECTOR en Canvas y los pasos de Tareas pueden usar Google Drive para subir outputs o descargar inputs.
**Depends on**: Phase 82
**Requirements**: CANVAS-01, CANVAS-02, CANVAS-03, CANVAS-04, CANVAS-05, CANVAS-06, CANVAS-07
**Success Criteria** (what must be TRUE):
  1. Canvas CONNECTOR node with type `google_drive` executes upload/download/list/create_folder via invoke endpoint
  2. Upload serializes predecessor node output as `.md` or `.txt` with configurable file name
  3. Download returns file content as string input for the next node
  4. List returns JSON array of file names/IDs
  5. Every invocation logged in `connector_logs` with operation, file/folder ID, duration, status
  6. `catbrain-connector-executor.ts` handles `google_drive` type with same operations
  7. Node config panel in Canvas shows operation selector + dynamic fields (folder_id, file_name, file_id)
**Key files:**
- `app/src/app/api/connectors/google-drive/[id]/invoke/route.ts` — operaciones
- `app/src/lib/services/canvas-executor.ts` — rama google_drive
- `app/src/lib/services/catbrain-connector-executor.ts` — rama google_drive
- `app/src/components/canvas/node-config-panel.tsx` — UI config nodo Drive

### Phase 85: Wizard + UI de conectores + Polling arranque
**Goal**: Wizard de 4 pasos para crear el conector, integracion en /conectores con badge Drive, y arranque del polling daemon al iniciar la app.
**Depends on**: Phase 82, Phase 83 (polling service)
**Requirements**: WIZ-01, WIZ-02, WIZ-03, WIZ-04, WIZ-05, WIZ-06, WIZ-07, WIZ-08, WIZ-09
**Plans:** 3 plans
Plans:
- [ ] 85-01-PLAN.md — DriveFolderPicker + /conectores page wiring + i18n keys
- [ ] 85-02-PLAN.md — Google Drive Wizard 4-step dialog (SA + OAuth2)
- [ ] 85-03-PLAN.md — Polling daemon auto-start on app init
**Success Criteria** (what must be TRUE):
  1. Wizard Dialog with 4 steps: auth type selection (SA recommended) -> credentials + folder picker -> animated test -> confirmation with snippets
  2. Service Account step: drag-drop JSON upload, DriveFolderPicker with lazy-loaded tree + breadcrumb, HelpCircle modal with setup instructions
  3. OAuth2 step: Client ID/Secret fields, "Generate URL" button opens Google consent, callback captures tokens automatically
  4. Test step: 3 animated status lines (authenticating, listing files, verifying permissions), retry option
  5. Confirmation step: emerald badge "Listo", SA email, root folder, N files found, usage snippets for Canvas/Tasks/CatBot
  6. `DriveSubtitle` shows SA email or OAuth account + root folder name in connector list
  7. Drive card with `sky-500` badge in connector type grid on /conectores page
  8. Polling daemon starts automatically on app init if active sync_jobs exist
**Key files:**
- `app/src/components/connectors/google-drive-wizard.tsx` — **nuevo**
- `app/src/components/connectors/drive-folder-picker.tsx` — **nuevo**
- `app/src/app/connectors/page.tsx` — nueva card + DriveSubtitle
- `app/src/app/api/connectors/google-drive/oauth2/auth-url/route.ts` — ya creado en 82
- `app/src/app/api/connectors/google-drive/oauth2/callback/route.ts` — ya creado en 82

### Phase 86: CatBot tools + /system + Tests + Documentacion
**Goal**: Exponer Drive a traves de CatBot, integrar en monitor del sistema, tests E2E/API y documentacion completa.
**Depends on**: Phase 82, 83, 84, 85
**Requirements**: CATBOT-01, CATBOT-02, CATBOT-03, CATBOT-04, CATBOT-05, SYS-01, SYS-02, SYS-03, SYS-04, TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, DOC-01, DOC-02, DOC-03, DOC-04
**Success Criteria** (what must be TRUE):
  1. CatBot tools `list_drive_files`, `upload_to_drive`, `download_from_drive`, `sync_drive_source` functional and gated by active Drive connector
  2. `upload_to_drive` requires user confirmation before executing
  3. `download_from_drive` returns first 2000 chars of content
  4. System prompt updated with "Google Drive" section documenting available tools and behavior
  5. Card "Google Drive" in /system visible only when Drive connector exists, shows status (green/red/gray), SA email, last sync, files indexed
  6. Footer dot auto-detected (no manual env var)
  7. E2E tests pass: wizard SA flow, wizard OAuth2 flow, CatBrain source, Canvas node, CatBot tools (all with mocked Drive API via page.route())
  8. API tests pass: CRUD, invoke, browse, sync
  9. CONNECTORS.md and GUIA_USUARIO.md updated with Google Drive sections
  10. i18n keys in `connectors` namespace (es + en) for all wizard and Drive screen texts
**Key files:**
- `app/src/lib/services/catbot-tools.ts` — 4 tools nuevos
- `app/src/components/system/system-health-panel.tsx` — card Drive
- `app/src/components/layout/footer.tsx` — dot Drive
- `app/e2e/` — specs Drive E2E + API
- `app/messages/es.json` + `app/messages/en.json` — i18n
- `CONNECTORS.md` + `GUIA_USUARIO.md` — documentacion

---

### Dependencies

```
82 (data + auth + API) ──┬──→ 83 (RAG source + polling) ──┐
                         ├──→ 84 (Canvas + Tasks I/O)     ├──→ 86 (CatBot + system + tests + docs)
                         └──→ 85 (Wizard + UI + polling)  ┘
```

Phase 82 is the foundation. Phases 83 and 84 can run in parallel (independent: RAG vs Canvas). Phase 85 depends on 82 + 83 (needs polling service). Phase 86 depends on all prior phases.

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 82. Modelo de datos + Servicio de autenticacion | 1/1 | Planned | — |
| 83. Fuente Google Drive + Indexacion RAG | 1/1 | **Done** | 2026-03-25 |
| 84. Integracion Canvas y Tareas (I/O) | 0/? | Pending | — |
| 85. Wizard + UI de conectores + Polling arranque | 0/2 | Planned | — |
| 86. CatBot tools + /system + Tests + Documentacion | 0/? | Pending | — |

---
*Created: 2026-03-25*
*Last updated: 2026-03-25*
