import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { resumeAfterCheckpoint } from '@/lib/services/canvas-executor';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string; runId: string; nodeId: string };
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id, runId, nodeId } = params;

  try {
    // Parse optional feedback from body
    let feedback = '';
    try {
      const body = await req.json();
      feedback = (body?.feedback as string) || '';
    } catch {
      // Body is optional
    }

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

    logger.info('canvas', 'Checkpoint rechazado', { canvasId: id, runId, nodeId });

    // Resume execution with rejection and feedback
    await resumeAfterCheckpoint(runId, nodeId, false, feedback);

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('canvas', 'Error rechazando checkpoint', { canvasId: id, runId, nodeId, error: (err as Error).message });
    return NextResponse.json({ error: 'Error al rechazar checkpoint' }, { status: 500 });
  }
}
