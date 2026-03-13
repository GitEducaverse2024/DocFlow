import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const templates = db.prepare(
      'SELECT * FROM canvas_templates ORDER BY times_used DESC, name ASC'
    ).all();

    return NextResponse.json(templates);
  } catch (error) {
    logger.error('canvas', 'Error al listar templates de canvas', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
