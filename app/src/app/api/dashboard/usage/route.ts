import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cacheGet, cacheSet } from '@/lib/cache';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const CACHE_TTL = 60_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '7');

  const CACHE_KEY = `dashboard:usage:${days}`;
  const cached = cacheGet<Record<string, unknown>>(CACHE_KEY);
  if (cached) return NextResponse.json(cached);

  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const rows = db.prepare(`
      SELECT
        DATE(created_at) as day,
        COALESCE(provider, model, 'unknown') as provider,
        SUM(total_tokens) as tokens,
        SUM(estimated_cost) as cost,
        COUNT(*) as calls
      FROM usage_logs
      WHERE created_at >= ? AND event_type IN ('process', 'chat', 'task_step', 'agent_generate')
      GROUP BY DATE(created_at), COALESCE(provider, model, 'unknown')
      ORDER BY day ASC
    `).all(since.toISOString()) as Array<{ day: string; provider: string; tokens: number; cost: number; calls: number }>;

    // Pivot: group by day, spread providers
    const dayMap = new Map<string, Record<string, number>>();
    const providers = new Set<string>();

    for (const row of rows) {
      // Normalize provider name
      let prov = row.provider;
      if (prov.includes('gemini')) prov = 'google';
      else if (prov.includes('claude')) prov = 'anthropic';
      else if (prov.includes('gpt')) prov = 'openai';
      else if (prov.includes('ollama')) prov = 'ollama';

      providers.add(prov);
      if (!dayMap.has(row.day)) dayMap.set(row.day, { day: 0 });
      const entry = dayMap.get(row.day)!;
      entry[prov] = (entry[prov] || 0) + row.tokens;
    }

    // Fill missing days
    const result: Array<Record<string, unknown>> = [];
    for (let d = new Date(since); d <= new Date(); d.setDate(d.getDate() + 1)) {
      const dayStr = d.toISOString().split('T')[0];
      const entry = dayMap.get(dayStr) || {};
      result.push({ day: dayStr, ...entry });
    }

    const responseData = { data: result, providers: Array.from(providers) };
    cacheSet(CACHE_KEY, responseData, CACHE_TTL);
    return NextResponse.json(responseData);
  } catch (error) {
    logger.error('system', 'Error obteniendo datos de uso', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
