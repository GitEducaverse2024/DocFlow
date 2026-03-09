import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { qdrant } from '@/lib/services/qdrant';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as { rag_enabled: number, rag_collection: string };
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.rag_enabled || !project.rag_collection) {
      return NextResponse.json({ enabled: false });
    }

    try {
      const collectionInfo = await qdrant.getCollectionInfo(project.rag_collection);
      
      if (!collectionInfo) {
        // Collection doesn't exist in Qdrant but DB says it's enabled
        return NextResponse.json({ 
          enabled: true, 
          collectionName: project.rag_collection,
          error: 'Collection not found in Qdrant' 
        });
      }

      const vectorSize = collectionInfo.result?.config?.params?.vectors?.size || 1536;
      const model = vectorSize === 3072 ? 'text-embedding-3-large' : 'text-embedding-3-small';

      return NextResponse.json({
        enabled: true,
        collectionName: project.rag_collection,
        vectorCount: collectionInfo.result?.points_count || 0,
        model,
        status: collectionInfo.result?.status
      });
    } catch (e: unknown) {
      return NextResponse.json({ 
        enabled: true, 
        collectionName: project.rag_collection,
        error: (e as Error).message 
      });
    }
  } catch (error: unknown) {
    console.error('Error fetching RAG info:', error);
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
