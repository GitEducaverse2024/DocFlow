import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { qdrant } from '@/lib/services/qdrant';
import { litellm } from '@/lib/services/litellm';

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

    // We need to know the model used to generate the embedding for the query
    // In a real app, we'd store this in the DB. For now, we'll assume text-embedding-3-small
    // or try to infer it from the vector size
    
    const collectionInfo = await qdrant.getCollectionInfo(project.rag_collection);
    if (!collectionInfo) {
      return NextResponse.json({ error: 'Collection not found in Qdrant' }, { status: 404 });
    }

    const vectorSize = collectionInfo.result?.config?.params?.vectors?.size || 1536;
    const model = vectorSize === 3072 ? 'text-embedding-3-large' : 'text-embedding-3-small';

    const embeddings = await litellm.getEmbeddings([query], model);
    const queryVector = embeddings[0];

    const searchResults = await qdrant.search(project.rag_collection, queryVector, limit);

    return NextResponse.json({ results: searchResults.result });
  } catch (error: unknown) {
    console.error('Error querying RAG:', error);
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
