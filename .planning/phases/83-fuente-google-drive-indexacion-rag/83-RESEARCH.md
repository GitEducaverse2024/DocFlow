# Phase 83: Fuente Google Drive + Indexacion RAG - Research

**Researched:** 2026-03-25
**Domain:** Google Drive source integration, content extraction, RAG pipeline, polling daemon
**Confidence:** HIGH

## Summary

Phase 83 connects the Google Drive connector infrastructure (Phase 82) to DocFlow's CatBrain source system and RAG pipeline. The core work is: (1) creating a new source type `google_drive` that downloads Drive files, runs them through existing extractors, and stores them as sources, (2) making those sources flow through the existing `/rag/append` endpoint without modifications, and (3) building a polling daemon that watches for Drive changes and re-indexes only when content hashes differ.

The codebase has clean, well-established patterns for all three areas. Source creation follows a consistent pattern in `sources/route.ts`. The RAG append pipeline already handles any source type generically (it only cares about `content_text` and `source_id`). The task scheduler in `instrumentation.ts` provides the exact singleton + setInterval pattern needed for the polling daemon.

**Primary recommendation:** Follow existing patterns exactly -- create Drive sources as regular source rows with `type: 'google_drive'` and populated `content_text`, then call `/rag/append` with their IDs. The polling daemon should be a standalone singleton started from `instrumentation.ts` alongside the task scheduler.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRC-01 | Tipo `google_drive` en enum de tipos de fuente | Source type union at types.ts:30 needs `'google_drive'` added |
| SRC-02 | Endpoint POST /api/catbrains/[id]/sources/drive | Follow sources/route.ts POST pattern (lines 23-157) |
| SRC-03 | extractContent() rama google_drive: descarga + export + extractores | Use downloadFile() from google-drive-service.ts, save to disk, pass file path to extractContent() |
| SRC-04 | Badge Drive en source-list.tsx con nombre archivo y carpeta | Follow Badge pattern in source-list.tsx lines 471-479 |
| SRC-05 | Badge SINCRONIZANDO pulsante mientras polling activo | Add animate-pulse badge similar to pendingAppend badge (line 472) |
| SRC-06 | Endpoint POST sync manual | Re-download, re-hash, re-extract if changed, call append |
| SRC-07 | Integracion con /rag/append existente sin cambios | append/route.ts is type-agnostic -- only needs content_text + source_id |
| POLL-01 | DrivePollingService singleton con setInterval | Follow TaskScheduler pattern exactly (task-scheduler.ts) |
| POLL-02 | Al arrancar, carga drive_sync_jobs activos | Query drive_sync_jobs WHERE is_active = 1 in start() |
| POLL-03 | Usa changes.list con pageToken | getChanges() and getStartPageToken() already exist in google-drive-service.ts |
| POLL-04 | Compara content_hash SHA-256 antes de re-indexar | Hash buffer with crypto.createHash('sha256'), compare with drive_indexed_files.content_hash |
| POLL-05 | Actualiza last_synced_at y last_page_token | UPDATE drive_sync_jobs after each poll cycle |
| POLL-06 | Intervalo configurable 5/15/30/60/0 min | sync_interval_minutes column already exists in drive_sync_jobs |
| POLL-07 | Errores de polling en last_error sin interrumpir ciclo | try/catch per job in tick(), store error in last_error column |
</phase_requirements>

---

## 1. Source Management Patterns

### Source Type System
**File:** `app/src/lib/types.ts` (lines 27-47)

The Source interface has a type union that currently includes only 4 types:
```typescript
// types.ts:30
type: 'file' | 'url' | 'youtube' | 'note';
```

**CRITICAL:** Phase 82 added `'google_drive'` to the Connector type (line 211) but did NOT add it to the Source type. Phase 83 MUST add `'google_drive'` to the Source type union.

Other relevant Source fields:
- `file_path: string | null` -- absolute path to file on disk (used by extractContent)
- `content_text: string | null` -- extracted text (this is what RAG indexes)
- `is_pending_append: number` -- 1 means source needs to be appended to RAG
- `content_updated_at: string | null` -- tracks staleness
- `drive_file_id: TEXT` -- already added by Phase 82 migration (db.ts:1620)
- `drive_sync_job_id: TEXT` -- already added by Phase 82 migration (db.ts:1621)

### Source Creation Pattern (File Upload)
**File:** `app/src/app/api/catbrains/[id]/sources/route.ts`

The POST handler for file sources (lines 39-121):
1. Gets `catbrainId` from URL params
2. Checks catbrain exists
3. Computes `isPendingAppend` based on `catbrain.rag_enabled`
4. Saves file to disk at `{PROJECTS_PATH}/{catbrainId}/sources/{uuid}.{ext}`
5. Calls `extractContent(filePath)` to get text
6. INSERTs source row with `type: 'file'`, `file_path`, `content_text`, `is_pending_append`
7. Returns the created source

**Key pattern for Drive sources:** Save the downloaded Drive file to disk (same directory structure), then call `extractContent(filePath)` exactly like file uploads do. This reuses all existing extraction logic.

### Source Creation Pattern (JSON / URL / YouTube / Note)
Lines 123-150: For non-file sources, accepts JSON body with `type`, `name`, `url`, `youtube_id`, `content_text`. For Drive sources, we need to handle the Drive download before inserting.

### Source Retrieval
**GET handler** (lines 12-21): `SELECT *, length(content_text) as content_text_length FROM sources WHERE project_id = ? ORDER BY is_pending_append DESC, order_index ASC`

---

## 2. Content Extraction Pipeline

### extractContent() Function
**File:** `app/src/lib/services/content-extractor.ts` (lines 73-117)

**Signature:** `extractContent(filePath: string): Promise<ExtractionResult>`

The function is **purely file-path based**. It determines the file type from the extension and applies the appropriate extractor:
- `.pdf` -> `pdftotext` CLI tool
- `.docx/.pptx/.xlsx/.odt/.odp/.ods` -> `unzip -p` + XML strip
- `.rtf` -> strip RTF control words
- `.epub` -> `unzip -p` XHTML files
- Text files -> direct UTF-8 read
- Images/binaries -> returns placeholder text with `method: 'none'`

**Return type:**
```typescript
interface ExtractionResult {
  text: string;
  method: 'pdftotext' | 'utf8' | 'office-xml' | 'none';
  warning?: string;
}
```

### Strategy for Drive Files
For Drive sources, the approach is:
1. Download the file via `downloadFile()` from google-drive-service.ts
2. For Google Docs types, the service already exports to text/CSV/PDF (see `getExportMimeType()` at line 184)
3. Save the downloaded buffer to disk at `{PROJECTS_PATH}/{catbrainId}/sources/{uuid}.{ext}`
4. Call `extractContent(filePath)` -- it will handle the rest

**Google Docs export mapping** (from google-drive-service.ts:184-195):
| Google MIME | Export MIME | Extension to save as |
|-------------|-----------|---------------------|
| vnd.google-apps.document | text/plain | .txt |
| vnd.google-apps.spreadsheet | text/csv | .csv |
| vnd.google-apps.presentation | application/pdf | .pdf |
| vnd.google-apps.drawing | application/pdf | .pdf |
| Other google-apps.* | application/pdf | .pdf |

---

## 3. RAG Append Pipeline

### /rag/append Endpoint
**File:** `app/src/app/api/catbrains/[id]/rag/append/route.ts`

**This is the key finding: the append endpoint is completely type-agnostic.** It operates on:
1. A list of `sourceIds` (from request body)
2. Fetches sources: `SELECT id, name, type, content_text, file_path FROM sources WHERE id IN (...) AND project_id = ?`
3. For sources missing `content_text`, tries `extractContent(source.file_path)` for file-type sources
4. Chunks `content_text` via `smartChunkText()`
5. Embeds chunks via Ollama
6. Upserts to Qdrant with metadata including `source_id`, `source_name`, `source_type`
7. Sets `is_pending_append = 0` on processed sources

**No changes needed to the append handler for Drive sources.** As long as Drive sources have:
- `content_text` populated (or `file_path` pointing to a valid file for re-extraction)
- `is_pending_append = 1`
- Valid `id` and `project_id`

They will flow through the same pipeline.

### RAG Append Flow (Frontend)
**File:** `app/src/components/sources/source-manager.tsx` (lines 57-98)

The frontend calls:
1. `GET /api/catbrains/{id}/sources` -- get all sources
2. Filter for `is_pending_append === 1`
3. `POST /api/catbrains/{id}/rag/append` with `{ sourceIds: [...] }`

For Drive sources, the frontend append banner will automatically appear when `is_pending_append === 1`, no changes needed.

---

## 4. Source List UI Patterns

### SourceList Component
**File:** `app/src/components/sources/source-list.tsx`

**Badge patterns** (lines 471-479):
```tsx
{source.is_pending_append === 1 && ragEnabled ? (
  <Badge className="bg-violet-500/10 text-violet-400 border-0 text-[10px] flex-shrink-0 px-1.5 py-0.5 animate-pulse">
    {t('badge.pendingAppend')}
  </Badge>
) : isNew ? (
  <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-[10px] flex-shrink-0 px-1.5 py-0.5">
    {t('badge.new')}
  </Badge>
) : null}
```

**Type filter dropdown** (lines 413-420):
```tsx
<SelectItem value="file">{t('filterFile')}</SelectItem>
<SelectItem value="url">{t('filterUrl')}</SelectItem>
<SelectItem value="youtube">{t('filterYoutube')}</SelectItem>
<SelectItem value="note">{t('filterNote')}</SelectItem>
```
Need to add `<SelectItem value="google_drive">` here.

**Stats counter** (lines 327-334):
```typescript
const stats = {
  total: sources.length,
  file: sources.filter(s => s.type === 'file').length,
  url: sources.filter(s => s.type === 'url').length,
  youtube: sources.filter(s => s.type === 'youtube').length,
  note: sources.filter(s => s.type === 'note').length,
};
```
Need to add `google_drive` count.

### SourceItem Component
**File:** `app/src/components/sources/source-item.tsx`

**Icon selection** (lines 61-76): Switch on `source.type`, then file extension. Need to add a `google_drive` case before file-type checks.

**Type badge** (lines 78-85): Switch on source.type for badge color/text. Need to add `'google_drive'` case returning a Drive-themed badge.

---

## 5. Polling Daemon Pattern (TaskScheduler)

### TaskScheduler Singleton
**File:** `app/src/lib/services/task-scheduler.ts`

**Exact pattern to follow:**
```typescript
const POLL_INTERVAL_MS = 60_000;

class TaskScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;  // Prevents overlapping ticks

  start(): void {
    if (this.intervalId) return; // Idempotent
    this.intervalId = setInterval(() => this.tick(), POLL_INTERVAL_MS);
    this.tick(); // First tick immediately
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async tick(): Promise<void> {
    if (this.running) return; // Prevent overlapping
    this.running = true;
    try {
      // ... work ...
    } finally {
      this.running = false;
    }
  }
}

export const taskScheduler = new TaskScheduler();
```

### Startup Registration
**File:** `app/src/instrumentation.ts`
```typescript
export async function register() {
  if (process['env']['NEXT_RUNTIME'] === 'nodejs') {
    const { taskScheduler } = await import('@/lib/services/task-scheduler');
    taskScheduler.start();
  }
}
```

The Drive polling service should be started here alongside the task scheduler. Same pattern: lazy import + `.start()`.

### DrivePollingService Design
Based on the TaskScheduler pattern, but with per-job intervals:

```typescript
class DrivePollingService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private jobTimers: Map<string, { lastTick: number; interval: number }> = new Map();

  start(): void {
    if (this.intervalId) return;
    this.loadActiveJobs();
    // Master tick every 60s, checks which jobs are due
    this.intervalId = setInterval(() => this.tick(), 60_000);
    this.tick();
  }

  private loadActiveJobs(): void {
    const jobs = db.prepare(
      'SELECT id, sync_interval_minutes FROM drive_sync_jobs WHERE is_active = 1'
    ).all();
    // ... populate jobTimers map
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // For each active job, check if interval elapsed, then poll
    } finally {
      this.running = false;
    }
  }
}
```

**Key difference from TaskScheduler:** The polling service needs per-job interval tracking (5/15/30/60 min) rather than a single DB query for due schedules.

---

## 6. Drive Services (From Phase 82)

### Already Available
- `createDriveClient(config)` -- `app/src/lib/services/google-drive-auth.ts`
- `downloadFile(drive, fileId, mimeType)` -- returns `{ content: Buffer, exportedMime: string }`
- `listFiles(drive, folderId, pageToken?)` -- paginated file listing
- `getChanges(drive, pageToken)` -- for polling
- `getStartPageToken(drive)` -- initial page token for changes.list
- `getExportMimeType(googleMime)` -- maps Google Docs types to export formats

### Database Tables (From Phase 82)
- `drive_sync_jobs` -- tracks sync job per folder (db.ts:1584-1600)
- `drive_indexed_files` -- tracks individual files with `content_hash` (db.ts:1604-1617)
- `sources` columns: `drive_file_id`, `drive_sync_job_id` (db.ts:1620-1621)
- `connectors` table stores Drive connector with encrypted config

### Connector Retrieval Pattern
To get a Drive client for a sync job:
1. Get sync job: `SELECT * FROM drive_sync_jobs WHERE id = ?`
2. Get connector: `SELECT * FROM connectors WHERE id = ? AND type = 'google_drive'`
3. Parse config: `JSON.parse(connector.config) as GoogleDriveConfig`
4. Create client: `createDriveClient(config)`

---

## 7. End-to-End Drive Source Flow

### Adding a Drive Folder as Source
1. Frontend calls `POST /api/catbrains/{catbrainId}/sources/drive` with `{ connector_id, folder_id, folder_name }`
2. API creates a `drive_sync_jobs` row linking connector + catbrain + folder
3. API lists files in folder via `listFiles(drive, folderId)`
4. For each file:
   a. Download via `downloadFile(drive, fileId, mimeType)`
   b. Save to `{PROJECTS_PATH}/{catbrainId}/sources/{uuid}.{ext}`
   c. Call `extractContent(filePath)` for text extraction
   d. INSERT source with `type: 'google_drive'`, `drive_file_id`, `drive_sync_job_id`, `content_text`, `is_pending_append: 1`
   e. INSERT `drive_indexed_files` row with `content_hash` (SHA-256 of downloaded buffer)
5. Update `drive_sync_jobs.files_indexed` count
6. Frontend shows "pending append" banner, user clicks to append to RAG (or auto-append)

### Polling Cycle
1. DrivePollingService tick fires for a sync job
2. Get connector, create Drive client
3. Call `getChanges(drive, lastPageToken)`
4. Filter changes to files whose `parents` include the watched `folder_id`
5. For changed/new files: download, hash, compare with `drive_indexed_files.content_hash`
6. If hash differs: save to disk, re-extract, update source `content_text`, set `is_pending_append = 1`
7. Update `drive_sync_jobs.last_synced_at`, `last_page_token`
8. For removed files: mark source as deleted or set status to `'error'`

### Manual Sync
`POST /api/catbrains/{catbrainId}/sources/drive/{sourceId}/sync`:
1. Get the source and its `drive_file_id`
2. Download file, compute hash
3. If hash differs from `drive_indexed_files.content_hash`: re-extract, update `content_text`, set `is_pending_append = 1`
4. Return sync result

---

## 8. Common Pitfalls

### Pitfall 1: Google Docs Export vs Binary Download
**What goes wrong:** Treating all Drive files the same -- Google Docs (Documents, Sheets, Presentations) cannot be downloaded directly, they must be exported.
**How to avoid:** The existing `downloadFile()` in google-drive-service.ts already handles this correctly by checking `mimeType.startsWith('application/vnd.google-apps.')`. Always pass the original `mimeType` from the file listing.

### Pitfall 2: File Extension for Exported Google Docs
**What goes wrong:** Saving an exported Google Doc as `.pdf` when it was exported as `text/plain`, causing extractContent() to misidentify it.
**How to avoid:** Map the exported MIME type back to a correct extension:
- `text/plain` -> `.txt`
- `text/csv` -> `.csv`
- `application/pdf` -> `.pdf`

### Pitfall 3: Changes API Returns All Changes, Not Just Folder
**What goes wrong:** `changes.list` returns changes across the entire Drive, not just the watched folder.
**How to avoid:** Filter changes by checking `change.file.parents` includes the `folder_id` from the sync job. Also handle nested folder changes if the folder contains subfolders.

### Pitfall 4: Overlapping Ticks
**What goes wrong:** A slow Drive API call causes the next tick to start before the previous one finishes, leading to duplicate downloads.
**How to avoid:** Use the `running` guard pattern from TaskScheduler. Also consider per-job locking if multiple sync jobs run concurrently.

### Pitfall 5: Source Type Union Not Updated
**What goes wrong:** TypeScript errors because `'google_drive'` is not in the Source type union.
**How to avoid:** Phase 82 only added it to Connector type. Phase 83 MUST update `types.ts:30` to include `'google_drive'` in the Source type.

### Pitfall 6: process.env Bracket Notation
**What goes wrong:** Using `process.env.VARIABLE` causes webpack to inline the value at build time, resulting in undefined at runtime.
**How to avoid:** Always use `process['env']['VARIABLE']` (bracket notation) per project memory.

### Pitfall 7: Missing force-dynamic Export
**What goes wrong:** Next.js pre-renders API routes as static if they read env vars and have no dynamic path params.
**How to avoid:** Add `export const dynamic = 'force-dynamic';` to all new API routes that read env vars.

---

## 9. Architecture Patterns

### Recommended File Structure
```
app/src/
  lib/
    types.ts                          # EDIT: add 'google_drive' to Source type
    services/
      drive-polling.ts                # NEW: DrivePollingService singleton
      content-extractor.ts            # EDIT: NO changes needed (file-path based)
      google-drive-auth.ts            # EXISTS (Phase 82)
      google-drive-service.ts         # EXISTS (Phase 82)
  app/api/catbrains/[id]/sources/
    drive/
      route.ts                        # NEW: POST create Drive folder source
      [sourceId]/
        sync/
          route.ts                    # NEW: POST manual sync
  components/sources/
    source-list.tsx                   # EDIT: add Drive badge, filter, stats
    source-item.tsx                   # EDIT: add Drive icon and type badge
  instrumentation.ts                  # EDIT: start DrivePollingService
```

### Pattern: Source Creation for Drive
```typescript
// In POST /api/catbrains/[id]/sources/drive/route.ts
// 1. Get connector and create Drive client
const connector = db.prepare('SELECT * FROM connectors WHERE id = ? AND type = ?')
  .get(connectorId, 'google_drive');
const config = JSON.parse(connector.config) as GoogleDriveConfig;
const drive = createDriveClient(config);

// 2. List files in folder
const { files } = await listFiles(drive, folderId);

// 3. Create sync job
const syncJobId = uuidv4();
db.prepare(`INSERT INTO drive_sync_jobs (id, connector_id, catbrain_id, folder_id, folder_name) VALUES (?, ?, ?, ?, ?)`)
  .run(syncJobId, connectorId, catbrainId, folderId, folderName);

// 4. For each file: download, save, extract, create source
for (const file of files) {
  if (file.mimeType === 'application/vnd.google-apps.folder') continue; // skip folders

  const { content, exportedMime } = await downloadFile(drive, file.id, file.mimeType);
  const ext = mimeToExtension(exportedMime);
  const sourceId = uuidv4();
  const filePath = path.join(sourcesDir, `${sourceId}.${ext}`);
  fs.writeFileSync(filePath, content);

  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const extraction = await extractContent(filePath);

  // Insert source
  db.prepare(`INSERT INTO sources (id, project_id, type, name, file_path, file_type, file_size, content_text, status, drive_file_id, drive_sync_job_id, is_pending_append, order_index)
    VALUES (?, ?, 'google_drive', ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?)`)
    .run(sourceId, catbrainId, file.name, filePath, exportedMime, content.length,
         extraction.text, file.id, syncJobId, isPendingAppend, nextOrderIndex++);

  // Track indexed file
  db.prepare(`INSERT INTO drive_indexed_files (id, sync_job_id, drive_file_id, drive_file_name, drive_mime_type, drive_modified_time, source_id, content_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(uuidv4(), syncJobId, file.id, file.name, file.mimeType, file.modifiedTime, sourceId, hash);
}
```

### Pattern: Polling Tick Per Job
```typescript
async pollJob(job: DriveSyncJob): Promise<void> {
  try {
    const connector = db.prepare('SELECT * FROM connectors WHERE id = ?').get(job.connector_id);
    const config = JSON.parse(connector.config) as GoogleDriveConfig;
    const drive = createDriveClient(config);

    // Get or initialize page token
    let pageToken = job.last_page_token;
    if (!pageToken) {
      pageToken = await getStartPageToken(drive);
    }

    // Get changes
    const result = await getChanges(drive, pageToken);

    // Filter to files in our watched folder
    const relevantChanges = result.changes.filter(c =>
      c.file?.parents?.includes(job.folder_id)
    );

    for (const change of relevantChanges) {
      if (change.removed) {
        // Handle file deletion
        continue;
      }

      // Download and check hash
      const { content, exportedMime } = await downloadFile(drive, change.fileId, change.file!.mimeType);
      const newHash = crypto.createHash('sha256').update(content).digest('hex');

      const existing = db.prepare(
        'SELECT * FROM drive_indexed_files WHERE sync_job_id = ? AND drive_file_id = ?'
      ).get(job.id, change.fileId);

      if (existing && existing.content_hash === newHash) continue; // No change

      // Re-index: save, extract, update source
      // ...
    }

    // Update sync job
    db.prepare('UPDATE drive_sync_jobs SET last_synced_at = ?, last_page_token = ?, last_error = NULL WHERE id = ?')
      .run(new Date().toISOString(), result.newStartPageToken || pageToken, job.id);

  } catch (err) {
    db.prepare('UPDATE drive_sync_jobs SET last_error = ? WHERE id = ?')
      .run((err as Error).message, job.id);
  }
}
```

---

## 10. Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File content extraction | Custom Drive text extractor | Existing `extractContent()` | Already handles PDF, Office, text, images with all edge cases |
| Google Docs export | Custom export logic | `downloadFile()` from google-drive-service.ts | Already handles Google Workspace MIME detection and export |
| RAG indexing | Custom embedding + Qdrant pipeline | Existing `/rag/append` endpoint | Battle-tested chunking, embedding, upsert with fallbacks |
| Change detection | File modification timestamp comparison | `changes.list` API + content hash | Google's changes API is more reliable than polling file metadata |
| Singleton daemon | Custom process management | setInterval + guard pattern from TaskScheduler | Proven pattern in this codebase |

---

## 11. Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via npm test) |
| Config file | `app/vitest.config.ts` (check) or package.json |
| Quick run command | `cd ~/docflow/app && npx vitest run --reporter verbose` |
| Full suite command | `cd ~/docflow/app && npm run build` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRC-01 | google_drive in Source type union | unit (build) | `npm run build` | N/A (type check) |
| SRC-02 | POST sources/drive creates source | integration | `curl POST /api/catbrains/{id}/sources/drive` | No - Wave 0 |
| SRC-03 | extractContent handles Drive-downloaded files | unit | existing extractor tests | Partial |
| SRC-04 | Drive badge visible | manual (UI) | Manual | N/A |
| SRC-05 | SINCRONIZANDO badge pulsating | manual (UI) | Manual | N/A |
| SRC-06 | Manual sync endpoint | integration | `curl POST /api/.../sync` | No - Wave 0 |
| SRC-07 | Drive sources flow through /rag/append | integration | `curl POST /api/.../rag/append` | No - Wave 0 |
| POLL-01 | DrivePollingService singleton | unit | test start/stop/tick | No - Wave 0 |
| POLL-02 | Load active jobs on startup | unit | test loadActiveJobs() | No - Wave 0 |
| POLL-03 | changes.list with pageToken | integration | requires Drive API | Manual |
| POLL-04 | content_hash comparison | unit | test hash comparison logic | No - Wave 0 |
| POLL-05 | Updates last_synced_at and last_page_token | unit | test DB updates | No - Wave 0 |
| POLL-06 | Configurable interval | unit | test interval parsing | No - Wave 0 |
| POLL-07 | Errors stored in last_error | unit | test error handling | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd ~/docflow/app && npm run build`
- **Per wave merge:** `cd ~/docflow/app && npm run build && npx vitest run`
- **Phase gate:** Full build + test suite green

### Wave 0 Gaps
- [ ] `app/src/lib/services/drive-polling.test.ts` -- covers POLL-01..07
- [ ] Build verification: `npm run build` must pass after type changes

---

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `app/src/lib/types.ts` -- Source interface, type union (line 30)
- Codebase inspection: `app/src/app/api/catbrains/[id]/sources/route.ts` -- source CRUD pattern
- Codebase inspection: `app/src/lib/services/content-extractor.ts` -- extraction pipeline
- Codebase inspection: `app/src/app/api/catbrains/[id]/rag/append/route.ts` -- RAG append (type-agnostic)
- Codebase inspection: `app/src/lib/services/task-scheduler.ts` -- singleton daemon pattern
- Codebase inspection: `app/src/instrumentation.ts` -- daemon startup registration
- Codebase inspection: `app/src/components/sources/source-list.tsx` -- badge/filter patterns
- Codebase inspection: `app/src/components/sources/source-item.tsx` -- icon/badge patterns
- Codebase inspection: `app/src/lib/services/google-drive-service.ts` -- downloadFile, getChanges, etc.
- Codebase inspection: `app/src/lib/db.ts` -- drive_sync_jobs, drive_indexed_files tables

### Secondary (MEDIUM confidence)
- Phase 82 PLAN.md and RESEARCH.md -- connector infrastructure patterns

## Metadata

**Confidence breakdown:**
- Source management patterns: HIGH - direct codebase inspection
- Content extraction: HIGH - direct codebase inspection, well-documented functions
- RAG pipeline: HIGH - append endpoint is type-agnostic, verified by reading code
- Polling daemon: HIGH - TaskScheduler provides exact pattern to follow
- UI components: HIGH - badge/filter patterns clearly visible in source-list.tsx

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable internal patterns)
