import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { resumeAfterSignal } from '@/lib/services/canvas-executor';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string; runId: string };
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id, runId } = params;

  try {
    const body = await req.json();
    const { node_id, signal } = body;

    if (!node_id || typeof node_id !== 'string') {
      return NextResponse.json({ error: 'node_id es obligatorio' }, { status: 400 });
    }

    // Validate run exists and belongs to this canvas
    const run = db.prepare("SELECT id, status, node_states FROM canvas_runs WHERE id = ? AND canvas_id = ?").get(runId, id) as
      | { id: string; status: string; node_states: string }
      | undefined;

    if (!run) {
      return NextResponse.json({ error: 'Run no encontrado' }, { status: 404 });
    }

    if (run.status !== 'waiting') {
      return NextResponse.json(
        { error: `El run no esta en espera (estado actual: ${run.status})` },
        { status: 400 }
      );
    }

    // Validate the specified node is actually in 'waiting' status
    const nodeStates = JSON.parse(run.node_states);
    if (nodeStates[node_id]?.status !== 'waiting') {
      return NextResponse.json(
        { error: `El nodo ${node_id} no esta en espera` },
        { status: 400 }
      );
    }

    // DB-level CAS: atomically flip status from 'waiting' to 'running'
    // This prevents race conditions with concurrent timeout auto-resolution in the status endpoint
    const casResult = db.prepare(
      "UPDATE canvas_runs SET status = 'running' WHERE id = ? AND status = 'waiting'"
    ).run(runId);

    if (casResult.changes === 0) {
      // Another request already resumed this run (timeout or duplicate signal)
      return NextResponse.json(
        { error: 'El run ya fue resumido por otra solicitud' },
        { status: 409 }
      );
    }

    logger.info('canvas', 'Signal recibida para scheduler', {
      canvasId: id, runId, nodeId: node_id, signal: !!signal,
    });

    // Resume execution with signal result
    await resumeAfterSignal(runId, node_id, !!signal);

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('canvas', 'Error procesando signal', {
      canvasId: id, runId, error: (err as Error).message,
    });
    return NextResponse.json({ error: 'Error al procesar signal' }, { status: 500 });
  }
}
