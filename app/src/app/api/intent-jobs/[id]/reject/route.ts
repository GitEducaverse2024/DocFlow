import { NextResponse } from 'next/server';
import { getIntentJob, updateIntentJob } from '@/lib/catbot-db';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const job = getIntentJob(params.id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  updateIntentJob(job.id, {
    pipeline_phase: 'cancelled',
    status: 'cancelled',
    error: 'User rejected',
  });

  return NextResponse.json({ ok: true });
}
