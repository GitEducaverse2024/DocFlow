import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { qdrant } from '@/lib/services/qdrant';

export async function GET() {
  try {
    // Check DB
    db.prepare('SELECT 1').get();
    
    // Check OpenClaw
    let openclawOk = false;
    try {
      const openclawUrl = process.env.OPENCLAW_URL || 'http://192.168.1.49:18789';
      const res = await fetch(`${openclawUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
      openclawOk = res.ok;
    } catch {
      // Ignore
    }

    // Check n8n
    let n8nOk = false;
    try {
      const n8nUrl = process.env.N8N_WEBHOOK_URL || 'http://192.168.1.49:5678';
      const res = await fetch(`${n8nUrl}/healthz`, { signal: AbortSignal.timeout(2000) });
      n8nOk = res.ok;
    } catch {
      // Ignore
    }

    // Check Qdrant
    const qdrantOk = await qdrant.healthCheck();

    return NextResponse.json({ 
      status: 'ok',
      services: {
        db: true,
        openclaw: openclawOk,
        n8n: n8nOk,
        qdrant: qdrantOk
      }
    });
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
