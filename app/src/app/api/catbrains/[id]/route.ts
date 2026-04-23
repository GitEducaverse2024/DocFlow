import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';
import { syncResource } from '@/lib/services/knowledge-sync';
import { invalidateKbIndex } from '@/lib/services/kb-index-cache';
import { markStale } from '@/lib/services/kb-audit';
import { hookCtx, hookSlug } from '@/lib/services/kb-hook-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const catbrain = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(id);

    if (!catbrain) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    return NextResponse.json(catbrain);
  } catch (error) {
    logger.error('system', 'Error obteniendo catbrain', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, purpose, tech_stack, agent_id, status, default_model, rag_enabled, rag_collection, system_prompt, mcp_enabled, icon_color, search_engine, rationale_notes } = body;

    const catbrain = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(id);
    if (!catbrain) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (purpose !== undefined) { updates.push('purpose = ?'); values.push(purpose); }
    if (tech_stack !== undefined) { updates.push('tech_stack = ?'); values.push(tech_stack ? JSON.stringify(tech_stack) : null); }
    if (agent_id !== undefined) { updates.push('agent_id = ?'); values.push(agent_id); }
    if (status !== undefined) { updates.push('status = ?'); values.push(status); }
    if (default_model !== undefined) { updates.push('default_model = ?'); values.push(default_model); }
    if (rag_enabled !== undefined) { updates.push('rag_enabled = ?'); values.push(rag_enabled); }
    if (rag_collection !== undefined) { updates.push('rag_collection = ?'); values.push(rag_collection); }
    if (system_prompt !== undefined) { updates.push('system_prompt = ?'); values.push(system_prompt); }
    if (mcp_enabled !== undefined) { updates.push('mcp_enabled = ?'); values.push(mcp_enabled); }
    if (icon_color !== undefined) { updates.push('icon_color = ?'); values.push(icon_color); }
    if (search_engine !== undefined) { updates.push('search_engine = ?'); values.push(search_engine); }
    if (rationale_notes !== undefined) {
      const val = typeof rationale_notes === 'string' ? rationale_notes : JSON.stringify(rationale_notes);
      try { JSON.parse(val); } catch { return NextResponse.json({ error: 'rationale_notes must be valid JSON array' }, { status: 400 }); }
      updates.push('rationale_notes = ?'); values.push(val);
    }

    if (updates.length === 0) {
      return NextResponse.json(catbrain);
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const stmt = db.prepare(`UPDATE catbrains SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    const updatedCatbrain = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(id) as Record<string, unknown> & { id: string };

    // Phase 153 hook (KB-20, D6: SELECT back has already happened).
    try {
      await syncResource('catbrain', 'update', updatedCatbrain, hookCtx('api:catbrains.PATCH'));
      invalidateKbIndex();
    } catch (err) {
      const errMsg = (err as Error).message;
      logger.error('kb-sync', 'syncResource failed on PATCH /api/catbrains/[id]', {
        entity: 'catbrain',
        id,
        err: errMsg,
      });
      markStale(
        `resources/catbrains/${id.slice(0, 8)}-${hookSlug(String((updatedCatbrain as { name?: string }).name ?? ''))}.md`,
        'update-sync-failed',
        { entity: 'catbrains', db_id: id, error: errMsg },
      );
    }

    return NextResponse.json(updatedCatbrain);
  } catch (error) {
    logger.error('system', 'Error actualizando catbrain', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const catbrain = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!catbrain) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    // Protect system CatBrains from deletion (WSCBUI-05)
    if (catbrain.is_system === 1) {
      return NextResponse.json(
        { error: 'No se puede eliminar un CatBrain de sistema' },
        { status: 403 }
      );
    }

    const errors: string[] = [];

    // 1. Delete RAG collection from Qdrant if exists
    if (catbrain.rag_collection) {
      try {
        const qdrantUrl = process['env']['QDRANT_URL'] || 'http://localhost:6333';
        const res = await fetch(`${qdrantUrl}/collections/${catbrain.rag_collection}`, { method: 'DELETE' });
        if (!res.ok && res.status !== 404) {
          errors.push(`Qdrant delete failed: ${res.status}`);
        }
      } catch (e) {
        errors.push(`Qdrant unreachable: ${(e as Error).message}`);
      }
    }

    // 2. Delete catbrain folder from disk
    try {
      const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');
      const catbrainDir = path.join(projectsPath, id);
      if (fs.existsSync(catbrainDir)) {
        fs.rmSync(catbrainDir, { recursive: true, force: true });
      }
    } catch (e) {
      errors.push(`Filesystem delete failed: ${(e as Error).message}`);
    }

    // 3. Delete bot files if they exist
    try {
      const botDir = path.join(process.cwd(), 'data', 'bots', id);
      if (fs.existsSync(botDir)) {
        fs.rmSync(botDir, { recursive: true, force: true });
      }
    } catch (e) {
      errors.push(`Bot files delete failed: ${(e as Error).message}`);
    }

    // 4. Delete from SQLite (CASCADE handles sources and processing_runs)
    db.prepare('DELETE FROM catbrains WHERE id = ?').run(id);

    // Phase 153 hook (KB-21): soft-delete via syncResource('delete').
    // IMPORTANT: on failure, do NOT push to `errors`/`warnings` — the KB
    // hook failure is a separate concern recorded in _sync_failures.md
    // via markStale. Response shape {success, warnings?} invariant preserved.
    try {
      await syncResource('catbrain', 'delete', { id }, hookCtx(
        'api:catbrains.DELETE',
        { reason: `DB row deleted at ${new Date().toISOString()}` },
      ));
      invalidateKbIndex();
    } catch (err) {
      const errMsg = (err as Error).message;
      logger.error('kb-sync', 'syncResource failed on DELETE /api/catbrains/[id]', {
        entity: 'catbrain',
        id,
        err: errMsg,
      });
      markStale(
        `resources/catbrains/${id.slice(0, 8)}-${hookSlug(String((catbrain as { name?: string }).name ?? ''))}.md`,
        'delete-sync-failed',
        { entity: 'catbrains', db_id: id, error: errMsg },
      );
    }

    if (errors.length > 0) {
      logger.warn('system', 'CatBrain eliminado con advertencias', { catbrainId: id, warnings: errors });
    }

    logger.info('system', 'CatBrain eliminado', { catbrainId: id });
    return NextResponse.json({ success: true, warnings: errors.length > 0 ? errors : undefined });
  } catch (error) {
    logger.error('system', 'Error eliminando catbrain', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
