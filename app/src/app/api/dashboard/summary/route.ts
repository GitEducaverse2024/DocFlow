import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cacheGet, cacheSet } from '@/lib/cache';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'dashboard:summary';
const CACHE_TTL = 60_000;

export async function GET() {
  const cached = cacheGet<Record<string, unknown>>(CACHE_KEY);
  if (cached) return NextResponse.json(cached);

  try {
    const projects = (db.prepare('SELECT COUNT(*) as c FROM catbrains').get() as { c: number }).c;
    const catpawsTotal = (db.prepare('SELECT COUNT(*) as c FROM cat_paws WHERE is_active = 1').get() as { c: number }).c;
    const catpawsChat = (db.prepare("SELECT COUNT(*) as c FROM cat_paws WHERE is_active = 1 AND mode = 'chat'").get() as { c: number }).c;
    const catpawsProcessor = (db.prepare("SELECT COUNT(*) as c FROM cat_paws WHERE is_active = 1 AND mode = 'processor'").get() as { c: number }).c;
    const catpawsHybrid = (db.prepare("SELECT COUNT(*) as c FROM cat_paws WHERE is_active = 1 AND mode = 'hybrid'").get() as { c: number }).c;
    const tasks = (db.prepare('SELECT COUNT(*) as c FROM tasks').get() as { c: number }).c;
    const connectors = (db.prepare('SELECT COUNT(*) as c FROM connectors WHERE is_active = 1').get() as { c: number }).c;

    // Tokens today
    const today = new Date().toISOString().split('T')[0];
    const tokensToday = (db.prepare(
      "SELECT COALESCE(SUM(total_tokens), 0) as t FROM usage_logs WHERE created_at >= ? AND event_type IN ('process', 'chat', 'task_step', 'agent_generate')"
    ).get(`${today}T00:00:00`) as { t: number }).t;

    // Cost this month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const costMonth = (db.prepare(
      'SELECT COALESCE(SUM(estimated_cost), 0) as c FROM usage_logs WHERE created_at >= ?'
    ).get(monthStart.toISOString()) as { c: number }).c;

    // Running tasks
    const runningTasks = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('running', 'paused')").get() as { c: number }).c;

    const data = {
      projects,
      agents: catpawsTotal,
      catpaws: catpawsTotal,
      catpaws_chat: catpawsChat,
      catpaws_processor: catpawsProcessor,
      catpaws_hybrid: catpawsHybrid,
      tasks,
      connectors,
      tokens_today: tokensToday,
      cost_this_month: Math.round(costMonth * 100) / 100,
      running_tasks: runningTasks
    };

    cacheSet(CACHE_KEY, data, CACHE_TTL);
    return NextResponse.json(data);
  } catch (error) {
    logger.error('system', 'Error obteniendo resumen del dashboard', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
