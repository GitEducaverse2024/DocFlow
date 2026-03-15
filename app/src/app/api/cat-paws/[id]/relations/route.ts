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

    const catbrains = db.prepare(`
      SELECT cpc.*, c.name as catbrain_name
      FROM cat_paw_catbrains cpc
      LEFT JOIN catbrains c ON c.id = cpc.catbrain_id
      WHERE cpc.paw_id = ?
    `).all(id);

    const connectors = db.prepare(`
      SELECT cpc.*, cn.name as connector_name, cn.type as connector_type
      FROM cat_paw_connectors cpc
      LEFT JOIN connectors cn ON cn.id = cpc.connector_id
      WHERE cpc.paw_id = ?
    `).all(id);

    const agents = db.prepare(`
      SELECT cpa.*, cp2.name as target_name, cp2.avatar_emoji as target_emoji
      FROM cat_paw_agents cpa
      LEFT JOIN cat_paws cp2 ON cp2.id = cpa.target_paw_id
      WHERE cpa.paw_id = ?
    `).all(id);

    return NextResponse.json({ catbrains, connectors, agents });
  } catch (error) {
    logger.error('cat-paws', 'Error obteniendo relaciones', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
