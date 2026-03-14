import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function getDirSize(dirPath: string): number {
  let size = 0;
  try {
    if (!fs.existsSync(dirPath)) return 0;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += getDirSize(fullPath);
      } else {
        try {
          size += fs.statSync(fullPath).size;
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }
  return size;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: catbrainId } = await params;

    const catbrain = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(catbrainId) as Record<string, unknown> | undefined;
    if (!catbrain) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    const sourcesCount = (db.prepare('SELECT COUNT(*) as count FROM sources WHERE project_id = ?').get(catbrainId) as { count: number }).count;
    const versionsCount = (db.prepare('SELECT COUNT(*) as count FROM processing_runs WHERE project_id = ?').get(catbrainId) as { count: number }).count;

    // Sources by type
    const sourcesByType = db.prepare(
      "SELECT type, COUNT(*) as count FROM sources WHERE project_id = ? GROUP BY type"
    ).all(catbrainId) as { type: string; count: number }[];

    // Disk size
    const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');
    const catbrainDir = path.join(projectsPath, catbrainId);
    const diskBytes = getDirSize(catbrainDir);

    // Last processing run info
    const lastRun = db.prepare(
      'SELECT agent_id, completed_at FROM processing_runs WHERE project_id = ? ORDER BY version DESC LIMIT 1'
    ).get(catbrainId) as { agent_id: string | null; completed_at: string | null } | undefined;

    // Qdrant vectors count
    let vectorsCount: number | null = null;
    let embeddingModel: string | null = null;
    if (catbrain.rag_collection) {
      try {
        const qdrantUrl = process['env']['QDRANT_URL'] || 'http://localhost:6333';
        const res = await fetch(`${qdrantUrl}/collections/${catbrain.rag_collection}`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const data = await res.json();
          vectorsCount = data.result?.points_count ?? null;
        }
      } catch { /* skip */ }

      embeddingModel = process['env']['EMBEDDING_MODEL'] || 'nomic-embed-text';
    }

    // Bot info
    let botInfo: { name: string; id: string; has_workspace: boolean } | null = null;
    if (catbrain.bot_agent_id) {
      const openclawPath = '/app/openclaw';
      const envPath = process['env']['OPENCLAW_WORKSPACE_PATH'] || '';
      const workspaceDir = `workspace-${catbrain.bot_agent_id}`;
      const hasWorkspace = fs.existsSync(path.join(openclawPath, workspaceDir)) ||
        (envPath ? fs.existsSync(path.join(envPath, workspaceDir)) : false);

      botInfo = {
        name: `Experto ${catbrain.name}`,
        id: catbrain.bot_agent_id as string,
        has_workspace: hasWorkspace,
      };
    }

    return NextResponse.json({
      sources_count: sourcesCount,
      sources_by_type: sourcesByType,
      versions_count: versionsCount,
      rag_enabled: catbrain.rag_enabled,
      rag_collection: catbrain.rag_collection,
      vectors_count: vectorsCount,
      embedding_model: embeddingModel,
      disk_size: formatBytes(diskBytes),
      disk_bytes: diskBytes,
      last_processing_agent: lastRun?.agent_id || null,
      last_processing_at: lastRun?.completed_at || null,
      bot_info: botInfo,
      created_at: catbrain.created_at,
      updated_at: catbrain.updated_at,
    });
  } catch (error) {
    logger.error('system', 'Error obteniendo estadisticas del catbrain', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
