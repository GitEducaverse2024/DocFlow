import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const templates = db.prepare('SELECT * FROM task_templates ORDER BY times_used DESC, name ASC').all();

    return NextResponse.json(templates);
  } catch (error) {
    console.error('[Tasks] Error al listar templates:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
