import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const { order } = body; // Array of source IDs

    if (!Array.isArray(order)) {
      return NextResponse.json({ error: 'Invalid order format' }, { status: 400 });
    }

    const stmt = db.prepare('UPDATE sources SET order_index = ? WHERE id = ? AND project_id = ?');
    
    const transaction = db.transaction((items: string[]) => {
      for (let i = 0; i < items.length; i++) {
        stmt.run(i, items[i], params.id);
      }
    });

    transaction(order);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('system', 'Error reordenando fuentes', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
