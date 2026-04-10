import { NextResponse } from 'next/server';
import { listJobsByUser, type IntentJobRow } from '@/lib/catbot-db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/intent-jobs
 *
 * Lists intent_jobs for the current user (async CatFlow pipelines).
 * Phase 130 Plan 05 — powers the "Pipelines" tab inside Settings → Conocimiento
 * de CatBot, so users can see their running / awaiting / recent pipelines in
 * real time without having to ask CatBot.
 *
 * User resolution order:
 *   1. Server session (if auth wiring is in place — currently disabled pending
 *      a project-wide session helper, documented here so Phase 131 can drop it
 *      in without touching the route contract).
 *   2. ?user_id= query param (fallback for the current dev flow where the web
 *      client is a single-user experience keyed by 'web:default').
 *
 * Returns 401 only if neither path yields a user id.
 */
export async function GET(request: Request): Promise<NextResponse> {
  let userId: string | null = null;

  // Future: const session = await getServerSession(...); userId = session?.user?.id ?? null;

  if (!userId) {
    const url = new URL(request.url);
    userId = url.searchParams.get('user_id');
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  try {
    const rows = listJobsByUser(userId, { limit: 50 });
    const jobs = rows.map((r: IntentJobRow) => {
      let progress: Record<string, unknown> = {};
      try {
        progress = JSON.parse(r.progress_message || '{}') as Record<string, unknown>;
      } catch {
        progress = {};
      }
      return {
        id: r.id,
        pipeline_phase: r.pipeline_phase,
        status: r.status,
        tool_name: r.tool_name,
        progress_message: progress,
        canvas_id: r.canvas_id,
        channel: r.channel,
        error: r.error,
        created_at: r.created_at,
        updated_at: r.updated_at,
        completed_at: r.completed_at,
      };
    });
    return NextResponse.json({ jobs });
  } catch (err) {
    logger.error('intent-job-executor', 'GET /api/intent-jobs failed', { error: String(err) });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
