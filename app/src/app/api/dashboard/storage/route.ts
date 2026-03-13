import { NextResponse } from 'next/server';
import db from '@/lib/db';
import path from 'path';
import fs from 'fs';
import { cacheGet, cacheSet } from '@/lib/cache';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'dashboard:storage';
const CACHE_TTL = 60_000;

function getDirSize(dir: string): number {
  let size = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        size += getDirSize(full);
      } else {
        try { size += fs.statSync(full).size; } catch { /* skip */ }
      }
    }
  } catch { /* dir not found */ }
  return size;
}

export async function GET() {
  const cached = cacheGet<Record<string, unknown>>(CACHE_KEY);
  if (cached) return NextResponse.json(cached);

  try {
    const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');

    // Count projects
    const projectCount = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as { c: number }).c;

    // Count sources
    const sourceCount = (db.prepare('SELECT COUNT(*) as c FROM sources').get() as { c: number }).c;

    // Sources by type
    const sourcesByType = db.prepare(
      'SELECT type, COUNT(*) as count FROM sources GROUP BY type ORDER BY count DESC'
    ).all() as Array<{ type: string; count: number }>;

    // Total disk usage
    const totalSize = getDirSize(projectsPath);

    // DB file size
    const dbPath = path.join(process.cwd(), 'data', 'docflow.db');
    let dbSize = 0;
    try { dbSize = fs.statSync(dbPath).size; } catch { /* */ }

    const data = {
      projects: projectCount,
      sources: sourceCount,
      sources_by_type: sourcesByType,
      disk_usage_bytes: totalSize,
      disk_usage_mb: Math.round(totalSize / 1024 / 1024 * 100) / 100,
      db_size_bytes: dbSize,
      db_size_mb: Math.round(dbSize / 1024 / 1024 * 100) / 100
    };

    cacheSet(CACHE_KEY, data, CACHE_TTL);
    return NextResponse.json(data);
  } catch (error) {
    logger.error('system', 'Error obteniendo info de almacenamiento', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
