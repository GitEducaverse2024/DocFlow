import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { qdrant } from '@/lib/services/qdrant';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: catbrainId } = await params;

    const catbrain = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(catbrainId) as { rag_collection: string };
    if (!catbrain) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    if (catbrain.rag_collection) {
      try {
        await qdrant.deleteCollection(catbrain.rag_collection);
      } catch {
        logger.error('rag', 'Error eliminando coleccion de Qdrant', { catbrainId });
        // Continue anyway to update DB
      }
    }

    db.prepare(`UPDATE catbrains SET rag_enabled = 0, rag_collection = NULL, status = 'processed', updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), catbrainId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logger.error('rag', 'Error eliminando coleccion RAG', { error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
