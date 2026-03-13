import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { resumeAfterCheckpoint } from '@/lib/services/canvas-executor';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string; runId: string; nodeId: string };
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id, runId, nodeId } = params;

  try {
    // Validate run exists and belongs to this canvas
    const run = db.prepare("SELECT id, status FROM canvas_runs WHERE id = ? AND canvas_id = ?").get(runId, id) as
      | { id: string; status: string }
      | undefined;

    if (!run) {
      return NextResponse.json({ error: 'Run no encontrado' }, { status: 404 });
    }

    if (run.status !== 'waiting') {
      return NextResponse.json({ error: `El run no está en espera (estado actual: ${run.status})` }, { status: 400 });
    }

    logger.info('canvas', 'Checkpoint aprobado', { canvasId: id, runId, nodeId });

    // Resume execution with approval
    await resumeAfterCheckpoint(runId, nodeId, true);

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('canvas', 'Error aprobando checkpoint', { canvasId: id, runId, nodeId, error: (err as Error).message });
    return NextResponse.json({ error: 'Error al aprobar checkpoint' }, { status: 500 });
  }
}
