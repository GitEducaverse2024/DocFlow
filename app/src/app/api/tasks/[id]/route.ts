import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id);
    if (!task) {
      return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });
    }

    const steps = db.prepare('SELECT * FROM task_steps WHERE task_id = ? ORDER BY order_index ASC').all(params.id);

    return NextResponse.json({ ...task as Record<string, unknown>, steps });
  } catch (error) {
    console.error('[Tasks] Error al obtener tarea:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });
    }

    const body = await request.json();
    const allowedFields = ['name', 'description', 'expected_output', 'linked_projects', 'status'];
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

    updates.push("updated_at = datetime('now')");
    values.push(params.id);

    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Tasks] Error al actualizar tarea:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(params.id);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Tasks] Error al eliminar tarea:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
