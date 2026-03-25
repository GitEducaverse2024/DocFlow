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

      const entries = Array.from(this.jobTimers.entries());
      for (const [jobId, timer] of entries) {
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
