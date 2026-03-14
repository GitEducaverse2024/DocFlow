import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

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
    const { name, description, purpose, tech_stack, agent_id, status, default_model, rag_enabled, rag_collection, system_prompt, mcp_enabled, icon_color } = body;

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

    if (updates.length === 0) {
      return NextResponse.json(catbrain);
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const stmt = db.prepare(`UPDATE catbrains SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    const updatedCatbrain = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(id);
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
