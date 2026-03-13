import { NextResponse } from 'next/server';
import { getCurrentRun } from '@/lib/testing-state';

export const dynamic = 'force-dynamic';

export async function GET() {
  const run = getCurrentRun();

  return NextResponse.json({
    status: run?.status || 'idle',
    id: run?.id || null,
    output: run?.output || '',
  });
}
