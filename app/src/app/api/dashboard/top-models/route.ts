import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cacheGet, cacheSet } from '@/lib/cache';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const CACHE_TTL = 60_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '5');

  const CACHE_KEY = `dashboard:top-models:${limit}`;
  const cached = cacheGet<unknown[]>(CACHE_KEY);
  if (cached) return NextResponse.json(cached);

  try {
    const models = db.prepare(`
      SELECT model, COUNT(*) as call_count, SUM(total_tokens) as total_tokens, SUM(estimated_cost) as total_cost
      FROM usage_logs
      WHERE model IS NOT NULL
      GROUP BY model
      ORDER BY call_count DESC
      LIMIT ?
    `).all(limit);

    cacheSet(CACHE_KEY, models, CACHE_TTL);
    return NextResponse.json(models);
  } catch (error) {
    logger.error('system', 'Error obteniendo top modelos', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
