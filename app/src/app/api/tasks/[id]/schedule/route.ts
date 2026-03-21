import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { calculateNextExecution } from '@/lib/schedule-utils';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = await params;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });
    if (task.execution_mode !== 'scheduled') {
      return NextResponse.json({ error: 'La tarea no es de tipo programado' }, { status: 400 });
    }

    const { is_active } = await request.json();
    const now = new Date().toISOString();

    if (is_active) {
      const config = task.schedule_config ? JSON.parse(task.schedule_config as string) : null;
      if (!config) return NextResponse.json({ error: 'Sin configuracion de horario' }, { status: 400 });

      const nextRun = calculateNextExecution(config);
      db.prepare('UPDATE task_schedules SET is_active = 1, next_run_at = ?, updated_at = ? WHERE task_id = ?')
        .run(nextRun?.toISOString() || null, now, id);
      db.prepare('UPDATE tasks SET next_run_at = ?, updated_at = ? WHERE id = ?')
        .run(nextRun?.toISOString() || null, now, id);

      logger.info('scheduler', 'Schedule activated', { taskId: id, nextRun: nextRun?.toISOString() || null });
      return NextResponse.json({ is_active: true, next_run_at: nextRun?.toISOString() || null });
    } else {
      db.prepare('UPDATE task_schedules SET is_active = 0, next_run_at = NULL, updated_at = ? WHERE task_id = ?')
        .run(now, id);
      db.prepare('UPDATE tasks SET next_run_at = NULL, updated_at = ? WHERE id = ?')
        .run(now, id);

      logger.info('scheduler', 'Schedule deactivated', { taskId: id });
      return NextResponse.json({ is_active: false, next_run_at: null });
    }
  } catch (error) {
    logger.error('tasks', 'Error toggling schedule', { error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
