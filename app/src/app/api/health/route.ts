import { NextResponse } from 'next/server';

export async function GET() {
  let openclawStatus = 'unknown';
  
  try {
    const openclawUrl = process.env.OPENCLAW_URL || 'http://192.168.1.49:18789';
    const res = await fetch(openclawUrl, { signal: AbortSignal.timeout(5000) });
    openclawStatus = res.ok ? 'ok' : 'error';
  } catch {
    openclawStatus = 'error';
  }

  return NextResponse.json({
    status: 'ok',
    openclaw: openclawStatus,
    timestamp: new Date().toISOString()
  });
}
