import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { qdrant } from '@/lib/services/qdrant';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const catbrain = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(id) as Record<string, unknown> | undefined;

    if (!catbrain) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    if (catbrain.is_system === 1) {
      return NextResponse.json({ error: 'Cannot reset system CatBrain' }, { status: 403 });
    }

    const errors: string[] = [];

    // 1. Delete Qdrant collection (non-fatal — DB/file cleanup continues on error)
    if (catbrain.rag_collection) {
      try {
        await qdrant.deleteCollection(catbrain.rag_collection as string);
      } catch (e) {
        errors.push(`Qdrant: ${(e as Error).message}`);
        logger.error('system', 'Qdrant delete failed during reset', { catbrainId: id, error: (e as Error).message });
      }
    }

    // 2. Delete physical files (entire catbrain directory)
    try {
      const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');
      const catbrainDir = path.join(projectsPath, id);
      if (fs.existsSync(catbrainDir)) {
        fs.rmSync(catbrainDir, { recursive: true, force: true });
      }
    } catch (e) {
      errors.push(`Files: ${(e as Error).message}`);
    }

    // 3. Delete DB records (sources and processing runs)
    db.prepare('DELETE FROM sources WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM processing_runs WHERE project_id = ?').run(id);

    // 4. Reset catbrain fields (preserve config: name, description, system_prompt, agent_id, default_model, icon_color, etc.)
    db.prepare(`UPDATE catbrains SET
      status = 'draft', current_version = 0,
      rag_enabled = 0, rag_collection = NULL,
      rag_indexed_version = NULL, rag_indexed_at = NULL, rag_model = NULL,
      updated_at = ?
      WHERE id = ?`
    ).run(new Date().toISOString(), id);

    if (errors.length > 0) {
      logger.warn('system', 'CatBrain reset completed with warnings', { catbrainId: id, warnings: errors });
    }

    logger.info('system', 'CatBrain reset', { catbrainId: id });
    return NextResponse.json({ success: true, warnings: errors.length > 0 ? errors : undefined });
  } catch (error) {
    logger.error('system', 'Error resetting catbrain', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
