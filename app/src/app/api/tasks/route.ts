import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = 'SELECT * FROM tasks';
    const params: string[] = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY updated_at DESC';

    const tasks = db.prepare(query).all(...params) as Record<string, unknown>[];

    const enriched = tasks.map((task) => {
      const stepsCount = (db.prepare('SELECT COUNT(*) as c FROM task_steps WHERE task_id = ?').get(task.id) as { c: number }).c;
      const stepsCompleted = (db.prepare("SELECT COUNT(*) as c FROM task_steps WHERE task_id = ? AND status = 'completed'").get(task.id) as { c: number }).c;
      const agents = (db.prepare('SELECT DISTINCT agent_name FROM task_steps WHERE task_id = ? AND agent_name IS NOT NULL').all(task.id) as { agent_name: string }[]).map(r => r.agent_name);

      let project_names: string[] = [];
      if (task.linked_projects) {
        try {
          const projectIds = JSON.parse(task.linked_projects as string) as string[];
          if (projectIds.length > 0) {
            const placeholders = projectIds.map(() => '?').join(',');
            project_names = (db.prepare(`SELECT name FROM catbrains WHERE id IN (${placeholders})`).all(...projectIds) as { name: string }[]).map(r => r.name);
          }
        } catch {
          // linked_projects no es JSON valido
        }
      }

      return {
        ...task,
        steps_count: stepsCount,
        steps_completed: stepsCompleted,
        agents,
        project_names,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    logger.error('tasks', 'Error al listar tareas', { error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, expected_output, execution_mode, execution_count, schedule_config } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const id = uuidv4();
    const mode = execution_mode || 'single';
    const count = execution_count ?? 1;
    const scheduleConfigStr = schedule_config
      ? (typeof schedule_config === 'object' ? JSON.stringify(schedule_config) : schedule_config)
      : null;

    db.prepare(
      'INSERT INTO tasks (id, name, description, expected_output, execution_mode, execution_count, schedule_config) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, name.trim(), description || null, expected_output || null, mode, count, scheduleConfigStr);

    // Create task_schedules row when execution_mode is 'scheduled'
    if (mode === 'scheduled' && scheduleConfigStr) {
      const parsed = typeof schedule_config === 'string' ? JSON.parse(schedule_config) : schedule_config;
      const scheduleId = uuidv4();
      const isActive = parsed.is_active ? 1 : 0;
      db.prepare(
        'INSERT INTO task_schedules (id, task_id, is_active) VALUES (?, ?, ?)'
      ).run(scheduleId, id, isActive);
    }

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    logger.error('tasks', 'Error al crear tarea', { error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
