import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rows = db.prepare(
      'SELECT id, role, content, created_at FROM cat_paw_chat_history WHERE cat_paw_id = ? ORDER BY created_at ASC'
    ).all(id) as Array<{ id: string; role: string; content: string; created_at: string }>;

    return NextResponse.json({ messages: rows });
  } catch (error) {
    logger.error('cat-paws', 'Error loading chat history', { error: (error as Error).message });
    return NextResponse.json({ error: 'Error loading history' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = db.prepare('DELETE FROM cat_paw_chat_history WHERE cat_paw_id = ?').run(id);

    return NextResponse.json({ success: true, deleted: result.changes });
  } catch (error) {
    logger.error('cat-paws', 'Error clearing chat history', { error: (error as Error).message });
    return NextResponse.json({ error: 'Error clearing history' }, { status: 500 });
  }
}
