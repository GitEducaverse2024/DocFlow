import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/tasks/[id]/exports — List all export bundles for a task
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const bundles = db.prepare(
    'SELECT id, task_id, bundle_name, manifest, created_at FROM task_bundles WHERE task_id = ? ORDER BY created_at DESC'
  ).all(params.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = bundles.map((b: any) => ({
    ...b,
    manifest: b.manifest ? JSON.parse(b.manifest) : null,
  }));

  return NextResponse.json(result);
}
