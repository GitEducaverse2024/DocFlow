import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const connector = db.prepare('SELECT id FROM connectors WHERE id = ?').get(params.id);
    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    const logs = db.prepare(
      'SELECT * FROM connector_logs WHERE connector_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(params.id);

    return NextResponse.json(logs);
  } catch (error) {
    console.error('Error fetching connector logs:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
