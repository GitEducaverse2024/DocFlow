import { NextResponse } from 'next/server';
import { ragJobs } from '@/lib/services/rag-jobs';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = ragJobs.get(id);

  if (job) {
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      chunksCount: job.chunksCount,
      chunksProcessed: job.chunksProcessed,
      chunksTotal: job.chunksTotal,
    });
  }

  // Fallback: check /tmp status file in case ragJobs Map lost the entry (server restart)
  try {
    const statusFile = path.join('/tmp', `rag-${id}.json`);
    if (fs.existsSync(statusFile)) {
      const raw = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
      return NextResponse.json({
        status: raw.status || 'running',
        progress: raw.progress || 'Procesando...',
        chunksProcessed: raw.chunksProcessed || 0,
        chunksTotal: raw.chunksTotal || 0,
        source: 'file-fallback',
      });
    }
  } catch {
    // File read error — fall through to idle
  }

  return NextResponse.json({ status: 'idle' });
}
