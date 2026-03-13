import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const templates = db.prepare('SELECT * FROM task_templates ORDER BY times_used DESC, name ASC').all();

    return NextResponse.json(templates);
  } catch (error) {
    logger.error('tasks', 'Error al listar templates', { error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
