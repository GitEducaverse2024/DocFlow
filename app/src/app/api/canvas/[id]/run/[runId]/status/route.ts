import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string; runId: string };
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id, runId } = params;

  try {
    const run = db.prepare(`
      SELECT id, canvas_id, status, node_states, current_node_id, execution_order,
             total_tokens, total_duration, started_at, completed_at, metadata
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
      metadata: string | null;
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

    // Check for scheduler listen mode timeouts (SCHED-07)
    if (run.status === 'waiting') {
      const meta = run.metadata ? JSON.parse(run.metadata) : {};

      if (meta.scheduler_waiting) {
        const now = Date.now();
        for (const [waitingNodeId, waitInfo] of Object.entries(meta.scheduler_waiting) as [string, { waiting_since: string; listen_timeout: number }][]) {
          const waitingSince = new Date(waitInfo.waiting_since).getTime();
          const timeoutMs = waitInfo.listen_timeout * 1000;
          if (timeoutMs > 0 && (now - waitingSince) >= timeoutMs) {
            // DB-level CAS: atomically flip status from 'waiting' to 'running'
            // Prevents race condition if multiple concurrent polls detect the same timeout
            const casResult = db.prepare(
              "UPDATE canvas_runs SET status = 'running' WHERE id = ? AND status = 'waiting'"
            ).run(runId);

            if (casResult.changes === 0) {
              // Another request already handled this timeout — just return current state
              break;
            }

            // We won the CAS — proceed with auto-resolution
            const { resumeAfterSignal } = await import('@/lib/services/canvas-executor');
            await resumeAfterSignal(runId, waitingNodeId, false);
            logger.info('canvas', 'Scheduler timeout auto-resuelto', { canvasId: id, runId, nodeId: waitingNodeId });

            // Re-fetch status after auto-resolution
            const updatedRun = db.prepare('SELECT status, node_states FROM canvas_runs WHERE id = ?').get(runId) as { status: string; node_states: string };
            const updatedNodeStates = JSON.parse(updatedRun.node_states);
            return NextResponse.json({
              status: updatedRun.status,
              node_states: updatedNodeStates,
              current_node_id: run.current_node_id,
              execution_order: executionOrder,
              total_steps: totalSteps,
              completed_steps: executionOrder.filter(
                (nid: string) => updatedNodeStates[nid]?.status === 'completed' || updatedNodeStates[nid]?.status === 'skipped'
              ).length,
              elapsed_seconds,
              total_tokens: run.total_tokens,
              total_duration: run.total_duration,
              completed_at: run.completed_at,
            });
          }
        }
      }
    }

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
    logger.error('canvas', 'Error obteniendo estado de run', { canvasId: id, runId, error: (err as Error).message });
    return NextResponse.json({ error: 'Error al obtener estado' }, { status: 500 });
  }
}
