import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { generateId } from '@/lib/utils';
import { executeTaskWithCycles } from '@/lib/services/task-executor';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { source_task_id, source_run_id, source_node_id, target_task_id, payload } = body;

    if (!source_task_id || !target_task_id) {
      return NextResponse.json(
        { error: 'source_task_id and target_task_id are required' },
        { status: 400 }
      );
    }

    // Validate target exists and has listen_mode=1
    const target = db.prepare(
      'SELECT id, listen_mode FROM tasks WHERE id = ?'
    ).get(target_task_id) as { id: string; listen_mode: number } | undefined;

    if (!target) {
      return NextResponse.json({ error: 'Target task not found' }, { status: 404 });
    }

    if (target.listen_mode !== 1) {
      return NextResponse.json(
        { error: 'Target task is not in listen mode' },
        { status: 400 }
      );
    }

    const triggerId = generateId();

    // Serialize payload if it's an object
    const payloadStr = payload != null
      ? (typeof payload === 'string' ? payload : JSON.stringify(payload))
      : null;

    // Insert trigger with status=pending
    db.prepare(
      `INSERT INTO catflow_triggers (id, source_task_id, source_run_id, source_node_id, target_task_id, payload, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`
    ).run(triggerId, source_task_id, source_run_id || null, source_node_id || null, target_task_id, payloadStr);

    // Set external_input on target task
    db.prepare(
      'UPDATE tasks SET external_input = ? WHERE id = ?'
    ).run(payloadStr, target_task_id);

    // Update trigger status to running
    db.prepare(
      "UPDATE catflow_triggers SET status = 'running' WHERE id = ?"
    ).run(triggerId);

    // Fire and forget: execute target task
    executeTaskWithCycles(target_task_id).catch(err => {
      logger.error('tasks', 'Error executing triggered catflow', {
        triggerId,
        targetTaskId: target_task_id,
        error: (err as Error).message,
      });
    });

    return NextResponse.json({ id: triggerId, status: 'running' }, { status: 201 });
  } catch (error) {
    console.error('Error creating catflow trigger:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
