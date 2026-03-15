import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const paw = db.prepare('SELECT id FROM cat_paws WHERE id = ?').get(id);
    if (!paw) {
      return NextResponse.json({ error: 'CatPaw not found' }, { status: 404 });
    }

    const body = await request.json();
    const { catbrain_id, query_mode, priority } = body;

    if (!catbrain_id) {
      return NextResponse.json({ error: 'catbrain_id is required' }, { status: 400 });
    }

    const catbrain = db.prepare('SELECT id FROM catbrains WHERE id = ?').get(catbrain_id);
    if (!catbrain) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const finalQueryMode = query_mode || 'rag';
    const finalPriority = priority ?? 0;

    try {
      db.prepare(`
        INSERT INTO cat_paw_catbrains (paw_id, catbrain_id, query_mode, priority, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, catbrain_id, finalQueryMode, finalPriority, now);
    } catch (e) {
      if ((e as Error).message.includes('UNIQUE')) {
        return NextResponse.json({ error: 'Ya vinculado' }, { status: 409 });
      }
      throw e;
    }

    const row = {
      paw_id: id,
      catbrain_id,
      query_mode: finalQueryMode,
      priority: finalPriority,
      created_at: now,
    };

    logger.info('cat-paws', 'CatBrain vinculado', { pawId: id, catbrainId: catbrain_id });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    logger.error('cat-paws', 'Error vinculando catbrain', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
