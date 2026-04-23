import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { syncResource } from '@/lib/services/knowledge-sync';
import { invalidateKbIndex } from '@/lib/services/kb-index-cache';
import { markStale } from '@/lib/services/kb-audit';
import { hookCtx, hookSlug } from '@/lib/services/kb-hook-helpers';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(params.id);
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }
    return NextResponse.json(skill);
  } catch (error) {
    logger.error('skills', 'Error obteniendo skill', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(params.id);
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    const body = await request.json();
    const allowedFields = ['name', 'description', 'category', 'tags', 'instructions', 'output_template', 'example_input', 'example_output', 'constraints', 'version', 'author', 'rationale_notes'];
    const updates: string[] = [];
    const values: unknown[] = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        const val = body[field];
        if (field === 'tags' && typeof val !== 'string') {
          values.push(JSON.stringify(val));
        } else {
          values.push(val);
        }
      }
    }

    if (updates.length === 0) {
      return NextResponse.json(skill);
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(params.id);

    db.prepare(`UPDATE skills SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM skills WHERE id = ?').get(params.id) as Record<string, unknown> & { id: string };

    // Phase 153 hook (KB-20, D6: SELECT back has already happened).
    try {
      await syncResource('skill', 'update', updated, hookCtx('api:skills.PATCH'));
      invalidateKbIndex();
    } catch (err) {
      const errMsg = (err as Error).message;
      logger.error('kb-sync', 'syncResource failed on PATCH /api/skills/[id]', {
        entity: 'skill',
        id: params.id,
        err: errMsg,
      });
      markStale(
        `resources/skills/${String(params.id).slice(0, 8)}-${hookSlug(String((updated as { name?: string }).name ?? ''))}.md`,
        'update-sync-failed',
        { entity: 'skills', db_id: String(params.id), error: errMsg },
      );
    }

    logger.info('skills', 'Skill actualizado', { skillId: params.id });
    return NextResponse.json(updated);
  } catch (error) {
    logger.error('skills', 'Error actualizando skill', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(params.id);
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM worker_skills WHERE skill_id = ?').run(params.id);
    db.prepare('DELETE FROM agent_skills WHERE skill_id = ?').run(params.id);
    db.prepare('DELETE FROM skills WHERE id = ?').run(params.id);

    // Phase 153 hook (KB-21): placed AFTER cascades. Soft-delete via
    // syncResource('delete'). Cascades are DB-only concerns.
    try {
      await syncResource('skill', 'delete', { id: params.id }, hookCtx(
        'api:skills.DELETE',
        { reason: `DB row deleted at ${new Date().toISOString()}` },
      ));
      invalidateKbIndex();
    } catch (err) {
      const errMsg = (err as Error).message;
      logger.error('kb-sync', 'syncResource failed on DELETE /api/skills/[id]', {
        entity: 'skill',
        id: params.id,
        err: errMsg,
      });
      markStale(
        `resources/skills/${String(params.id).slice(0, 8)}-${hookSlug(String((skill as { name?: string }).name ?? ''))}.md`,
        'delete-sync-failed',
        { entity: 'skills', db_id: String(params.id), error: errMsg },
      );
    }

    logger.info('skills', 'Skill eliminado', { skillId: params.id });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('skills', 'Error eliminando skill', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
