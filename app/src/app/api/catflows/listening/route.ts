import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const tasks = db.prepare(
      'SELECT id, name, description, status FROM tasks WHERE listen_mode = 1'
    ).all();
    return NextResponse.json(tasks);
  } catch (error) {
    console.error('Error fetching listening catflows:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
