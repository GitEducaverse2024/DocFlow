import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { retryTask } from '@/lib/services/task-executor';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get(params.id) as { status: string } | undefined;
    if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });

    if (task.status !== 'failed') {
      return NextResponse.json({ error: 'Solo se pueden reintentar tareas fallidas' }, { status: 400 });
    }

    retryTask(params.id).catch(err => {
      logger.error('tasks', 'Error reintentando tarea', { taskId: params.id, error: (err as Error).message });
    });

    return NextResponse.json({ success: true, message: 'Reintento iniciado' });
  } catch (error) {
    logger.error('tasks', 'Error en reintento', { taskId: params.id, error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
