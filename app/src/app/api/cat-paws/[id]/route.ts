import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { syncResource } from '@/lib/services/knowledge-sync';
import { invalidateKbIndex } from '@/lib/services/kb-index-cache';
import { markStale } from '@/lib/services/kb-audit';
import { hookCtx, hookSlug } from '@/lib/services/kb-hook-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const paw = db.prepare('SELECT * FROM cat_paws WHERE id = ?').get(id);

    if (!paw) {
      return NextResponse.json({ error: 'CatPaw not found' }, { status: 404 });
    }

    // Load relations with JOINed names
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

    const skills = db.prepare(`
      SELECT cps.*, s.name as skill_name
      FROM cat_paw_skills cps
      LEFT JOIN skills s ON s.id = cps.skill_id
      WHERE cps.paw_id = ?
    `).all(id);

    return NextResponse.json({ ...paw as Record<string, unknown>, catbrains, connectors, agents, skills });
  } catch (error) {
    logger.error('cat-paws', 'Error obteniendo cat-paw', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const paw = db.prepare('SELECT * FROM cat_paws WHERE id = ?').get(id);
    if (!paw) {
      return NextResponse.json({ error: 'CatPaw not found' }, { status: 404 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    const VALID_DEPARTMENTS = ['direction', 'business', 'marketing', 'finance', 'production', 'logistics', 'hr', 'personal', 'other'];

    const {
      name, description, avatar_emoji, avatar_color, department_tags, department,
      system_prompt, tone, mode, model, temperature, max_tokens,
      processing_instructions, output_format, is_active, openclaw_id, openclaw_synced_at,
      rationale_notes
    } = body;

    if (department !== undefined && !VALID_DEPARTMENTS.includes(department)) {
      return NextResponse.json({ error: `Invalid department. Must be one of: ${VALID_DEPARTMENTS.join(', ')}` }, { status: 400 });
    }

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (avatar_emoji !== undefined) { updates.push('avatar_emoji = ?'); values.push(avatar_emoji); }
    if (avatar_color !== undefined) { updates.push('avatar_color = ?'); values.push(avatar_color); }
    if (department_tags !== undefined) {
      updates.push('department_tags = ?');
      values.push(Array.isArray(department_tags) ? JSON.stringify(department_tags) : department_tags);
    }
    if (department !== undefined) { updates.push('department = ?'); values.push(department); }
    if (system_prompt !== undefined) { updates.push('system_prompt = ?'); values.push(system_prompt); }
    if (tone !== undefined) { updates.push('tone = ?'); values.push(tone); }
    if (mode !== undefined) { updates.push('mode = ?'); values.push(mode); }
    if (model !== undefined) { updates.push('model = ?'); values.push(model); }
    if (temperature !== undefined) { updates.push('temperature = ?'); values.push(temperature); }
    if (max_tokens !== undefined) { updates.push('max_tokens = ?'); values.push(max_tokens); }
    if (processing_instructions !== undefined) { updates.push('processing_instructions = ?'); values.push(processing_instructions); }
    if (output_format !== undefined) { updates.push('output_format = ?'); values.push(output_format); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active); }
    if (openclaw_id !== undefined) { updates.push('openclaw_id = ?'); values.push(openclaw_id); }
    if (openclaw_synced_at !== undefined) { updates.push('openclaw_synced_at = ?'); values.push(openclaw_synced_at); }
    if (rationale_notes !== undefined) {
      const val = typeof rationale_notes === 'string' ? rationale_notes : JSON.stringify(rationale_notes);
      try { JSON.parse(val); } catch { return NextResponse.json({ error: 'rationale_notes must be valid JSON array' }, { status: 400 }); }
      updates.push('rationale_notes = ?'); values.push(val);
    }

    if (updates.length === 0) {
      return NextResponse.json(paw);
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    db.prepare(`UPDATE cat_paws SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM cat_paws WHERE id = ?').get(id) as Record<string, unknown> & { id: string };

    // Phase 153 hook (KB-20, D6: SELECT back has already happened).
    try {
      await syncResource('catpaw', 'update', updated, hookCtx('api:cat-paws.PATCH'));
      invalidateKbIndex();
    } catch (err) {
      const errMsg = (err as Error).message;
      logger.error('kb-sync', 'syncResource failed on PATCH /api/cat-paws/[id]', {
        entity: 'catpaw',
        id,
        err: errMsg,
      });
      markStale(
        `resources/catpaws/${id.slice(0, 8)}-${hookSlug(String((updated as { name?: string }).name ?? ''))}.md`,
        'update-sync-failed',
        { entity: 'cat_paws', db_id: id, error: errMsg },
      );
    }

    logger.info('cat-paws', 'CatPaw actualizado', { pawId: id });
    return NextResponse.json(updated);
  } catch (error) {
    logger.error('cat-paws', 'Error actualizando cat-paw', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const paw = db.prepare('SELECT * FROM cat_paws WHERE id = ?').get(id);

    if (!paw) {
      return NextResponse.json({ error: 'CatPaw not found' }, { status: 404 });
    }

    // CASCADE constraints on relation tables handle cleanup automatically
    db.prepare('DELETE FROM cat_paws WHERE id = ?').run(id);

    // Phase 153 hook (KB-21): soft-delete via syncResource('delete') which
    // internally calls markDeprecated. NEVER fs.unlink the KB file.
    try {
      await syncResource('catpaw', 'delete', { id }, hookCtx(
        'api:cat-paws.DELETE',
        { reason: `DB row deleted at ${new Date().toISOString()}` },
      ));
      invalidateKbIndex();
    } catch (err) {
      const errMsg = (err as Error).message;
      logger.error('kb-sync', 'syncResource failed on DELETE /api/cat-paws/[id]', {
        entity: 'catpaw',
        id,
        err: errMsg,
      });
      markStale(
        `resources/catpaws/${id.slice(0, 8)}-${hookSlug(String((paw as { name?: string }).name ?? ''))}.md`,
        'delete-sync-failed',
        { entity: 'cat_paws', db_id: id, error: errMsg },
      );
    }

    logger.info('cat-paws', 'CatPaw eliminado', { pawId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('cat-paws', 'Error eliminando cat-paw', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
