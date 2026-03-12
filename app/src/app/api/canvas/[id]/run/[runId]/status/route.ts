import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string; runId: string };
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id, runId } = params;

  try {
    const run = db.prepare(`
      SELECT id, canvas_id, status, node_states, current_node_id, execution_order,
             total_tokens, total_duration, started_at, completed_at
      FROM canvas_runs
      WHERE id = ? AND canvas_id = ?
    `).get(runId, id) as {
      id: string;
      canvas_id: string;
      status: string;
      node_states: string | null;
      current_node_id: string | null;
      execution_order: string | null;
      total_tokens: number;
      total_duration: number;
      started_at: string | null;
      completed_at: string | null;
    } | undefined;

    if (!run) {
      return NextResponse.json({ error: 'Run no encontrado' }, { status: 404 });
    }

    // Parse JSON columns
    const nodeStates = run.node_states ? JSON.parse(run.node_states) : {};
    const executionOrder: string[] = run.execution_order ? JSON.parse(run.execution_order) : [];

    // Calculate elapsed seconds
    let elapsed_seconds = 0;
    if (run.started_at) {
      const startMs = new Date(run.started_at).getTime();
      const endMs = run.completed_at ? new Date(run.completed_at).getTime() : Date.now();
      elapsed_seconds = Math.round((endMs - startMs) / 1000);
    }

    // Count completed steps (completed or skipped)
    const totalSteps = executionOrder.length;
    const completedSteps = executionOrder.filter(
      nodeId => nodeStates[nodeId]?.status === 'completed' || nodeStates[nodeId]?.status === 'skipped'
    ).length;

    return NextResponse.json({
      status: run.status,
      node_states: nodeStates,
      current_node_id: run.current_node_id,
      execution_order: executionOrder,
      total_steps: totalSteps,
      completed_steps: completedSteps,
      elapsed_seconds,
      total_tokens: run.total_tokens,
      total_duration: run.total_duration,
      completed_at: run.completed_at,
    });
  } catch (err) {
    console.error('[GET /api/canvas/[id]/run/[runId]/status]', err);
    return NextResponse.json({ error: 'Error al obtener estado' }, { status: 500 });
  }
}
