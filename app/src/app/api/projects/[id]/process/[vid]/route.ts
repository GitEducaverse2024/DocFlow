import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

export async function DELETE(request: Request, { params }: { params: { id: string; vid: string } }) {
  try {
    const projectId = params.id;
    const version = parseInt(params.vid, 10);

    if (isNaN(version)) {
      return NextResponse.json({ error: 'Invalid version' }, { status: 400 });
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as { current_version: number } | undefined;
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const run = db.prepare('SELECT * FROM processing_runs WHERE project_id = ? AND version = ?').get(projectId, version) as { id: string; output_path: string | null } | undefined;
    if (!run) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    // Delete files from disk
    let freedBytes = 0;
    if (run.output_path) {
      try {
        if (fs.existsSync(run.output_path)) {
          // Calculate size before deleting
          const getDirSize = (dir: string): number => {
            let size = 0;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) size += getDirSize(fullPath);
              else try { size += fs.statSync(fullPath).size; } catch { /* skip */ }
            }
            return size;
          };
          freedBytes = getDirSize(run.output_path);
          fs.rmSync(run.output_path, { recursive: true, force: true });
        }
      } catch (e) {
        logger.warn('processing', 'Error eliminando archivos de version', { error: (e as Error).message });
      }
    }

    // Also try the standard path if output_path wasn't set
    const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');
    const versionDir = path.join(projectsPath, projectId, 'processed', `v${version}`);
    if (fs.existsSync(versionDir) && versionDir !== run.output_path) {
      try {
        const getDirSize = (dir: string): number => {
          let size = 0;
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) size += getDirSize(fullPath);
            else try { size += fs.statSync(fullPath).size; } catch { /* skip */ }
          }
          return size;
        };
        freedBytes += getDirSize(versionDir);
        fs.rmSync(versionDir, { recursive: true, force: true });
      } catch { /* skip */ }
    }

    // Delete DB record
    db.prepare('DELETE FROM processing_runs WHERE id = ?').run(run.id);

    // If this was the latest version, update current_version
    if (project.current_version === version) {
      const latestRun = db.prepare('SELECT version FROM processing_runs WHERE project_id = ? ORDER BY version DESC LIMIT 1').get(projectId) as { version: number } | undefined;
      const newVersion = latestRun?.version || 0;
      db.prepare(`UPDATE projects SET current_version = ?, updated_at = ? WHERE id = ?`).run(newVersion, new Date().toISOString(), projectId);
    }

    return NextResponse.json({ success: true, freed_bytes: freedBytes });
  } catch (error) {
    logger.error('processing', 'Error eliminando version', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
