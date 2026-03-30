import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const run = db.prepare(
    "SELECT id, status, started_at FROM canvas_runs WHERE canvas_id = ? AND status IN ('running', 'waiting') ORDER BY created_at DESC LIMIT 1"
  ).get(id) as { id: string; status: string; started_at: string } | undefined;

  if (!run) {
    return NextResponse.json({ run_id: null });
  }

  return NextResponse.json({
    run_id: run.id,
    status: run.status,
    started_at: run.started_at,
  });
}
