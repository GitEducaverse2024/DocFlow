import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();
    const { run_id, status, error_log, tokens_used, duration_seconds } = body;

    if (!run_id || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const run = db.prepare('SELECT * FROM processing_runs WHERE id = ? AND project_id = ?').get(run_id, projectId);
    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    // Update run
    db.prepare(`
      UPDATE processing_runs
      SET status = ?, error_log = ?, tokens_used = ?, duration_seconds = ?, completed_at = ?
      WHERE id = ?
    `).run(
      status,
      error_log || null,
      tokens_used || null,
      duration_seconds || null,
      new Date().toISOString(),
      run_id
    );

    // Update project status
    if (status === 'completed') {
      db.prepare(`UPDATE catbrains SET status = 'processed', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), projectId);
    } else if (status === 'failed') {
      db.prepare(`UPDATE catbrains SET status = 'sources_added', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), projectId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('processing', 'Error en callback de procesamiento', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
