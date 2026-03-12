import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { withRetry } from '@/lib/retry';
import { cacheGet, cacheSet } from '@/lib/cache';

export const dynamic = 'force-dynamic';

interface AgentRow {
  id: string;
  name: string;
  emoji: string;
  model: string;
  description: string | null;
  created_at?: string;
}

function getOpenclawPath(): string {
  const candidates = [
    '/app/openclaw',
    process['env']['OPENCLAW_WORKSPACE_PATH'] || '',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch { /* skip */ }
  }
  return path.join(process.cwd(), 'data', 'bots');
}

const AGENTS_CACHE_KEY = 'agents';
const AGENTS_CACHE_TTL = 30_000;

export async function GET() {
  const cached = cacheGet<unknown[]>(AGENTS_CACHE_KEY);
  if (cached) return NextResponse.json(cached);

  try {
    const openclawUrl = process['env']['OPENCLAW_URL'] || 'http://192.168.1.49:18789';
    const openclawAgents: (AgentRow & { source: string })[] = [];

    // Try to fetch agents from OpenClaw
    let fetched = false;
    try {
      const res = await withRetry(async () => {
        const r = await fetch(`${openclawUrl}/api/v1/agents`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r;
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          data.forEach((a: AgentRow) => openclawAgents.push({ ...a, source: 'openclaw' }));
          fetched = true;
        }
      }
    } catch {
      // silent
    }

    if (!fetched) {
      try {
        const res = await withRetry(async () => {
          const r = await fetch(`${openclawUrl}/rpc/agents.list`, { signal: AbortSignal.timeout(5000) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r;
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            data.forEach((a: AgentRow) => openclawAgents.push({ ...a, source: 'openclaw' }));
            fetched = true;
          }
        }
      } catch {
        // silent
      }
    }

    // Fallback list from env
    if (!fetched && process['env']['OPENCLAW_AGENTS']) {
      try {
        const fallbackAgents = JSON.parse(process['env']['OPENCLAW_AGENTS'] as string);
        if (Array.isArray(fallbackAgents)) {
          fallbackAgents.forEach((a: AgentRow) => openclawAgents.push({ ...a, source: 'openclaw' }));
        }
      } catch (e) {
        console.error('Error parsing OPENCLAW_AGENTS env var:', e);
      }
    }

    // Custom agents from SQLite with usage count and workspace status
    const customAgents: (AgentRow & { source: string; usage_count: number; has_workspace: boolean })[] = [];
    try {
      const rows = db.prepare('SELECT * FROM custom_agents ORDER BY created_at DESC').all() as AgentRow[];
      const openclawPath = getOpenclawPath();

      for (const row of rows) {
        const usageCount = (db.prepare('SELECT COUNT(*) as c FROM processing_runs WHERE agent_id = ?').get(row.id) as { c: number }).c;
        const workspacePath = path.join(openclawPath, `workspace-${row.id}`);
        const hasWorkspace = fs.existsSync(workspacePath);

        customAgents.push({
          ...row,
          source: 'custom',
          usage_count: usageCount,
          has_workspace: hasWorkspace,
        });
      }
    } catch (e) {
      console.error('Error fetching custom agents:', e);
    }

    const result = [...openclawAgents, ...customAgents];
    cacheSet(AGENTS_CACHE_KEY, result, AGENTS_CACHE_TTL);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
