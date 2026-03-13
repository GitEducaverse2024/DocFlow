import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { qdrant } from '@/lib/services/qdrant';
import { logger } from '@/lib/logger';

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as { rag_collection: string };
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.rag_collection) {
      try {
        await qdrant.deleteCollection(project.rag_collection);
      } catch {
        logger.error('rag', 'Error eliminando coleccion de Qdrant', { projectId });
        // Continue anyway to update DB
      }
    }

    db.prepare(`UPDATE projects SET rag_enabled = 0, rag_collection = NULL, status = 'processed', updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), projectId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logger.error('rag', 'Error eliminando coleccion RAG', { error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
