import db from '@/lib/db';
import { calculateNextExecutionFromDate, type ScheduleConfig } from '@/lib/schedule-utils';
import { executeTaskWithCycles } from './task-executor';
import { logger } from '@/lib/logger';

const POLL_INTERVAL_MS = 60_000; // 60 seconds

class TaskScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  start(): void {
    if (this.intervalId) return; // Idempotent
    logger.info('scheduler', 'Task scheduler started', { pollInterval: POLL_INTERVAL_MS });
    this.intervalId = setInterval(() => this.tick(), POLL_INTERVAL_MS);
    this.tick(); // First tick immediately
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('scheduler', 'Task scheduler stopped');
    }
  }

  async tick(): Promise<void> {
    if (this.running) return; // Prevent overlapping ticks
    this.running = true;

    try {
      const now = new Date().toISOString();

      const dueSchedules = db.prepare(`
        SELECT ts.id as schedule_id, ts.task_id, ts.next_run_at,
               t.status as task_status, t.schedule_config
        FROM task_schedules ts
        JOIN tasks t ON t.id = ts.task_id
        WHERE ts.is_active = 1
          AND ts.next_run_at IS NOT NULL
          AND ts.next_run_at <= ?
          AND t.status NOT IN ('running', 'paused')
          AND t.execution_mode = 'scheduled'
      `).all(now) as Array<{
        schedule_id: string; task_id: string; next_run_at: string;
        task_status: string; schedule_config: string;
      }>;

      for (const schedule of dueSchedules) {
        try {
          logger.info('scheduler', 'Executing scheduled task', {
            taskId: schedule.task_id, scheduledFor: schedule.next_run_at
          });

          // Reset steps for re-execution
          db.prepare(`
            UPDATE task_steps
            SET status = 'pending', output = NULL, tokens_used = 0, duration_seconds = 0,
                started_at = NULL, completed_at = NULL, human_feedback = NULL
            WHERE task_id = ?
          `).run(schedule.task_id);

          // Set task to 'ready' to prevent race condition on next tick
          db.prepare("UPDATE tasks SET status = 'ready', updated_at = ? WHERE id = ?")
            .run(now, schedule.task_id);

          // Fire and forget — executeTaskWithCycles sets status='running' synchronously
          executeTaskWithCycles(schedule.task_id)
            .then(() => this.updateNextRun(schedule.task_id, schedule.schedule_id))
            .catch(err => {
              logger.error('scheduler', 'Scheduled execution failed', {
                taskId: schedule.task_id, error: (err as Error).message
              });
              this.updateNextRun(schedule.task_id, schedule.schedule_id);
            });

        } catch (err) {
          logger.error('scheduler', 'Error launching scheduled task', {
            taskId: schedule.task_id, error: (err as Error).message
          });
        }
      }
    } catch (err) {
      logger.error('scheduler', 'Scheduler tick error', { error: (err as Error).message });
    } finally {
      this.running = false;
    }
  }

  updateNextRun(taskId: string, scheduleId: string): void {
    try {
      const task = db.prepare('SELECT schedule_config FROM tasks WHERE id = ?').get(taskId) as { schedule_config: string | null } | undefined;
      if (!task?.schedule_config) return;

      const config: ScheduleConfig = JSON.parse(task.schedule_config);
      const nextRun = calculateNextExecutionFromDate(config, new Date());
      const now = new Date().toISOString();

      if (nextRun) {
        db.prepare('UPDATE task_schedules SET next_run_at = ?, last_run_at = ?, updated_at = ? WHERE id = ?')
          .run(nextRun.toISOString(), now, now, scheduleId);
        db.prepare('UPDATE tasks SET next_run_at = ?, updated_at = ? WHERE id = ?')
          .run(nextRun.toISOString(), now, taskId);
      } else {
        // No more valid runs — deactivate
        db.prepare('UPDATE task_schedules SET is_active = 0, next_run_at = NULL, updated_at = ? WHERE id = ?')
          .run(now, scheduleId);
        db.prepare('UPDATE tasks SET next_run_at = NULL, updated_at = ? WHERE id = ?')
          .run(now, taskId);
        logger.info('scheduler', 'Schedule deactivated (no more valid runs)', { taskId });
      }
    } catch (err) {
      logger.error('scheduler', 'Error updating next run', { taskId, error: (err as Error).message });
    }
  }
}

export const taskScheduler = new TaskScheduler();
export { TaskScheduler };
