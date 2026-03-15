import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const VALID_RELATIONSHIPS = ['collaborator', 'delegate', 'supervisor'];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const paw = db.prepare('SELECT id FROM cat_paws WHERE id = ?').get(id);
    if (!paw) {
      return NextResponse.json({ error: 'CatPaw not found' }, { status: 404 });
    }

    const body = await request.json();
    const { target_paw_id, relationship } = body;

    if (!target_paw_id) {
      return NextResponse.json({ error: 'target_paw_id is required' }, { status: 400 });
    }

    if (id === target_paw_id) {
      return NextResponse.json({ error: 'No se puede vincular consigo mismo' }, { status: 400 });
    }

    const targetPaw = db.prepare('SELECT id FROM cat_paws WHERE id = ?').get(target_paw_id);
    if (!targetPaw) {
      return NextResponse.json({ error: 'Target CatPaw not found' }, { status: 404 });
    }

    const finalRelationship = relationship || 'collaborator';
    if (!VALID_RELATIONSHIPS.includes(finalRelationship)) {
      return NextResponse.json(
        { error: `relationship must be one of: ${VALID_RELATIONSHIPS.join(', ')}` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    try {
      db.prepare(`
        INSERT INTO cat_paw_agents (paw_id, target_paw_id, relationship, created_at)
        VALUES (?, ?, ?, ?)
      `).run(id, target_paw_id, finalRelationship, now);
    } catch (e) {
      if ((e as Error).message.includes('UNIQUE')) {
        return NextResponse.json({ error: 'Ya vinculado' }, { status: 409 });
      }
      throw e;
    }

    const row = {
      paw_id: id,
      target_paw_id,
      relationship: finalRelationship,
      created_at: now,
    };

    logger.info('cat-paws', 'Agent vinculado', { pawId: id, targetPawId: target_paw_id });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    logger.error('cat-paws', 'Error vinculando agent', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
