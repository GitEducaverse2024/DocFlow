import { NextResponse } from 'next/server';
import fs from 'fs';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

// DELETE /api/tasks/[id]/exports/[bundleId] — Remove bundle file and DB row
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; bundleId: string } }
) {
  const bundle = db.prepare(
    'SELECT * FROM task_bundles WHERE id = ? AND task_id = ?'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).get(params.bundleId, params.id) as any;

  if (!bundle) {
    return NextResponse.json({ error: 'Bundle not found' }, { status: 404 });
  }

  try {
    if (fs.existsSync(bundle.bundle_path)) {
      fs.unlinkSync(bundle.bundle_path);
    }
  } catch (err) {
    console.error('Failed to delete bundle file:', err);
  }

  db.prepare('DELETE FROM task_bundles WHERE id = ?').run(params.bundleId);

  return NextResponse.json({ success: true });
}
