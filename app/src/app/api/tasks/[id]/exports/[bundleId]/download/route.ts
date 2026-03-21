import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/tasks/[id]/exports/[bundleId]/download — Serve ZIP file
export async function GET(
  request: Request,
  { params }: { params: { id: string; bundleId: string } }
) {
  const bundle = db.prepare(
    'SELECT * FROM task_bundles WHERE id = ? AND task_id = ?'
  ).get(params.bundleId, params.id) as any;

  if (!bundle) {
    return NextResponse.json({ error: 'Bundle not found' }, { status: 404 });
  }

  if (!fs.existsSync(bundle.bundle_path)) {
    return NextResponse.json({ error: 'Bundle file missing from disk' }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(bundle.bundle_path);
  const filename = path.basename(bundle.bundle_path);

  return new Response(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(fileBuffer.length),
    },
  });
}
