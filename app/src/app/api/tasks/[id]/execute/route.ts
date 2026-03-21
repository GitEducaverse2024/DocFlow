import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { executeTaskWithCycles } from '@/lib/services/task-executor';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id) as { id: string; status: string } | undefined;
    if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });

    // Only allow execution from draft, ready, or failed states
    if (!['draft', 'ready', 'failed'].includes(task.status)) {
      return NextResponse.json({ error: `No se puede ejecutar una tarea en estado '${task.status}'` }, { status: 400 });
    }

    // Check task has at least 1 step
    const stepCount = (db.prepare('SELECT COUNT(*) as c FROM task_steps WHERE task_id = ?').get(params.id) as { c: number }).c;
    if (stepCount === 0) {
      return NextResponse.json({ error: 'La tarea no tiene pasos configurados' }, { status: 400 });
    }

    logger.info('tasks', 'Ejecucion de tarea iniciada', { taskId: params.id, steps: stepCount });

    // Fire and forget — execution runs in background (supports variable cycle mode)
    executeTaskWithCycles(params.id).catch(err => {
      logger.error('tasks', 'Error ejecutando tarea', { taskId: params.id, error: (err as Error).message });
    });

    return NextResponse.json({ status: 'running', message: 'Ejecucion iniciada' });
  } catch (error) {
    logger.error('tasks', 'Error iniciando ejecucion', { error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
