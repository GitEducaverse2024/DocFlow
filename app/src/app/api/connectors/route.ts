import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

const VALID_TYPES = ['n8n_webhook', 'http_api', 'mcp_server', 'email'];

export async function GET() {
  try {
    const connectors = db.prepare('SELECT * FROM connectors ORDER BY updated_at DESC').all();
    return NextResponse.json(connectors);
  } catch (error) {
    console.error('Error fetching connectors:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, type, config, emoji, description } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'Name and type are required' }, { status: 400 });
    }

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }

    const count = (db.prepare('SELECT COUNT(*) as c FROM connectors').get() as { c: number }).c;
    if (count >= 20) {
      return NextResponse.json({ error: 'Maximum of 20 connectors reached' }, { status: 400 });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO connectors (id, name, description, emoji, type, config, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, description || null, emoji || '🔌', type, config ? JSON.stringify(config) : null, now, now);

    const connector = db.prepare('SELECT * FROM connectors WHERE id = ?').get(id);
    return NextResponse.json(connector, { status: 201 });
  } catch (error) {
    console.error('Error creating connector:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
