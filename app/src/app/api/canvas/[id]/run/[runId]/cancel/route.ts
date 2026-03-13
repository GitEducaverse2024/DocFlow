import { NextRequest, NextResponse } from 'next/server';
import { cancelExecution } from '@/lib/services/canvas-executor';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string; runId: string };
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { runId } = params;

  try {
    cancelExecution(runId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('canvas', 'Error cancelando ejecucion', { runId, error: (err as Error).message });
    return NextResponse.json({ error: 'Error al cancelar ejecución' }, { status: 500 });
  }
}
