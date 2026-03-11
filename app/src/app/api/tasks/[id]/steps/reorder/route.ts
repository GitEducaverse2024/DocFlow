import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(params.id);
    if (!task) {
      return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });
    }

    const body = await request.json();
    const { order } = body;

    if (!Array.isArray(order)) {
      return NextResponse.json({ error: 'El campo order debe ser un array de IDs' }, { status: 400 });
    }

    const reorder = db.transaction((taskId: string, stepOrder: string[]) => {
      for (let i = 0; i < stepOrder.length; i++) {
        db.prepare('UPDATE task_steps SET order_index = ? WHERE id = ? AND task_id = ?').run(i, stepOrder[i], taskId);
      }
      db.prepare("UPDATE tasks SET updated_at = datetime('now') WHERE id = ?").run(taskId);
    });

    reorder(params.id, order);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Tasks] Error al reordenar pasos:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
