import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';
import { syncResource } from '@/lib/services/knowledge-sync';
import { invalidateKbIndex } from '@/lib/services/kb-index-cache';
import { markStale } from '@/lib/services/kb-audit';
import { hookCtx, hookSlug } from '@/lib/services/kb-hook-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const catbrains = db.prepare('SELECT * FROM catbrains ORDER BY updated_at DESC LIMIT ? OFFSET ?').all(limit, offset);
    const total = db.prepare('SELECT COUNT(*) as count FROM catbrains').get() as { count: number };

    return NextResponse.json({
      data: catbrains,
      pagination: {
        total: total.count,
        page,
        limit,
        totalPages: Math.ceil(total.count / limit)
      }
    });
  } catch (error) {
    logger.error('system', 'Error obteniendo catbrains', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, purpose, tech_stack, agent_id, status = 'draft' } = body;

    if (!name || !purpose) {
      return NextResponse.json({ error: 'Name and purpose are required' }, { status: 400 });
    }

    const id = uuidv4();
    const techStackJson = tech_stack ? JSON.stringify(tech_stack) : null;

    const stmt = db.prepare(`
      INSERT INTO catbrains (id, name, description, purpose, tech_stack, agent_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, name, description || null, purpose, techStackJson, agent_id || null, status);

    const catbrain = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(id) as Record<string, unknown> & { id: string };

    // Phase 153 hook (KB-20).
    try {
      await syncResource('catbrain', 'create', catbrain, hookCtx('api:catbrains.POST'));
      invalidateKbIndex();
    } catch (err) {
      const errMsg = (err as Error).message;
      logger.error('kb-sync', 'syncResource failed on POST /api/catbrains', {
        entity: 'catbrain',
        id,
        err: errMsg,
      });
      markStale(
        `resources/catbrains/${id.slice(0, 8)}-${hookSlug(String(name))}.md`,
        'create-sync-failed',
        { entity: 'catbrains', db_id: id, error: errMsg },
      );
    }

    logger.info('system', 'CatBrain creado', { catbrainId: id, name });
    return NextResponse.json(catbrain, { status: 201 });
  } catch (error) {
    logger.error('system', 'Error creando catbrain', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
