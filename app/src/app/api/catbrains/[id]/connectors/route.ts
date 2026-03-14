import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { generateId } from '@/lib/utils';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const VALID_TYPES = ['n8n_webhook', 'http_api', 'mcp_server', 'email'];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const catbrain = db.prepare('SELECT id FROM catbrains WHERE id = ?').get(id);
    if (!catbrain) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    const connectors = db.prepare(
      'SELECT * FROM catbrain_connectors WHERE catbrain_id = ? ORDER BY created_at DESC'
    ).all(id);

    return NextResponse.json(connectors);
  } catch (error) {
    logger.error('connectors', 'Error listing catbrain connectors', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const catbrain = db.prepare('SELECT id FROM catbrains WHERE id = ?').get(id);
    if (!catbrain) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, type, config, description, is_active } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'Name and type are required' }, { status: 400 });
    }

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const connId = generateId();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO catbrain_connectors (id, catbrain_id, name, type, config, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      connId,
      id,
      name,
      type,
      config ? JSON.stringify(config) : null,
      description || null,
      is_active !== undefined ? is_active : 1,
      now,
      now
    );

    const connector = db.prepare('SELECT * FROM catbrain_connectors WHERE id = ?').get(connId);
    logger.info('connectors', 'CatBrain connector created', { catbrainId: id, connectorId: connId, type });

    return NextResponse.json(connector, { status: 201 });
  } catch (error) {
    logger.error('connectors', 'Error creating catbrain connector', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
