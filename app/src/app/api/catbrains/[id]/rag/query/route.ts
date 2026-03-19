import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { qdrant } from '@/lib/services/qdrant';
import { ollama } from '@/lib/services/ollama';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const MIN_SCORE = 0.3; // Lower threshold for test queries — user wants to see more results

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: catbrainId } = await params;
    const body = await request.json();
    const { query, limit = 10, minScore } = body;

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const catbrain = db.prepare('SELECT rag_enabled, rag_collection, rag_model FROM catbrains WHERE id = ?').get(catbrainId) as {
      rag_enabled: number;
      rag_collection: string;
      rag_model: string | null;
    };
    if (!catbrain || !catbrain.rag_enabled || !catbrain.rag_collection) {
      return NextResponse.json({ error: 'RAG is not enabled for this CatBrain' }, { status: 400 });
    }

    // Use stored model (exact) — fallback to guessing only if not stored
    let embModel = catbrain.rag_model;
    if (!embModel) {
      const collectionInfo = await qdrant.getCollectionInfo(catbrain.rag_collection);
      const vectorSize = collectionInfo?.result?.config?.params?.vectors?.size || 768;
      embModel = ollama.guessModelFromVectorSize(vectorSize);
    }

    const queryVector = await ollama.getEmbedding(query, embModel);
    const searchResults = await qdrant.search(catbrain.rag_collection, queryVector, Math.min(limit, 50));
    const allResults = searchResults.result || [];

    // Apply score threshold
    const threshold = typeof minScore === 'number' ? minScore : MIN_SCORE;
    const filtered = allResults.filter((r: { score: number }) => r.score >= threshold);

    return NextResponse.json({
      results: filtered,
      total_found: allResults.length,
      above_threshold: filtered.length,
      threshold,
      model: embModel,
    });
  } catch (error: unknown) {
    logger.error('rag', 'Error en consulta RAG', { error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
