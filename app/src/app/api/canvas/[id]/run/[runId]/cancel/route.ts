import { NextRequest, NextResponse } from 'next/server';
import { cancelExecution } from '@/lib/services/canvas-executor';

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
    console.error('[POST /api/canvas/[id]/run/[runId]/cancel]', err);
    return NextResponse.json({ error: 'Error al cancelar ejecución' }, { status: 500 });
  }
}
