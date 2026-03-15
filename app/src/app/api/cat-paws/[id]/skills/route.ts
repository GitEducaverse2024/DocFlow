import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const skills = db.prepare(`
      SELECT s.* FROM skills s
      JOIN cat_paw_skills cps ON s.id = cps.skill_id
      WHERE cps.paw_id = ?
    `).all(id);

    return NextResponse.json(skills);
  } catch (error) {
    logger.error('cat-paws', 'Error obteniendo skills', { error: (error as Error).message });
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
    const { skill_id } = body;

    if (!skill_id) {
      return NextResponse.json({ error: 'skill_id is required' }, { status: 400 });
    }

    const skill = db.prepare('SELECT id FROM skills WHERE id = ?').get(skill_id);
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    db.prepare('INSERT OR IGNORE INTO cat_paw_skills (paw_id, skill_id) VALUES (?, ?)').run(id, skill_id);

    logger.info('cat-paws', 'Skill vinculado', { pawId: id, skillId: skill_id });
    return NextResponse.json({ paw_id: id, skill_id }, { status: 201 });
  } catch (error) {
    logger.error('cat-paws', 'Error vinculando skill', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { skill_id } = body;

    if (!skill_id) {
      return NextResponse.json({ error: 'skill_id is required' }, { status: 400 });
    }

    const result = db.prepare('DELETE FROM cat_paw_skills WHERE paw_id = ? AND skill_id = ?').run(id, skill_id);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Skill no vinculado' }, { status: 404 });
    }

    logger.info('cat-paws', 'Skill desvinculado', { pawId: id, skillId: skill_id });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    logger.error('cat-paws', 'Error desvinculando skill', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
