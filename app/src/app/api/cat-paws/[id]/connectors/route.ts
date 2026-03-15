import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const paw = db.prepare('SELECT id FROM cat_paws WHERE id = ?').get(id);
    if (!paw) {
      return NextResponse.json({ error: 'CatPaw not found' }, { status: 404 });
    }

    const connectors = db.prepare(`
      SELECT cpc.*, cn.name as connector_name, cn.type as connector_type
      FROM cat_paw_connectors cpc
      LEFT JOIN connectors cn ON cn.id = cpc.connector_id
      WHERE cpc.paw_id = ?
    `).all(id);

    return NextResponse.json(connectors);
  } catch (error) {
    logger.error('cat-paws', 'Error listando conectores', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const paw = db.prepare('SELECT id FROM cat_paws WHERE id = ?').get(id);
    if (!paw) {
      return NextResponse.json({ error: 'CatPaw not found' }, { status: 404 });
    }

    const body = await request.json();
    const { connector_id, usage_hint, is_active } = body;

    if (!connector_id) {
      return NextResponse.json({ error: 'connector_id is required' }, { status: 400 });
    }

    const connector = db.prepare('SELECT id FROM connectors WHERE id = ?').get(connector_id);
    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const finalIsActive = is_active ?? 1;

    try {
      db.prepare(`
        INSERT INTO cat_paw_connectors (paw_id, connector_id, usage_hint, is_active, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, connector_id, usage_hint || null, finalIsActive, now);
    } catch (e) {
      if ((e as Error).message.includes('UNIQUE')) {
        return NextResponse.json({ error: 'Ya vinculado' }, { status: 409 });
      }
      throw e;
    }

    const row = {
      paw_id: id,
      connector_id,
      usage_hint: usage_hint || null,
      is_active: finalIsActive,
      created_at: now,
    };

    logger.info('cat-paws', 'Connector vinculado', { pawId: id, connectorId: connector_id });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    logger.error('cat-paws', 'Error vinculando connector', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
