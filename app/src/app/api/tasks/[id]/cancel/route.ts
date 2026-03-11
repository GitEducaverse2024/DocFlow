import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cancelTask } from '@/lib/services/task-executor';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get(params.id) as { status: string } | undefined;
    if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });

    if (!['running', 'paused'].includes(task.status)) {
      return NextResponse.json({ error: 'Solo se pueden cancelar tareas en ejecucion o pausadas' }, { status: 400 });
    }

    cancelTask(params.id);
    return NextResponse.json({ success: true, message: 'Tarea cancelada' });
  } catch (error) {
    console.error('[Tasks] Error cancelando:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
