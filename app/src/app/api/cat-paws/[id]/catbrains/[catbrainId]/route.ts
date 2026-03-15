import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; catbrainId: string }> }) {
  try {
    const { id, catbrainId } = await params;

    const paw = db.prepare('SELECT id FROM cat_paws WHERE id = ?').get(id);
    if (!paw) {
      return NextResponse.json({ error: 'CatPaw not found' }, { status: 404 });
    }

    const result = db.prepare(
      'DELETE FROM cat_paw_catbrains WHERE paw_id = ? AND catbrain_id = ?'
    ).run(id, catbrainId);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Vinculo no encontrado' }, { status: 404 });
    }

    logger.info('cat-paws', 'CatBrain desvinculado', { pawId: id, catbrainId });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('cat-paws', 'Error desvinculando catbrain', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
