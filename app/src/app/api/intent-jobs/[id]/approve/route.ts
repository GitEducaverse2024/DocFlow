import { NextResponse } from 'next/server';
import { getIntentJob, updateIntentJob } from '@/lib/catbot-db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const job = getIntentJob(params.id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  if (job.pipeline_phase !== 'awaiting_approval') {
    return NextResponse.json(
      { error: `Job is in phase ${job.pipeline_phase}, cannot approve` },
      { status: 400 },
    );
  }
  if (!job.canvas_id) {
    return NextResponse.json({ error: 'Job has no canvas_id' }, { status: 400 });
  }

  updateIntentJob(job.id, { pipeline_phase: 'running', status: 'running' });

  const baseUrl =
    process['env']['INTERNAL_BASE_URL'] ||
    `http://localhost:${process['env']['PORT'] || 3000}`;

  // Fire-and-forget: the executor tick + AlertService handle stuck cases.
  fetch(`${baseUrl}/api/canvas/${job.canvas_id}/execute`, { method: 'POST' }).catch(err => {
    logger.warn('intent-job-executor', 'canvas execute kick failed', {
      jobId: job.id,
      canvasId: job.canvas_id,
      error: (err as Error).message,
    });
  });

  return NextResponse.json({ ok: true, canvas_id: job.canvas_id });
}
