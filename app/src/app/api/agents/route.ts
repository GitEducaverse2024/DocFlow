import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const openclawUrl = process['env']['OPENCLAW_URL'] || 'http://192.168.1.49:18789';

    // Try to fetch agents from OpenClaw
    try {
      const res = await fetch(`${openclawUrl}/api/v1/agents`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {
      console.log('Could not fetch agents from OpenClaw /api/v1/agents');
    }

    try {
      const res = await fetch(`${openclawUrl}/rpc/agents.list`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {
      console.log('Could not fetch agents from OpenClaw /rpc/agents.list');
    }

    // Fallback list from env
    if (process['env']['OPENCLAW_AGENTS']) {
      try {
        const fallbackAgents = JSON.parse(process['env']['OPENCLAW_AGENTS'] as string);
        return NextResponse.json(fallbackAgents);
      } catch (e) {
        console.error('Error parsing OPENCLAW_AGENTS env var:', e);
      }
    }

    return NextResponse.json({ fallback: true, agents: [] });
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
