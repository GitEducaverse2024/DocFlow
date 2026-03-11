import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: { id: string; stepId: string } }) {
  try {
    const step = db.prepare('SELECT * FROM task_steps WHERE id = ? AND task_id = ?').get(params.stepId, params.id);
    if (!step) {
      return NextResponse.json({ error: 'Paso no encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const allowedFields = ['name', 'agent_id', 'agent_name', 'agent_model', 'instructions', 'context_mode', 'context_manual', 'rag_query', 'use_project_rag', 'skill_ids'];
    const updates: string[] = [];
    const values: unknown[] = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No se proporcionaron campos para actualizar' }, { status: 400 });
    }

    values.push(params.stepId);
    db.prepare(`UPDATE task_steps SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Actualizar updated_at de la tarea padre
    db.prepare("UPDATE tasks SET updated_at = datetime('now') WHERE id = ?").run(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Tasks] Error al actualizar paso:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string; stepId: string } }) {
  try {
    const step = db.prepare('SELECT order_index FROM task_steps WHERE id = ? AND task_id = ?').get(params.stepId, params.id) as { order_index: number } | undefined;
    if (!step) {
      return NextResponse.json({ error: 'Paso no encontrado' }, { status: 404 });
    }

    // Eliminar el paso
    db.prepare('DELETE FROM task_steps WHERE id = ? AND task_id = ?').run(params.stepId, params.id);

    // Reordenar los restantes
    db.prepare('UPDATE task_steps SET order_index = order_index - 1 WHERE task_id = ? AND order_index > ?').run(params.id, step.order_index);

    // Actualizar updated_at de la tarea padre
    db.prepare("UPDATE tasks SET updated_at = datetime('now') WHERE id = ?").run(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Tasks] Error al eliminar paso:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
