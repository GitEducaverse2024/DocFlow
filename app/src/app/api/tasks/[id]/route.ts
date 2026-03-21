import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';

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
    logger.error('tasks', 'Error al obtener tarea', { taskId: params.id, error: (error as Error).message });
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

    // Serialize schedule_config if provided as object
    if (body.schedule_config && typeof body.schedule_config === 'object') {
      body.schedule_config = JSON.stringify(body.schedule_config);
    }

    const allowedFields = ['name', 'description', 'expected_output', 'linked_projects', 'status', 'execution_mode', 'execution_count', 'schedule_config'];
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

    // Upsert/delete task_schedules based on execution_mode changes
    if (body.execution_mode) {
      if (body.execution_mode === 'scheduled') {
        const existingSchedule = db.prepare('SELECT id FROM task_schedules WHERE task_id = ?').get(params.id) as { id: string } | undefined;
        const schedConfig = body.schedule_config
          ? (typeof body.schedule_config === 'string' ? JSON.parse(body.schedule_config) : body.schedule_config)
          : null;
        const isActive = schedConfig?.is_active ? 1 : 0;
        if (existingSchedule) {
          db.prepare("UPDATE task_schedules SET is_active = ?, updated_at = datetime('now') WHERE task_id = ?").run(isActive, params.id);
        } else {
          db.prepare('INSERT INTO task_schedules (id, task_id, is_active) VALUES (?, ?, ?)').run(uuidv4(), params.id, isActive);
        }
      } else {
        db.prepare('DELETE FROM task_schedules WHERE task_id = ?').run(params.id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('tasks', 'Error al actualizar tarea', { taskId: params.id, error: (error as Error).message });
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
    logger.error('tasks', 'Error al eliminar tarea', { taskId: params.id, error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
