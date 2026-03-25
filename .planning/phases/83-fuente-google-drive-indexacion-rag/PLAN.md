# Phase 83 Plan: Fuente Google Drive + Indexacion RAG

**Phase:** 83
**Goal:** El usuario puede anadir una carpeta de Drive como fuente de un CatBrain. Los archivos se descargan, extraen y se indexan igual que cualquier archivo local. Polling daemon detecta cambios.
**Depends on:** Phase 82 (types, DB tables, auth service, Drive API service, CRUD endpoints)
**Requirements:** SRC-01..07, POLL-01..07
**Estimated plans:** 1 (this file — tasks grouped by wave)

---

## Wave 1: Types + Drive Source Endpoint

### Task 1.1: Add `google_drive` to Source type union
**File:** `app/src/lib/types.ts`
**Action:** Edit existing file
**Requirements:** SRC-01

1. Line 30 — add `'google_drive'` to the Source `type` union:
   ```typescript
   type: 'file' | 'url' | 'youtube' | 'note' | 'google_drive';
   ```

**Verify:** `cd ~/docflow/app && npx tsc --noEmit` passes with no errors on Source type.

---

### Task 1.2: Create POST /api/catbrains/[id]/sources/drive endpoint
**File:** `app/src/app/api/catbrains/[id]/sources/drive/route.ts` — **NEW**
**Action:** Create new file
**Requirements:** SRC-02, SRC-03, SRC-07

This endpoint creates sources from a Drive folder. It downloads each file, extracts text via `extractContent()`, and inserts source rows with `type: 'google_drive'` and `is_pending_append: 1` so the existing RAG append pipeline picks them up.

```typescript
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { extractContent } from '@/lib/services/content-extractor';
import { createDriveClient } from '@/lib/services/google-drive-auth';
import { listFiles, downloadFile, getStartPageToken } from '@/lib/services/google-drive-service';
import { GoogleDriveConfig } from '@/lib/types';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Map exported MIME type to file extension for extractContent() to identify correctly.
 */
function mimeToExtension(mime: string): string {
  switch (mime) {
    case 'text/plain': return 'txt';
    case 'text/csv': return 'csv';
    case 'application/pdf': return 'pdf';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return 'docx';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': return 'xlsx';
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation': return 'pptx';
    default: {
      // Derive from MIME: "image/png" -> "png", "application/pdf" -> "pdf"
      const parts = mime.split('/');
      return parts[parts.length - 1]?.split('+')[0] || 'bin';
    }
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: catbrainId } = await params;
    const catbrain = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(catbrainId) as { id: string; rag_enabled: number } | undefined;

    if (!catbrain) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    const body = await request.json();
    const { connector_id, folder_id, folder_name, sync_interval_minutes = 15 } = body;

    if (!connector_id || !folder_id) {
      return NextResponse.json({ error: 'connector_id and folder_id are required' }, { status: 400 });
    }

    // 1. Get connector and create Drive client
    const connector = db.prepare('SELECT * FROM connectors WHERE id = ? AND type = ?').get(connector_id, 'google_drive') as { id: string; config: string } | undefined;
    if (!connector) {
      return NextResponse.json({ error: 'Google Drive connector not found' }, { status: 404 });
    }
    const config = JSON.parse(connector.config) as GoogleDriveConfig;
    const drive = createDriveClient(config);

    // 2. Create sync job
    const syncJobId = uuidv4();
    const isPendingAppend = catbrain.rag_enabled === 1 ? 1 : 0;

    // Get initial page token for future polling
    let startPageToken: string | null = null;
    try {
      startPageToken = await getStartPageToken(drive);
    } catch (e) {
      logger.warn('drive', 'Could not get start page token', { error: (e as Error).message });
    }

    db.prepare(`
      INSERT INTO drive_sync_jobs (id, connector_id, catbrain_id, folder_id, folder_name, sync_interval_minutes, last_page_token, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(syncJobId, connector_id, catbrainId, folder_id, folder_name || '', sync_interval_minutes, startPageToken);

    // 3. List files in folder
    const { files } = await listFiles(drive, folder_id);

    // 4. For each file: download, save, extract, create source
    const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');
    const sourcesDir = path.join(projectsPath, catbrainId, 'sources');
    fs.mkdirSync(sourcesDir, { recursive: true });

    // Get current max order_index
    const maxOrderRow = db.prepare('SELECT MAX(order_index) as maxOrder FROM sources WHERE project_id = ?').get(catbrainId) as { maxOrder: number | null };
    let nextOrderIndex = (maxOrderRow.maxOrder !== null ? maxOrderRow.maxOrder : -1) + 1;

    const createdSources: Array<{ id: string; name: string; drive_file_id: string }> = [];
    let filesIndexed = 0;

    for (const file of files) {
      // Skip folders
      if (file.mimeType === 'application/vnd.google-apps.folder') continue;

      try {
        const { content, exportedMime } = await downloadFile(drive, file.id, file.mimeType);
        const ext = mimeToExtension(exportedMime);
        const sourceId = uuidv4();
        const filePath = path.join(sourcesDir, `${sourceId}.${ext}`);
        fs.writeFileSync(filePath, content);

        const hash = crypto.createHash('sha256').update(content).digest('hex');
        const extraction = await extractContent(filePath);

        // Insert source row
        db.prepare(`
          INSERT INTO sources (id, project_id, type, name, file_path, file_type, file_size, content_text, status, drive_file_id, drive_sync_job_id, is_pending_append, order_index)
          VALUES (?, ?, 'google_drive', ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?)
        `).run(
          sourceId, catbrainId, file.name, filePath, exportedMime, content.length,
          extraction.text, file.id, syncJobId, isPendingAppend, nextOrderIndex++
        );

        // Track indexed file
        db.prepare(`
          INSERT INTO drive_indexed_files (id, sync_job_id, drive_file_id, drive_file_name, drive_mime_type, drive_modified_time, source_id, content_hash)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), syncJobId, file.id, file.name, file.mimeType, file.modifiedTime || null, sourceId, hash);

        createdSources.push({ id: sourceId, name: file.name, drive_file_id: file.id });
        filesIndexed++;
      } catch (fileErr) {
        logger.error('drive', `Error processing Drive file: ${file.name}`, { error: (fileErr as Error).message, fileId: file.id });
        // Continue with next file — don't fail entire batch
      }
    }

    // 5. Update sync job with files_indexed count
    db.prepare('UPDATE drive_sync_jobs SET files_indexed = ?, last_synced_at = ? WHERE id = ?')
      .run(filesIndexed, new Date().toISOString(), syncJobId);

    logger.info('drive', `Drive folder indexed: ${folder_name || folder_id}`, {
      catbrainId, syncJobId, filesIndexed, totalFiles: files.length
    });

    return NextResponse.json({
      sync_job_id: syncJobId,
      sources_created: createdSources.length,
      sources: createdSources,
      files_skipped: files.length - filesIndexed - files.filter(f => f.mimeType === 'application/vnd.google-apps.folder').length,
    }, { status: 201 });

  } catch (error) {
    logger.error('drive', 'Error creating Drive sources', { error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
```

**Verify:** `cd ~/docflow/app && npm run build` passes. The endpoint compiles and the RAG append pipeline requires NO changes — sources with `is_pending_append: 1` and populated `content_text` are picked up by the existing `/api/catbrains/[id]/rag/append` handler.

---

## Wave 2: Polling Daemon + Manual Sync

### Task 2.1: Create DrivePollingService singleton
**File:** `app/src/lib/services/drive-polling.ts` — **NEW**
**Action:** Create new file
**Requirements:** POLL-01, POLL-02, POLL-03, POLL-04, POLL-05, POLL-06, POLL-07

Follows the TaskScheduler singleton pattern from `task-scheduler.ts`. Master tick every 60s, checks which jobs are due based on their individual `sync_interval_minutes`.

```typescript
import db from '@/lib/db';
import { createDriveClient } from '@/lib/services/google-drive-auth';
import { getChanges, getStartPageToken, downloadFile } from '@/lib/services/google-drive-service';
import { extractContent } from '@/lib/services/content-extractor';
import { GoogleDriveConfig, DriveSyncJob } from '@/lib/types';
import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const MASTER_TICK_MS = 60_000; // Check every 60s which jobs are due

/**
 * Map exported MIME type to file extension.
 */
function mimeToExtension(mime: string): string {
  switch (mime) {
    case 'text/plain': return 'txt';
    case 'text/csv': return 'csv';
    case 'application/pdf': return 'pdf';
    default: {
      const parts = mime.split('/');
      return parts[parts.length - 1]?.split('+')[0] || 'bin';
    }
  }
}

interface JobTimer {
  lastTick: number; // timestamp ms
  intervalMs: number;
}

class DrivePollingService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private jobTimers: Map<string, JobTimer> = new Map();

  /**
   * Start the polling service. Idempotent — calling multiple times is safe.
   */
  start(): void {
    if (this.intervalId) return;
    this.loadActiveJobs();
    logger.info('drive-polling', 'Drive polling service started', {
      activeJobs: this.jobTimers.size,
      masterTickMs: MASTER_TICK_MS,
    });
    this.intervalId = setInterval(() => this.tick(), MASTER_TICK_MS);
    // First tick after a short delay to let the app fully initialize
    setTimeout(() => this.tick(), 5_000);
  }

  /**
   * Stop the polling service.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.jobTimers.clear();
      logger.info('drive-polling', 'Drive polling service stopped');
    }
  }

  /**
   * Reload active jobs from DB. Called on start and can be called to refresh.
   */
  loadActiveJobs(): void {
    try {
      const jobs = db.prepare(
        'SELECT id, sync_interval_minutes FROM drive_sync_jobs WHERE is_active = 1 AND sync_interval_minutes > 0'
      ).all() as Array<{ id: string; sync_interval_minutes: number }>;

      this.jobTimers.clear();
      for (const job of jobs) {
        this.jobTimers.set(job.id, {
          lastTick: 0, // Will poll on first tick
          intervalMs: job.sync_interval_minutes * 60_000,
        });
      }
    } catch (err) {
      logger.error('drive-polling', 'Error loading active jobs', { error: (err as Error).message });
    }
  }

  /**
   * Notify service that a new sync job was created or updated.
   */
  refreshJob(jobId: string): void {
    const job = db.prepare(
      'SELECT id, sync_interval_minutes, is_active FROM drive_sync_jobs WHERE id = ?'
    ).get(jobId) as { id: string; sync_interval_minutes: number; is_active: number } | undefined;

    if (!job || !job.is_active || job.sync_interval_minutes <= 0) {
      this.jobTimers.delete(jobId);
    } else {
      this.jobTimers.set(jobId, {
        lastTick: Date.now(), // Don't poll immediately, wait for next interval
        intervalMs: job.sync_interval_minutes * 60_000,
      });
    }
  }

  /**
   * Master tick — checks which jobs are due and polls them.
   */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      // Reload jobs periodically to catch DB changes
      this.loadActiveJobs();
      const now = Date.now();

      for (const [jobId, timer] of this.jobTimers) {
        if (now - timer.lastTick < timer.intervalMs) continue;

        // Mark as ticked before polling (prevents re-entry)
        timer.lastTick = now;

        const job = db.prepare('SELECT * FROM drive_sync_jobs WHERE id = ? AND is_active = 1').get(jobId) as DriveSyncJob | undefined;
        if (!job) {
          this.jobTimers.delete(jobId);
          continue;
        }

        await this.pollJob(job);
      }
    } catch (err) {
      logger.error('drive-polling', 'Error in master tick', { error: (err as Error).message });
    } finally {
      this.running = false;
    }
  }

  /**
   * Poll a single sync job for changes.
   */
  private async pollJob(job: DriveSyncJob): Promise<void> {
    try {
      // Get connector and create Drive client
      const connector = db.prepare('SELECT * FROM connectors WHERE id = ?').get(job.connector_id) as { id: string; config: string } | undefined;
      if (!connector) {
        db.prepare('UPDATE drive_sync_jobs SET last_error = ? WHERE id = ?')
          .run('Connector not found', job.id);
        return;
      }

      const config = JSON.parse(connector.config) as GoogleDriveConfig;
      const drive = createDriveClient(config);

      // Get or initialize page token
      let pageToken = job.last_page_token;
      if (!pageToken) {
        pageToken = await getStartPageToken(drive);
        db.prepare('UPDATE drive_sync_jobs SET last_page_token = ? WHERE id = ?')
          .run(pageToken, job.id);
        return; // First run — just store token, changes will be detected next cycle
      }

      // Get changes since last token
      const result = await getChanges(drive, pageToken);

      // Filter to files in our watched folder
      const relevantChanges = result.changes.filter(c =>
        c.file?.parents?.includes(job.folder_id)
      );

      if (relevantChanges.length > 0) {
        const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');
        const sourcesDir = path.join(projectsPath, job.catbrain_id, 'sources');
        fs.mkdirSync(sourcesDir, { recursive: true });

        for (const change of relevantChanges) {
          try {
            if (change.removed) {
              // Mark source as deleted/error
              const indexedFile = db.prepare(
                'SELECT source_id FROM drive_indexed_files WHERE sync_job_id = ? AND drive_file_id = ?'
              ).get(job.id, change.fileId) as { source_id: string } | undefined;

              if (indexedFile) {
                db.prepare("UPDATE sources SET status = 'error', extraction_log = 'Archivo eliminado de Google Drive' WHERE id = ?")
                  .run(indexedFile.source_id);
                db.prepare('DELETE FROM drive_indexed_files WHERE sync_job_id = ? AND drive_file_id = ?')
                  .run(job.id, change.fileId);
              }
              continue;
            }

            // Download and check hash
            const { content, exportedMime } = await downloadFile(drive, change.fileId, change.file!.mimeType);
            const newHash = crypto.createHash('sha256').update(content).digest('hex');

            const existing = db.prepare(
              'SELECT * FROM drive_indexed_files WHERE sync_job_id = ? AND drive_file_id = ?'
            ).get(job.id, change.fileId) as { source_id: string; content_hash: string } | undefined;

            if (existing && existing.content_hash === newHash) continue; // No content change

            // Re-index: save file, extract, update source
            const ext = mimeToExtension(exportedMime);

            if (existing) {
              // Update existing source
              const source = db.prepare('SELECT file_path FROM sources WHERE id = ?').get(existing.source_id) as { file_path: string } | undefined;
              const filePath = source?.file_path || path.join(sourcesDir, `${existing.source_id}.${ext}`);
              fs.writeFileSync(filePath, content);

              const extraction = await extractContent(filePath);
              db.prepare(`
                UPDATE sources SET content_text = ?, file_size = ?, content_updated_at = ?, is_pending_append = 1, status = 'ready'
                WHERE id = ?
              `).run(extraction.text, content.length, new Date().toISOString(), existing.source_id);

              db.prepare('UPDATE drive_indexed_files SET content_hash = ?, drive_modified_time = ?, indexed_at = ? WHERE sync_job_id = ? AND drive_file_id = ?')
                .run(newHash, change.file?.modifiedTime || null, new Date().toISOString(), job.id, change.fileId);
            } else {
              // New file in folder — create source
              const sourceId = uuidv4();
              const filePath = path.join(sourcesDir, `${sourceId}.${ext}`);
              fs.writeFileSync(filePath, content);

              const extraction = await extractContent(filePath);
              const catbrain = db.prepare('SELECT rag_enabled FROM catbrains WHERE id = ?').get(job.catbrain_id) as { rag_enabled: number } | undefined;
              const isPendingAppend = catbrain?.rag_enabled === 1 ? 1 : 0;

              const maxOrderRow = db.prepare('SELECT MAX(order_index) as maxOrder FROM sources WHERE project_id = ?').get(job.catbrain_id) as { maxOrder: number | null };
              const nextOrderIndex = (maxOrderRow.maxOrder !== null ? maxOrderRow.maxOrder : -1) + 1;

              db.prepare(`
                INSERT INTO sources (id, project_id, type, name, file_path, file_type, file_size, content_text, status, drive_file_id, drive_sync_job_id, is_pending_append, order_index)
                VALUES (?, ?, 'google_drive', ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?)
              `).run(
                sourceId, job.catbrain_id, change.file!.name, filePath, exportedMime, content.length,
                extraction.text, change.fileId, job.id, isPendingAppend, nextOrderIndex
              );

              db.prepare(`
                INSERT INTO drive_indexed_files (id, sync_job_id, drive_file_id, drive_file_name, drive_mime_type, drive_modified_time, source_id, content_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).run(uuidv4(), job.id, change.fileId, change.file!.name, change.file!.mimeType, change.file?.modifiedTime || null, sourceId, newHash);
            }

            logger.info('drive-polling', `File updated: ${change.file?.name}`, { jobId: job.id, fileId: change.fileId });
          } catch (fileErr) {
            logger.error('drive-polling', `Error processing change for file ${change.fileId}`, { error: (fileErr as Error).message });
            // Continue with next change — don't break the loop
          }
        }

        // Update files_indexed count
        const indexedCount = db.prepare('SELECT COUNT(*) as cnt FROM drive_indexed_files WHERE sync_job_id = ?').get(job.id) as { cnt: number };
        db.prepare('UPDATE drive_sync_jobs SET files_indexed = ? WHERE id = ?').run(indexedCount.cnt, job.id);
      }

      // Update sync job metadata — always update even if no changes
      db.prepare('UPDATE drive_sync_jobs SET last_synced_at = ?, last_page_token = ?, last_error = NULL WHERE id = ?')
        .run(new Date().toISOString(), result.newStartPageToken || pageToken, job.id);

    } catch (err) {
      // POLL-07: Store error in last_error without interrupting cycle
      logger.error('drive-polling', `Polling error for job ${job.id}`, { error: (err as Error).message });
      db.prepare('UPDATE drive_sync_jobs SET last_error = ? WHERE id = ?')
        .run((err as Error).message, job.id);
    }
  }
}

export const drivePollingService = new DrivePollingService();
```

**Verify:** `cd ~/docflow/app && npm run build` passes. The singleton exports compile and follow the TaskScheduler pattern.

---

### Task 2.2: Create POST manual sync endpoint
**File:** `app/src/app/api/catbrains/[id]/sources/drive/[sourceId]/sync/route.ts` — **NEW**
**Action:** Create new file
**Requirements:** SRC-06

Triggers immediate re-download and re-index of a single Drive source if its content hash changed.

```typescript
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { extractContent } from '@/lib/services/content-extractor';
import { createDriveClient } from '@/lib/services/google-drive-auth';
import { downloadFile } from '@/lib/services/google-drive-service';
import { GoogleDriveConfig } from '@/lib/types';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  try {
    const { id: catbrainId, sourceId } = await params;

    // Get source
    const source = db.prepare(
      "SELECT * FROM sources WHERE id = ? AND project_id = ? AND type = 'google_drive'"
    ).get(sourceId, catbrainId) as { id: string; drive_file_id: string; drive_sync_job_id: string; file_path: string } | undefined;

    if (!source) {
      return NextResponse.json({ error: 'Drive source not found' }, { status: 404 });
    }

    if (!source.drive_file_id || !source.drive_sync_job_id) {
      return NextResponse.json({ error: 'Source is missing Drive metadata' }, { status: 400 });
    }

    // Get sync job and connector
    const syncJob = db.prepare('SELECT * FROM drive_sync_jobs WHERE id = ?').get(source.drive_sync_job_id) as { connector_id: string } | undefined;
    if (!syncJob) {
      return NextResponse.json({ error: 'Sync job not found' }, { status: 404 });
    }

    const connector = db.prepare('SELECT * FROM connectors WHERE id = ? AND type = ?').get(syncJob.connector_id, 'google_drive') as { config: string } | undefined;
    if (!connector) {
      return NextResponse.json({ error: 'Drive connector not found' }, { status: 404 });
    }

    const config = JSON.parse(connector.config) as GoogleDriveConfig;
    const drive = createDriveClient(config);

    // Download file
    // We need the MIME type — get it from drive_indexed_files
    const indexedFile = db.prepare(
      'SELECT * FROM drive_indexed_files WHERE sync_job_id = ? AND drive_file_id = ?'
    ).get(source.drive_sync_job_id, source.drive_file_id) as { content_hash: string; drive_mime_type: string } | undefined;

    const mimeType = indexedFile?.drive_mime_type || 'application/octet-stream';
    const { content, exportedMime } = await downloadFile(drive, source.drive_file_id, mimeType);
    const newHash = crypto.createHash('sha256').update(content).digest('hex');

    if (indexedFile && indexedFile.content_hash === newHash) {
      return NextResponse.json({ changed: false, message: 'El contenido no ha cambiado' });
    }

    // Content changed — re-extract
    const filePath = source.file_path || path.join(
      process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects'),
      catbrainId, 'sources', `${sourceId}.bin`
    );
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);

    const extraction = await extractContent(filePath);

    db.prepare(`
      UPDATE sources SET content_text = ?, file_size = ?, content_updated_at = ?, is_pending_append = 1, status = 'ready'
      WHERE id = ?
    `).run(extraction.text, content.length, new Date().toISOString(), sourceId);

    if (indexedFile) {
      db.prepare('UPDATE drive_indexed_files SET content_hash = ?, indexed_at = ? WHERE sync_job_id = ? AND drive_file_id = ?')
        .run(newHash, new Date().toISOString(), source.drive_sync_job_id, source.drive_file_id);
    }

    logger.info('drive', `Manual sync completed: ${sourceId}`, { changed: true, catbrainId });

    return NextResponse.json({ changed: true, message: 'Contenido actualizado y marcado para re-indexar' });

  } catch (error) {
    logger.error('drive', 'Error in manual sync', { error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
```

**Verify:** `cd ~/docflow/app && npm run build` passes.

---

## Wave 3: UI + Startup

### Task 3.1: Register DrivePollingService in instrumentation.ts
**File:** `app/src/instrumentation.ts`
**Action:** Edit existing file
**Requirements:** POLL-01, POLL-02

Add the Drive polling service startup alongside the task scheduler:

```typescript
export async function register() {
  if (process['env']['NEXT_RUNTIME'] === 'nodejs') {
    const { taskScheduler } = await import('@/lib/services/task-scheduler');
    taskScheduler.start();

    const { drivePollingService } = await import('@/lib/services/drive-polling');
    drivePollingService.start();
  }
}
```

**Verify:** `cd ~/docflow/app && npm run build` passes.

---

### Task 3.2: Add Drive badge, filter, and stats to source-list.tsx
**File:** `app/src/components/sources/source-list.tsx`
**Action:** Edit existing file
**Requirements:** SRC-04, SRC-05

1. **Stats counter** (around line 327-333) — add `google_drive` count:
   ```typescript
   const stats = {
     total: sources.length,
     file: sources.filter(s => s.type === 'file').length,
     url: sources.filter(s => s.type === 'url').length,
     youtube: sources.filter(s => s.type === 'youtube').length,
     note: sources.filter(s => s.type === 'note').length,
     google_drive: sources.filter(s => s.type === 'google_drive').length,
   };
   ```

2. **Stats display** (line 356) — update the `t('stats', ...)` call to include `drive: stats.google_drive`:
   ```typescript
   {t('stats', { total: stats.total, file: stats.file, url: stats.url, youtube: stats.youtube, note: stats.note, drive: stats.google_drive })}
   ```

3. **Type filter dropdown** (around line 418, after the note SelectItem) — add Drive option:
   ```tsx
   <SelectItem value="google_drive">{t('filterDrive')}</SelectItem>
   ```

4. **SINCRONIZANDO badge** (around line 471-479) — add a Drive syncing badge. After the `is_pending_append` badge block, add a third condition for active Drive sync:
   ```tsx
   {source.is_pending_append === 1 && ragEnabled ? (
     <Badge className="bg-violet-500/10 text-violet-400 border-0 text-[10px] flex-shrink-0 px-1.5 py-0.5 animate-pulse">
       {t('badge.pendingAppend')}
     </Badge>
   ) : source.type === 'google_drive' && source.drive_sync_job_id ? (
     <Badge className="bg-sky-500/10 text-sky-400 border-0 text-[10px] flex-shrink-0 px-1.5 py-0.5 animate-pulse">
       {t('badge.syncing')}
     </Badge>
   ) : isNew ? (
     <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-[10px] flex-shrink-0 px-1.5 py-0.5">
       {t('badge.new')}
     </Badge>
   ) : null}
   ```

   **Note:** The `source.drive_sync_job_id` check indicates this source is managed by a sync job. The badge pulses (`animate-pulse`) per SRC-05. Since the Source type does not currently have `drive_sync_job_id` in its TypeScript interface, the type was updated in Task 1.1. We need to also add `drive_file_id` and `drive_sync_job_id` to the Source interface in types.ts (Task 1.1 addendum):

   Add to Source interface after `order_index`:
   ```typescript
   drive_file_id?: string | null;
   drive_sync_job_id?: string | null;
   ```

**Verify:** `cd ~/docflow/app && npm run build` passes.

---

### Task 3.3: Add Drive icon and type badge to source-item.tsx
**File:** `app/src/components/sources/source-item.tsx`
**Action:** Edit existing file
**Requirements:** SRC-04

1. **Import HardDrive icon** (add to lucide-react imports at top of file):
   ```typescript
   import { ..., HardDrive } from 'lucide-react';
   ```

   If `HardDrive` is not in lucide-react, use `CloudIcon` or `FolderSync` instead. The `Cloud` icon from lucide-react is the safest choice.

2. **getIcon()** (around line 61) — add google_drive case BEFORE the file-type checks:
   ```typescript
   const getIcon = () => {
     if (source.type === 'url') return <LinkIcon className="w-5 h-5 text-green-500" />;
     if (source.type === 'youtube') return <Youtube className="w-5 h-5 text-red-500" />;
     if (source.type === 'note') return <StickyNote className="w-5 h-5 text-purple-500" />;
     if (source.type === 'google_drive') return <HardDrive className="w-5 h-5 text-sky-500" />;
     // ... rest of file type checks
   ```

3. **getTypeBadge()** (around line 78-85) — add google_drive case:
   ```typescript
   case 'google_drive': return <Badge className="bg-sky-500/10 text-sky-500 hover:bg-sky-500/20 border-0">DRIVE</Badge>;
   ```

**Verify:** `cd ~/docflow/app && npm run build` passes.

---

### Task 3.4: Add i18n keys for Drive sources
**Files:** `app/messages/es.json` and `app/messages/en.json`
**Action:** Edit existing files
**Requirements:** SRC-04

Add these keys inside the `sources` namespace:

**es.json** — inside `"sources": { ... }`:
```json
"filterDrive": "Google Drive",
"badge": {
  "pendingAppend": "NUEVA ✦",
  "new": "Nueva",
  "syncing": "SINCRONIZANDO"
}
```
Note: `badge.pendingAppend` and `badge.new` already exist — only add `badge.syncing`.

Update the `stats` key to include `{drive}`:
```json
"stats": "{total} fuentes: {file} archivos, {url} URLs, {youtube} YouTube, {note} notas, {drive} Drive"
```

**en.json** — mirror:
```json
"filterDrive": "Google Drive",
"badge": {
  "syncing": "SYNCING"
}
```
And update `stats` similarly.

**Verify:** `cd ~/docflow/app && npm run build` passes (Next.js validates i18n keys at build).

---

## Verification Checklist

| Req | Criterion | How to verify |
|-----|-----------|---------------|
| SRC-01 | `'google_drive'` in Source type union | `grep "google_drive" app/src/lib/types.ts` — appears in Source.type |
| SRC-02 | POST sources/drive creates sources | `npm run build` + manual curl test |
| SRC-03 | extractContent used for Drive files | Code path: downloadFile → writeFile → extractContent(filePath) |
| SRC-04 | Badge DRIVE visible | source-item.tsx has sky-500 DRIVE badge |
| SRC-05 | Badge SINCRONIZANDO pulsante | source-list.tsx has `animate-pulse` badge with `badge.syncing` i18n |
| SRC-06 | Manual sync endpoint | POST sources/drive/[sourceId]/sync route exists |
| SRC-07 | RAG append unchanged | No edits to `/rag/append` — sources have `content_text` + `is_pending_append` |
| POLL-01 | DrivePollingService singleton | `drive-polling.ts` exports singleton with setInterval |
| POLL-02 | Loads active jobs on start | `loadActiveJobs()` queries `drive_sync_jobs WHERE is_active = 1` |
| POLL-03 | Uses changes.list | `pollJob()` calls `getChanges(drive, pageToken)` |
| POLL-04 | Compares content_hash | SHA-256 comparison before re-extraction |
| POLL-05 | Updates last_synced_at and last_page_token | UPDATE statement at end of `pollJob()` |
| POLL-06 | Configurable interval | Per-job `sync_interval_minutes` from DB, checked in `tick()` |
| POLL-07 | Errors in last_error | try/catch per job, stores in `last_error` column |

**Final gate:** `cd ~/docflow/app && npm run build` passes clean.

---

## File Summary

| File | Action | Wave |
|------|--------|------|
| `app/src/lib/types.ts` | EDIT — add `'google_drive'` to Source type + `drive_file_id`, `drive_sync_job_id` fields | 1 |
| `app/src/app/api/catbrains/[id]/sources/drive/route.ts` | CREATE — POST endpoint | 1 |
| `app/src/lib/services/drive-polling.ts` | CREATE — DrivePollingService singleton | 2 |
| `app/src/app/api/catbrains/[id]/sources/drive/[sourceId]/sync/route.ts` | CREATE — POST manual sync | 2 |
| `app/src/instrumentation.ts` | EDIT — start DrivePollingService | 3 |
| `app/src/components/sources/source-list.tsx` | EDIT — Drive stats, filter, sync badge | 3 |
| `app/src/components/sources/source-item.tsx` | EDIT — Drive icon + type badge | 3 |
| `app/messages/es.json` | EDIT — add Drive i18n keys | 3 |
| `app/messages/en.json` | EDIT — add Drive i18n keys | 3 |

**Total:** 5 EDIT + 3 CREATE = 8 files across 3 waves

---
*Plan created: 2026-03-25*
*Phase: 83 — Fuente Google Drive + Indexacion RAG*
