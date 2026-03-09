import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { qdrant } from '@/lib/services/qdrant';

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
        console.error('Error deleting collection from Qdrant');
        // Continue anyway to update DB
      }
    }

    db.prepare(`UPDATE projects SET rag_enabled = 0, rag_collection = NULL, status = 'processed', updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), projectId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting RAG collection:', error);
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
