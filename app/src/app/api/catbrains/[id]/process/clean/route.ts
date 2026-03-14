import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;

    const project = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(projectId) as Record<string, unknown> | undefined;
    if (!project) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    // Parse keepCount from query string (default: 0 = delete all)
    const url = new URL(request.url);
    const keepCount = parseInt(url.searchParams.get('keep') || '0', 10);

    const allRuns = db.prepare('SELECT * FROM processing_runs WHERE project_id = ? ORDER BY version DESC').all(projectId) as { id: string; version: number; output_path: string | null }[];

    const runsToKeep = allRuns.slice(0, keepCount);
    const runsToDelete = allRuns.slice(keepCount);

    if (runsToDelete.length === 0) {
      return NextResponse.json({ success: true, deleted_count: 0, freed_bytes: 0 });
    }

    const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');
    let freedBytes = 0;

    const getDirSize = (dir: string): number => {
      let size = 0;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) size += getDirSize(fullPath);
          else try { size += fs.statSync(fullPath).size; } catch { /* skip */ }
        }
      } catch { /* skip */ }
      return size;
    };

    for (const run of runsToDelete) {
      // Delete files
      const dirs = [
        run.output_path,
        path.join(projectsPath, projectId, 'processed', `v${run.version}`)
      ].filter(Boolean) as string[];

      for (const dir of dirs) {
        try {
          if (fs.existsSync(dir)) {
            freedBytes += getDirSize(dir);
            fs.rmSync(dir, { recursive: true, force: true });
          }
        } catch { /* skip */ }
      }

      // Delete DB record
      db.prepare('DELETE FROM processing_runs WHERE id = ?').run(run.id);
    }

    // Update current_version to the latest kept version
    const newVersion = runsToKeep.length > 0 ? runsToKeep[0].version : 0;
    const newStatus = runsToKeep.length > 0
      ? (project.status as string)
      : ((project.status === 'processed' || project.status === 'rag_indexed') ? 'sources_added' : project.status as string);

    db.prepare(`UPDATE catbrains SET current_version = ?, status = ?, updated_at = ? WHERE id = ?`)
      .run(newVersion, newStatus, new Date().toISOString(), projectId);

    return NextResponse.json({
      success: true,
      deleted_count: runsToDelete.length,
      freed_bytes: freedBytes,
      kept_versions: runsToKeep.map(r => r.version),
    });
  } catch (error) {
    logger.error('processing', 'Error limpiando historial', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
