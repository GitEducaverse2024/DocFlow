import db from '@/lib/db';
import catbotDb from '@/lib/catbot-db';
import { generateId } from '@/lib/utils';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const BOOT_DELAY = 30_000; // 30s — avoid interfering with startup

// Thresholds
const KNOWLEDGE_GAPS_THRESHOLD = 20;
const STAGING_ENTRIES_THRESHOLD = 30;
const UNREAD_NOTIFICATIONS_THRESHOLD = 50;
const CONNECTOR_FAIL_THRESHOLD = 3;
const UNRESOLVED_INTENTS_THRESHOLD = 5;
const STUCK_PIPELINE_THRESHOLD_MIN = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SystemAlert {
  id: string;
  category: string;
  alert_key: string;
  title: string;
  message: string | null;
  severity: string;
  details: string | null;
  acknowledged: number;
  acknowledged_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// AlertService singleton
// ---------------------------------------------------------------------------

export class AlertService {
  private static intervalId: ReturnType<typeof setInterval> | null = null;
  private static timeoutId: ReturnType<typeof setTimeout> | null = null;

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  static start(): void {
    logger.info('alerts', 'Starting with boot delay', { delayMs: BOOT_DELAY });
    this.timeoutId = setTimeout(() => {
      this.tick().catch(err =>
        logger.error('alerts', 'Tick error', { error: String(err) })
      );
      this.intervalId = setInterval(() => {
        this.tick().catch(err =>
          logger.error('alerts', 'Tick error', { error: String(err) })
        );
      }, CHECK_INTERVAL);
    }, BOOT_DELAY);
  }

  static stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.intervalId = null;
    this.timeoutId = null;
  }

  // -----------------------------------------------------------------------
  // Tick — runs all checks
  // -----------------------------------------------------------------------

  static async tick(): Promise<void> {
    logger.info('alerts', 'Running alert checks');

    // Each check wrapped in try-catch so one failing doesn't block others
    const checks = [
      () => this.checkKnowledgeGaps(),
      () => this.checkStagingEntries(),
      () => this.checkStuckTasks(),
      () => this.checkOrphanedRuns(),
      () => this.checkFailingConnectors(),
      () => this.checkStaleSyncs(),
      () => this.checkUnreadNotifications(),
      () => this.checkIntentsUnresolved(),
      () => this.checkStuckPipelines(),
    ];

    for (const check of checks) {
      try {
        await check();
      } catch (err) {
        logger.error('alerts', 'Check failed', { error: String(err) });
      }
    }

    // Cleanup: delete acknowledged alerts older than 30 days
    try {
      db.prepare(
        "DELETE FROM system_alerts WHERE acknowledged = 1 AND created_at < datetime('now', '-30 days')"
      ).run();
    } catch (err) {
      logger.error('alerts', 'Cleanup failed', { error: String(err) });
    }
  }

  // -----------------------------------------------------------------------
  // Check methods
  // -----------------------------------------------------------------------

  static async checkKnowledgeGaps(): Promise<void> {
    const row = catbotDb.prepare(
      'SELECT COUNT(*) AS cnt FROM knowledge_gaps WHERE resolved = 0'
    ).get() as { cnt: number };

    if (row.cnt > KNOWLEDGE_GAPS_THRESHOLD) {
      this.insertAlert(
        'knowledge',
        'knowledge_gaps_high',
        'Gaps de conocimiento acumulados',
        `Hay ${row.cnt} gaps de conocimiento sin resolver (umbral: ${KNOWLEDGE_GAPS_THRESHOLD})`,
        'warning',
        JSON.stringify({ count: row.cnt, threshold: KNOWLEDGE_GAPS_THRESHOLD })
      );
    }
  }

  static async checkStagingEntries(): Promise<void> {
    const row = catbotDb.prepare(
      'SELECT COUNT(*) AS cnt FROM knowledge_learned WHERE validated = 0'
    ).get() as { cnt: number };

    if (row.cnt > STAGING_ENTRIES_THRESHOLD) {
      this.insertAlert(
        'knowledge',
        'staging_entries_high',
        'Entradas en staging acumuladas',
        `Hay ${row.cnt} entradas de conocimiento sin validar (umbral: ${STAGING_ENTRIES_THRESHOLD})`,
        'warning',
        JSON.stringify({ count: row.cnt, threshold: STAGING_ENTRIES_THRESHOLD })
      );
    }
  }

  static async checkStuckTasks(): Promise<void> {
    const rows = db.prepare(
      "SELECT id, name, updated_at FROM tasks WHERE status = 'running' AND updated_at < datetime('now', '-1 hour')"
    ).all() as Array<{ id: string; name: string; updated_at: string }>;

    if (rows.length > 0) {
      this.insertAlert(
        'execution',
        'tasks_stuck',
        'Tareas atascadas',
        `Hay ${rows.length} tarea(s) en estado running por mas de 1 hora`,
        'warning',
        JSON.stringify({ tasks: rows.map(r => ({ id: r.id, name: r.name })) })
      );
    }
  }

  static async checkOrphanedRuns(): Promise<void> {
    const rows = db.prepare(
      "SELECT id, canvas_id, started_at FROM canvas_runs WHERE status IN ('running', 'pending') AND started_at < datetime('now', '-2 hours')"
    ).all() as Array<{ id: string; canvas_id: string; started_at: string }>;

    if (rows.length > 0) {
      this.insertAlert(
        'execution',
        'canvas_runs_orphaned',
        'Canvas runs huerfanos',
        `Hay ${rows.length} canvas run(s) pendientes/corriendo por mas de 2 horas`,
        'warning',
        JSON.stringify({ runs: rows.map(r => ({ id: r.id, canvas_id: r.canvas_id })) })
      );
    }
  }

  static async checkFailingConnectors(): Promise<void> {
    const rows = db.prepare(
      "SELECT connector_id, COUNT(*) AS error_count FROM connector_logs WHERE status = 'error' AND created_at > datetime('now', '-1 hour') GROUP BY connector_id HAVING COUNT(*) >= ?"
    ).all(CONNECTOR_FAIL_THRESHOLD) as Array<{ connector_id: string; error_count: number }>;

    if (rows.length > 0) {
      for (const row of rows) {
        this.insertAlert(
          'integration',
          `connector_failing_${row.connector_id}`,
          'Conector fallando repetidamente',
          `Conector ${row.connector_id} ha fallado ${row.error_count} veces en la ultima hora`,
          'error',
          JSON.stringify({ connector_id: row.connector_id, error_count: row.error_count })
        );
      }
    }
  }

  static async checkStaleSyncs(): Promise<void> {
    const rows = db.prepare(
      "SELECT id, catbrain_id, sync_interval_minutes, last_synced_at FROM drive_sync_jobs WHERE is_active = 1 AND last_synced_at < datetime('now', '-' || (sync_interval_minutes * 2) || ' minutes')"
    ).all() as Array<{ id: string; catbrain_id: string; sync_interval_minutes: number; last_synced_at: string }>;

    if (rows.length > 0) {
      this.insertAlert(
        'integration',
        'drive_sync_stale',
        'Sincronizacion de Drive desactualizada',
        `Hay ${rows.length} sync job(s) con retraso mayor a 2x su intervalo`,
        'warning',
        JSON.stringify({ syncs: rows.map(r => ({ id: r.id, catbrain_id: r.catbrain_id })) })
      );
    }
  }

  static async checkUnreadNotifications(): Promise<void> {
    const row = db.prepare(
      'SELECT COUNT(*) AS cnt FROM notifications WHERE read = 0'
    ).get() as { cnt: number };

    if (row.cnt > UNREAD_NOTIFICATIONS_THRESHOLD) {
      this.insertAlert(
        'notification',
        'unread_notifications_high',
        'Notificaciones sin leer acumuladas',
        `Hay ${row.cnt} notificaciones sin leer (umbral: ${UNREAD_NOTIFICATIONS_THRESHOLD})`,
        'info',
        JSON.stringify({ count: row.cnt, threshold: UNREAD_NOTIFICATIONS_THRESHOLD })
      );
    }
  }

  static async checkIntentsUnresolved(): Promise<void> {
    const row = catbotDb.prepare(
      `SELECT COUNT(*) AS cnt FROM intents WHERE status IN ('failed','abandoned') AND (completed_at IS NULL OR completed_at > datetime('now', '-7 days'))`
    ).get() as { cnt: number };

    if (row.cnt > UNRESOLVED_INTENTS_THRESHOLD) {
      this.insertAlert(
        'execution',
        'intents_unresolved',
        'Intents sin resolver acumulados',
        `Hay ${row.cnt} intents en estado failed/abandoned sin resolver (umbral: ${UNRESOLVED_INTENTS_THRESHOLD})`,
        'warning',
        JSON.stringify({ count: row.cnt, threshold: UNRESOLVED_INTENTS_THRESHOLD }),
      );
    }
  }

  static async checkStuckPipelines(): Promise<void> {
    const row = catbotDb.prepare(
      `SELECT COUNT(*) AS cnt FROM intent_jobs
       WHERE status = 'running'
         AND updated_at < datetime('now', '-${STUCK_PIPELINE_THRESHOLD_MIN} minutes')`,
    ).get() as { cnt: number };

    if (row.cnt > 0) {
      this.insertAlert(
        'execution',
        'pipelines_stuck',
        'Pipelines atascados',
        `Hay ${row.cnt} intent_jobs en estado running sin actualizarse en >${STUCK_PIPELINE_THRESHOLD_MIN} minutos`,
        'warning',
        JSON.stringify({ count: row.cnt, threshold_min: STUCK_PIPELINE_THRESHOLD_MIN }),
      );
    }
  }

  // -----------------------------------------------------------------------
  // Core operations
  // -----------------------------------------------------------------------

  static insertAlert(
    category: string,
    alertKey: string,
    title: string,
    message: string,
    severity: string = 'warning',
    details: string | null = null,
  ): void {
    // Dedup: skip if unacknowledged alert exists with same category+alert_key
    const existing = db.prepare(
      'SELECT id FROM system_alerts WHERE category = ? AND alert_key = ? AND acknowledged = 0'
    ).get(category, alertKey);

    if (existing) {
      return;
    }

    const id = generateId();
    db.prepare(
      'INSERT INTO system_alerts (id, category, alert_key, title, message, severity, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, category, alertKey, title, message, severity, details);

    logger.info('alerts', 'Alert created', { id, category, alertKey, severity });
  }

  static getAlerts(pendingOnly: boolean = true): SystemAlert[] {
    if (pendingOnly) {
      return db.prepare(
        'SELECT * FROM system_alerts WHERE acknowledged = 0 ORDER BY created_at DESC'
      ).all() as SystemAlert[];
    }
    return db.prepare(
      'SELECT * FROM system_alerts ORDER BY created_at DESC'
    ).all() as SystemAlert[];
  }

  static acknowledgeAll(): void {
    db.prepare(
      "UPDATE system_alerts SET acknowledged = 1, acknowledged_at = datetime('now') WHERE acknowledged = 0"
    ).run();
    logger.info('alerts', 'All alerts acknowledged');
  }
}
