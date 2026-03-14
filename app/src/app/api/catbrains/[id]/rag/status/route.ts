import { NextResponse } from 'next/server';
import { ragJobs } from '@/lib/services/rag-jobs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = ragJobs.get(id);

  if (!job) {
    return NextResponse.json({ status: 'idle' });
  }

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
