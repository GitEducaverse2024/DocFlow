import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { rag } from '@/lib/services/rag';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    const body = await request.json();
    const { collectionName, model, chunkSize, chunkOverlap } = body;

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as { current_version: number, status: string };
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.status !== 'processed' && project.status !== 'rag_indexed') {
      return NextResponse.json({ error: 'Project must be processed first' }, { status: 400 });
    }

    // In a real app, we might want to do this asynchronously and return a job ID
    // For simplicity, we'll do it synchronously here, but it might timeout for large docs
    
    await rag.indexProject(projectId, project.current_version, {
      collectionName,
      model,
      chunkSize,
      chunkOverlap
    });

    // Update project
    db.prepare('UPDATE projects SET rag_enabled = 1, rag_collection = ?, status = "rag_indexed", updated_at = datetime("now") WHERE id = ?')
      .run(collectionName, projectId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error creating RAG collection:', error);
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
