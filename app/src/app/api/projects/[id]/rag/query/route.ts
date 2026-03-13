import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { qdrant } from '@/lib/services/qdrant';
import { ollama } from '@/lib/services/ollama';
import { logger } from '@/lib/logger';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    const body = await request.json();
    const { query, limit = 5 } = body;

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as { rag_enabled: number, rag_collection: string };
    if (!project || !project.rag_enabled || !project.rag_collection) {
      return NextResponse.json({ error: 'RAG is not enabled for this project' }, { status: 400 });
    }

    const collectionInfo = await qdrant.getCollectionInfo(project.rag_collection);
    if (!collectionInfo) {
      return NextResponse.json({ error: 'Collection not found in Qdrant' }, { status: 404 });
    }

    const vectorSize = collectionInfo.result?.config?.params?.vectors?.size || 768;
    const model = ollama.guessModelFromVectorSize(vectorSize);

    const queryVector = await ollama.getEmbedding(query, model);
    const searchResults = await qdrant.search(project.rag_collection, queryVector, limit);

    return NextResponse.json({ results: searchResults.result });
  } catch (error: unknown) {
    logger.error('rag', 'Error en consulta RAG', { error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
