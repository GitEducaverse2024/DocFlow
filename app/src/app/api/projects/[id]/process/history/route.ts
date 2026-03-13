import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    const runs = db.prepare('SELECT * FROM processing_runs WHERE project_id = ? ORDER BY version DESC').all(projectId) as Record<string, unknown>[];

    const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');

    const enrichedRuns = runs.map(run => {
      // File size
      let fileSize = 0;
      const outputPath = run.output_path as string | null;
      if (outputPath) {
        const outputFile = path.join(outputPath, 'output.md');
        try {
          if (fs.existsSync(outputFile)) {
            fileSize = fs.statSync(outputFile).size;
          }
        } catch { /* skip */ }
      }

      // Source names from input_sources
      let sourceNames: string[] = [];
      if (run.input_sources) {
        try {
          const parsed = JSON.parse(run.input_sources as string);
          // Support both old format (string[]) and new format ({ processed, direct })
          const ids: string[] = Array.isArray(parsed)
            ? parsed
            : [...(parsed.processed || []), ...(parsed.direct || [])];
          if (ids.length > 0) {
            const placeholders = ids.map(() => '?').join(',');
            const sources = db.prepare(`SELECT name FROM sources WHERE id IN (${placeholders})`).all(...ids) as { name: string }[];
            sourceNames = sources.map(s => s.name);
          }
        } catch { /* skip */ }
      }

      // Duration from timestamps if not stored
      let durationSeconds = run.duration_seconds as number | null;
      if (!durationSeconds && run.started_at && run.completed_at) {
        const start = new Date(run.started_at as string).getTime();
        const end = new Date(run.completed_at as string).getTime();
        if (start && end) durationSeconds = Math.round((end - start) / 1000);
      }

      return {
        ...run,
        file_size: fileSize,
        file_path: outputPath ? path.join(outputPath, 'output.md') : null,
        source_names: sourceNames,
        duration_seconds: durationSeconds,
      };
    });

    // Total disk usage of processed folder
    let totalDiskSize = 0;
    const processedDir = path.join(projectsPath, projectId, 'processed');
    try {
      if (fs.existsSync(processedDir)) {
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
        totalDiskSize = getDirSize(processedDir);
      }
    } catch { /* skip */ }

    return NextResponse.json({
      runs: enrichedRuns,
      total_disk_size: totalDiskSize,
      processed_path: processedDir,
    });
  } catch (error) {
    logger.error('processing', 'Error obteniendo historial de procesamiento', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
