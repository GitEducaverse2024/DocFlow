import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { retryTask } from '@/lib/services/task-executor';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get(params.id) as { status: string } | undefined;
    if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });

    if (task.status !== 'failed') {
      return NextResponse.json({ error: 'Solo se pueden reintentar tareas fallidas' }, { status: 400 });
    }

    retryTask(params.id).catch(err => {
      console.error('[Tasks] Error reintentando:', err);
    });

    return NextResponse.json({ success: true, message: 'Reintento iniciado' });
  } catch (error) {
    console.error('[Tasks] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
