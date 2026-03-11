import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(params.id);
    if (!task) {
      return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });
    }

    const steps = db.prepare('SELECT * FROM task_steps WHERE task_id = ? ORDER BY order_index ASC').all(params.id);

    return NextResponse.json(steps);
  } catch (error) {
    console.error('[Tasks] Error al listar pasos:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(params.id);
    if (!task) {
      return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });
    }

    const count = (db.prepare('SELECT COUNT(*) as c FROM task_steps WHERE task_id = ?').get(params.id) as { c: number }).c;
    if (count >= 10) {
      return NextResponse.json({ error: 'Maximo 10 pasos por tarea' }, { status: 400 });
    }

    const body = await request.json();
    const { type, name, agent_id, agent_name, agent_model, instructions, context_mode, context_manual, rag_query, use_project_rag, skill_ids } = body;

    if (!type || typeof type !== 'string') {
      return NextResponse.json({ error: 'El tipo de paso es obligatorio' }, { status: 400 });
    }

    let orderIndex = body.order_index;
    if (orderIndex === undefined || orderIndex === null) {
      orderIndex = count;
    } else {
      // Desplazar pasos existentes para hacer espacio
      db.prepare('UPDATE task_steps SET order_index = order_index + 1 WHERE task_id = ? AND order_index >= ?').run(params.id, orderIndex);
    }

    const id = uuidv4();

    db.prepare(
      `INSERT INTO task_steps (id, task_id, order_index, type, name, agent_id, agent_name, agent_model, instructions, context_mode, context_manual, rag_query, use_project_rag, skill_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, params.id, orderIndex, type,
      name || null, agent_id || null, agent_name || null, agent_model || null,
      instructions || null, context_mode || 'previous', context_manual || null,
      rag_query || null, use_project_rag ? 1 : 0, skill_ids || null
    );

    // Actualizar updated_at de la tarea padre
    db.prepare("UPDATE tasks SET updated_at = datetime('now') WHERE id = ?").run(params.id);

    const step = db.prepare('SELECT * FROM task_steps WHERE id = ?').get(id);

    return NextResponse.json(step, { status: 201 });
  } catch (error) {
    console.error('[Tasks] Error al crear paso:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
