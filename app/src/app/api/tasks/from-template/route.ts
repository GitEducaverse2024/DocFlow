import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface StepConfig {
  type: string;
  name: string;
  instructions?: string;
  context_mode?: string;
  use_project_rag?: number;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { template_id, name, description, expected_output, linked_projects } = body;

    if (!template_id) {
      return NextResponse.json({ error: 'El template_id es obligatorio' }, { status: 400 });
    }

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const template = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(template_id) as Record<string, unknown> | undefined;
    if (!template) {
      return NextResponse.json({ error: 'Template no encontrado' }, { status: 404 });
    }

    const taskId = uuidv4();

    // Crear la tarea
    db.prepare(
      'INSERT INTO tasks (id, name, description, expected_output, linked_projects) VALUES (?, ?, ?, ?, ?)'
    ).run(
      taskId,
      name.trim(),
      description || null,
      expected_output || null,
      linked_projects || null
    );

    // Parsear steps_config y crear pasos
    let stepsConfig: StepConfig[] = [];
    if (template.steps_config) {
      try {
        stepsConfig = JSON.parse(template.steps_config as string) as StepConfig[];
      } catch {
        logger.error('tasks', 'Error al parsear steps_config del template', { templateId: template_id });
      }
    }

    for (let i = 0; i < stepsConfig.length; i++) {
      const stepConfig = stepsConfig[i];
      const stepId = uuidv4();

      db.prepare(
        `INSERT INTO task_steps (id, task_id, order_index, type, name, instructions, context_mode, use_project_rag)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        stepId,
        taskId,
        i,
        stepConfig.type || 'agent',
        stepConfig.name || null,
        stepConfig.instructions || null,
        stepConfig.context_mode || 'previous',
        stepConfig.use_project_rag ? 1 : 0
      );
    }

    // Incrementar times_used del template
    db.prepare('UPDATE task_templates SET times_used = times_used + 1 WHERE id = ?').run(template_id);

    // Retornar tarea completa con pasos
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    const steps = db.prepare('SELECT * FROM task_steps WHERE task_id = ? ORDER BY order_index ASC').all(taskId);

    return NextResponse.json({ ...task as Record<string, unknown>, steps }, { status: 201 });
  } catch (error) {
    logger.error('tasks', 'Error al crear tarea desde template', { error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
