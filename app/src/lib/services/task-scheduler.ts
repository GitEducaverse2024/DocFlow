import db from '@/lib/db';
import { calculateNextExecutionFromDate, calculateCanvasNextExecution, type ScheduleConfig, type CanvasScheduleConfig } from '@/lib/schedule-utils';
import { executeTaskWithCycles } from './task-executor';
import { executeCanvas } from './canvas-executor';
import { topologicalSort } from './canvas-executor';
import { generateId } from '@/lib/utils';
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
      // ---- Canvas scheduling (v17.0) ----
      await this.tickCanvases();

    } catch (err) {
      logger.error('scheduler', 'Scheduler tick error', { error: (err as Error).message });
    } finally {
      this.running = false;
    }
  }

  async tickCanvases(): Promise<void> {
    try {
      const scheduled = db.prepare(
        "SELECT id, flow_data, next_run_at FROM canvases WHERE status = 'scheduled' AND is_template = 0"
      ).all() as Array<{ id: string; flow_data: string | null; next_run_at: string | null }>;

      const now = new Date();

      for (const canvas of scheduled) {
        try {
          if (!canvas.flow_data) continue;

          const flowData = JSON.parse(canvas.flow_data) as { nodes: Array<{ id: string; type: string; data: Record<string, unknown>; position: { x: number; y: number } }>; edges: Array<{ id: string; source: string; target: string }> };
          const startNode = flowData.nodes?.find(n => n.type === 'start');
          if (!startNode) continue;

          const schedConfig = startNode.data.schedule_config as CanvasScheduleConfig | undefined;
          if (!schedConfig?.is_active) continue;

          // Check if it's time to run
          const nextRun = canvas.next_run_at ? new Date(canvas.next_run_at) : null;
          let shouldRun = false;

          if (nextRun && nextRun <= now) {
            shouldRun = true;
          } else if (!nextRun) {
            // First time: calculate and store next_run, don't run yet
            const next = calculateCanvasNextExecution(schedConfig, now);
            if (next) {
              db.prepare('UPDATE canvases SET next_run_at = ?, updated_at = ? WHERE id = ?')
                .run(next.toISOString(), now.toISOString(), canvas.id);
            }
            continue;
          }

          if (!shouldRun) continue;

          logger.info('scheduler', 'Executing scheduled canvas', {
            canvasId: canvas.id, scheduledFor: canvas.next_run_at,
          });

          // Check no existing running run for this canvas
          const runningRun = db.prepare(
            "SELECT id FROM canvas_runs WHERE canvas_id = ? AND status = 'running' LIMIT 1"
          ).get(canvas.id) as { id: string } | undefined;

          if (runningRun) {
            logger.info('scheduler', 'Skipping scheduled canvas — already running', {
              canvasId: canvas.id, runId: runningRun.id,
            });
          } else {
            // Create run and execute
            const { nodes, edges } = flowData;
            if (nodes && nodes.length > 0) {
              const executionOrder = topologicalSort(nodes, edges || []);
              const nodeStates: Record<string, { status: string }> = {};
              for (const node of nodes) {
                nodeStates[node.id] = { status: 'pending' };
              }
              const runId = generateId();
              const nowStr = now.toISOString();
              db.prepare(`
                INSERT INTO canvas_runs (id, canvas_id, status, node_states, current_node_id, execution_order, total_tokens, total_duration, started_at, created_at, metadata)
                VALUES (?, ?, 'running', ?, NULL, ?, 0, 0, ?, ?, ?)
              `).run(runId, canvas.id, JSON.stringify(nodeStates), JSON.stringify(executionOrder), nowStr, nowStr, JSON.stringify({ source: 'scheduler' }));

              executeCanvas(canvas.id, runId).catch(err => {
                logger.error('scheduler', 'Scheduled canvas execution failed', {
                  canvasId: canvas.id, error: (err as Error).message,
                });
              });
            }
          }

          // Calculate and store next run
          const nextExec = calculateCanvasNextExecution(schedConfig, now);
          if (nextExec) {
            db.prepare('UPDATE canvases SET next_run_at = ?, updated_at = ? WHERE id = ?')
              .run(nextExec.toISOString(), now.toISOString(), canvas.id);
          } else {
            // No more runs — deactivate
            db.prepare("UPDATE canvases SET status = 'idle', next_run_at = NULL, updated_at = ? WHERE id = ?")
              .run(now.toISOString(), canvas.id);
            logger.info('scheduler', 'Canvas schedule deactivated (no more valid runs)', { canvasId: canvas.id });
          }

        } catch (err) {
          logger.error('scheduler', 'Error processing scheduled canvas', {
            canvasId: canvas.id, error: (err as Error).message,
          });
        }
      }
    } catch (err) {
      logger.error('scheduler', 'Canvas scheduler tick error', { error: (err as Error).message });
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
