import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;
    
    // Get the most recent run
    const run = db.prepare('SELECT * FROM processing_runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 1').get(projectId) as { id: string, status: string, started_at: string, error_log: string };
    
    if (!run) {
      return NextResponse.json({ status: 'none' });
    }

    // Check for timeout (15 minutes)
    if ((run.status === 'queued' || run.status === 'running') && run.started_at) {
      const startedAt = new Date(run.started_at).getTime();
      const now = new Date().getTime();
      const diffMinutes = (now - startedAt) / (1000 * 60);
      
      if (diffMinutes > 15) {
        // Mark as failed due to timeout
        db.prepare(`UPDATE processing_runs SET status = 'failed', error_log = ?, completed_at = ? WHERE id = ?`)
          .run('El procesamiento ha excedido el tiempo máximo (15 minutos).', new Date().toISOString(), run.id);

        db.prepare(`UPDATE catbrains SET status = 'sources_added' WHERE id = ?`).run(projectId);
        
        run.status = 'failed';
        run.error_log = 'El procesamiento ha excedido el tiempo máximo (15 minutos).';
      }
    }

    return NextResponse.json(run);
  } catch (error) {
    logger.error('processing', 'Error obteniendo estado del proceso', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
