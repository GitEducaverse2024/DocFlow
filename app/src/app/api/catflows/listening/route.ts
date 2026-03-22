import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const canvases = db.prepare(
      'SELECT id, name, description, status FROM canvases WHERE listen_mode = 1 AND is_template = 0'
    ).all();
    return NextResponse.json(canvases);
  } catch (error) {
    console.error('Error fetching listening catflows:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
