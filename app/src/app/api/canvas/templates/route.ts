import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const templates = db.prepare(
      'SELECT * FROM canvas_templates ORDER BY times_used DESC, name ASC'
    ).all();

    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching canvas templates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
