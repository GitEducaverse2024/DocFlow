import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

interface AgentRow {
  id: string;
  name: string;
  emoji: string;
  model: string;
  description: string | null;
}

export async function GET() {
  try {
    const openclawUrl = process['env']['OPENCLAW_URL'] || 'http://192.168.1.49:18789';
    let agents: AgentRow[] = [];

    // Try to fetch agents from OpenClaw
    try {
      const res = await fetch(`${openclawUrl}/api/v1/agents`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        agents = Array.isArray(data) ? data : [];
      }
    } catch {
      console.log('Could not fetch agents from OpenClaw /api/v1/agents');
    }

    if (agents.length === 0) {
      try {
        const res = await fetch(`${openclawUrl}/rpc/agents.list`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          agents = Array.isArray(data) ? data : [];
        }
      } catch {
        console.log('Could not fetch agents from OpenClaw /rpc/agents.list');
      }
    }

    // Fallback list from env
    if (agents.length === 0 && process['env']['OPENCLAW_AGENTS']) {
      try {
        const fallbackAgents = JSON.parse(process['env']['OPENCLAW_AGENTS'] as string);
        agents = Array.isArray(fallbackAgents) ? fallbackAgents : [];
      } catch (e) {
        console.error('Error parsing OPENCLAW_AGENTS env var:', e);
      }
    }

    // Merge custom agents from SQLite
    try {
      const customAgents = db.prepare('SELECT * FROM custom_agents ORDER BY created_at DESC').all() as AgentRow[];
      agents = [...agents, ...customAgents];
    } catch (e) {
      console.error('Error fetching custom agents:', e);
    }

    return NextResponse.json(agents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
