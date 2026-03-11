import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const task = db.prepare('SELECT id, status, started_at, total_tokens, total_duration FROM tasks WHERE id = ?').get(params.id) as { id: string; status: string; started_at: string | null; total_tokens: number; total_duration: number } | undefined;
    if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });

    const steps = db.prepare('SELECT id, order_index, type, name, agent_name, status, tokens_used, duration_seconds, SUBSTR(output, 1, 500) as output_preview FROM task_steps WHERE task_id = ? ORDER BY order_index ASC').all(params.id) as { id: string; order_index: number; type: string; name: string | null; agent_name: string | null; status: string; tokens_used: number; duration_seconds: number; output_preview: string | null }[];

    // Find current step index
    const runningStep = steps.find(s => s.status === 'running');
    const currentStepIndex = runningStep ? runningStep.order_index : -1;

    // Calculate elapsed time
    const elapsedTime = task.started_at ? Math.round((Date.now() - new Date(task.started_at).getTime()) / 1000) : 0;

    return NextResponse.json({
      status: task.status,
      current_step_index: currentStepIndex,
      elapsed_time: elapsedTime,
      total_tokens: task.total_tokens,
      total_duration: task.total_duration,
      steps,
    });
  } catch (error) {
    console.error('[Tasks] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
