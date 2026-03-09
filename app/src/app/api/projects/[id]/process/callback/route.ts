import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
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
      SET status = ?, error_log = ?, tokens_used = ?, duration_seconds = ?, completed_at = datetime("now")
      WHERE id = ?
    `).run(
      status, 
      error_log || null, 
      tokens_used || null, 
      duration_seconds || null, 
      run_id
    );

    // Update project status
    if (status === 'completed') {
      db.prepare('UPDATE projects SET status = "processed", updated_at = datetime("now") WHERE id = ?').run(projectId);
    } else if (status === 'failed') {
      db.prepare('UPDATE projects SET status = "sources_added", updated_at = datetime("now") WHERE id = ?').run(projectId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in process callback:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
