import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cacheGet, cacheSet } from '@/lib/cache';

export const dynamic = 'force-dynamic';

const CACHE_TTL = 60_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '5');

  const CACHE_KEY = `dashboard:top-agents:${limit}`;
  const cached = cacheGet<unknown[]>(CACHE_KEY);
  if (cached) return NextResponse.json(cached);

  try {
    const agents = db.prepare(`
      SELECT u.agent_id, COALESCE(a.name, u.agent_id) as name, COALESCE(a.emoji, '🤖') as emoji,
        COUNT(*) as call_count, SUM(u.total_tokens) as total_tokens, SUM(u.estimated_cost) as total_cost
      FROM usage_logs u
      LEFT JOIN custom_agents a ON u.agent_id = a.id
      WHERE u.agent_id IS NOT NULL
      GROUP BY u.agent_id
      ORDER BY call_count DESC
      LIMIT ?
    `).all(limit);

    cacheSet(CACHE_KEY, agents, CACHE_TTL);
    return NextResponse.json(agents);
  } catch (error) {
    console.error('Error fetching top agents:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
