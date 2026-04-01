import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';

export const dynamic = 'force-dynamic';

interface AssetRow {
  id: string;
  local_path: string | null;
  mime_type: string | null;
  filename: string;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { id: templateId, assetId } = await params;

  const asset = db.prepare(
    'SELECT * FROM template_assets WHERE id = ? AND template_id = ?'
  ).get(assetId, templateId) as AssetRow | undefined;

  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  if (!asset.local_path || !fs.existsSync(asset.local_path)) {
    return NextResponse.json({ error: 'Asset file not found on disk' }, { status: 404 });
  }

  const buffer = fs.readFileSync(asset.local_path);
  const contentType = asset.mime_type || 'application/octet-stream';

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${asset.filename}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { id: templateId, assetId } = await params;

  const asset = db.prepare(
    'SELECT * FROM template_assets WHERE id = ? AND template_id = ?'
  ).get(assetId, templateId) as AssetRow | undefined;

  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

  if (asset.local_path && fs.existsSync(asset.local_path)) {
    fs.unlinkSync(asset.local_path);
  }

  db.prepare('DELETE FROM template_assets WHERE id = ?').run(assetId);
  return NextResponse.json({ deleted: true });
}
