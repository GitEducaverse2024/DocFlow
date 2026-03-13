import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cacheGet, cacheSet } from '@/lib/cache';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const CACHE_TTL = 60_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '10');

  const CACHE_KEY = `dashboard:activity:${limit}`;
  const cached = cacheGet<unknown[]>(CACHE_KEY);
  if (cached) return NextResponse.json(cached);

  try {
    const events = db.prepare(`
      SELECT id, event_type, project_id, task_id, agent_id, model, total_tokens, estimated_cost, duration_ms, status, created_at
      FROM usage_logs
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);

    cacheSet(CACHE_KEY, events, CACHE_TTL);
    return NextResponse.json(events);
  } catch (error) {
    logger.error('system', 'Error obteniendo actividad', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
