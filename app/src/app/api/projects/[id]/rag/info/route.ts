import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { qdrant } from '@/lib/services/qdrant';
import { logger } from '@/lib/logger';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as {
      rag_enabled: number;
      rag_collection: string;
      current_version: number;
      rag_indexed_version: number | null;
      rag_indexed_at: string | null;
      rag_model: string | null;
    };

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.rag_enabled || !project.rag_collection) {
      return NextResponse.json({ enabled: false });
    }

    try {
      const collectionInfo = await qdrant.getCollectionInfo(project.rag_collection);

      if (!collectionInfo) {
        return NextResponse.json({
          enabled: true,
          collectionName: project.rag_collection,
          error: 'Collection not found in Qdrant'
        });
      }

      const result = collectionInfo.result;
      const vectorSize = result?.config?.params?.vectors?.size || 0;
      const pointsCount = result?.points_count || 0;
      const vectorsCount = result?.vectors_count || pointsCount;

      // Determine model from DB or vector size
      let embeddingModel = project.rag_model || 'unknown';
      if (embeddingModel === 'unknown') {
        if (vectorSize === 768) embeddingModel = 'nomic-embed-text';
        else if (vectorSize === 1024) embeddingModel = 'mxbai-embed-large';
        else if (vectorSize === 384) embeddingModel = 'all-minilm';
        else if (vectorSize === 3072) embeddingModel = 'text-embedding-3-large';
        else if (vectorSize === 1536) embeddingModel = 'text-embedding-3-small';
      }

      // Check if there's a newer version not indexed
      const indexedVersion = project.rag_indexed_version;
      const currentVersion = project.current_version;
      const isOutdated = indexedVersion !== null && currentVersion > indexedVersion;

      return NextResponse.json({
        enabled: true,
        collectionName: project.rag_collection,
        vectorCount: vectorsCount,
        pointsCount,
        vectorDimensions: vectorSize,
        embeddingModel,
        status: result?.status,
        indexedVersion,
        indexedAt: project.rag_indexed_at,
        currentVersion,
        isOutdated,
      });
    } catch (e: unknown) {
      return NextResponse.json({
        enabled: true,
        collectionName: project.rag_collection,
        error: (e as Error).message
      });
    }
  } catch (error: unknown) {
    logger.error('rag', 'Error obteniendo info RAG', { error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
