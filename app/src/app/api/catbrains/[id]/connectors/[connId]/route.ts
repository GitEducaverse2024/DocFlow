import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const VALID_TYPES = ['n8n_webhook', 'http_api', 'mcp_server', 'email'];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; connId: string }> }
) {
  try {
    const { id, connId } = await params;

    const catbrain = db.prepare('SELECT id FROM catbrains WHERE id = ?').get(id);
    if (!catbrain) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    const connector = db.prepare(
      'SELECT * FROM catbrain_connectors WHERE id = ? AND catbrain_id = ?'
    ).get(connId, id);
    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    return NextResponse.json(connector);
  } catch (error) {
    logger.error('connectors', 'Error getting catbrain connector', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; connId: string }> }
) {
  try {
    const { id, connId } = await params;

    const catbrain = db.prepare('SELECT id FROM catbrains WHERE id = ?').get(id);
    if (!catbrain) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    const connector = db.prepare(
      'SELECT * FROM catbrain_connectors WHERE id = ? AND catbrain_id = ?'
    ).get(connId, id);
    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    const body = await request.json();
    const allowedFields = ['name', 'type', 'config', 'description', 'is_active'];
    const updates: string[] = [];
    const values: unknown[] = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'type' && !VALID_TYPES.includes(body[field])) {
          return NextResponse.json(
            { error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` },
            { status: 400 }
          );
        }
        updates.push(`${field} = ?`);
        if (field === 'config' && typeof body[field] !== 'string') {
          values.push(JSON.stringify(body[field]));
        } else {
          values.push(body[field]);
        }
      }
    }

    if (updates.length === 0) {
      return NextResponse.json(connector);
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(connId);
    values.push(id);

    db.prepare(
      `UPDATE catbrain_connectors SET ${updates.join(', ')} WHERE id = ? AND catbrain_id = ?`
    ).run(...values);

    const updated = db.prepare(
      'SELECT * FROM catbrain_connectors WHERE id = ? AND catbrain_id = ?'
    ).get(connId, id);

    logger.info('connectors', 'CatBrain connector updated', { catbrainId: id, connectorId: connId });
    return NextResponse.json(updated);
  } catch (error) {
    logger.error('connectors', 'Error updating catbrain connector', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; connId: string }> }
) {
  try {
    const { id, connId } = await params;

    const catbrain = db.prepare('SELECT id FROM catbrains WHERE id = ?').get(id);
    if (!catbrain) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    const connector = db.prepare(
      'SELECT * FROM catbrain_connectors WHERE id = ? AND catbrain_id = ?'
    ).get(connId, id);
    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM catbrain_connectors WHERE id = ? AND catbrain_id = ?').run(connId, id);

    logger.info('connectors', 'CatBrain connector deleted', { catbrainId: id, connectorId: connId });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('connectors', 'Error deleting catbrain connector', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
