import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const original = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id) as Record<string, unknown> | undefined;
    if (!original) {
      return NextResponse.json({ error: 'CatFlow no encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const { name } = body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const newId = uuidv4();

    // Copy task with reset fields
    db.prepare(`
      INSERT INTO tasks (id, name, description, expected_output, status, linked_projects,
        execution_mode, execution_count, schedule_config, listen_mode)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
    `).run(
      newId, name.trim(), original.description, original.expected_output,
      original.linked_projects, original.execution_mode, original.execution_count,
      original.schedule_config, original.listen_mode
    );

    // Copy steps
    const steps = db.prepare('SELECT * FROM task_steps WHERE task_id = ? ORDER BY order_index ASC')
      .all(params.id) as Record<string, unknown>[];

    const insertStep = db.prepare(`
      INSERT INTO task_steps (id, task_id, order_index, type, name, agent_id, agent_name,
        agent_model, instructions, context_mode, context_manual, rag_query, use_project_rag,
        skill_ids, connector_config, canvas_id, fork_group, branch_index, branch_label)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const step of steps) {
      insertStep.run(
        uuidv4(), newId, step.order_index, step.type, step.name,
        step.agent_id, step.agent_name, step.agent_model, step.instructions,
        step.context_mode, step.context_manual, step.rag_query, step.use_project_rag,
        step.skill_ids, step.connector_config, step.canvas_id,
        step.fork_group, step.branch_index, step.branch_label
      );
    }

    const newTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(newId);
    logger.info('tasks', 'CatFlow forkeado', { originalId: params.id, newId });
    return NextResponse.json(newTask, { status: 201 });
  } catch (error) {
    logger.error('tasks', 'Error al forkear CatFlow', { taskId: params.id, error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
