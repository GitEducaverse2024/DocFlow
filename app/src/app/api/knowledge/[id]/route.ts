/**
 * GET /api/knowledge/[id] — Phase 154 Plan 02 read-only handler.
 *
 * Byte-for-byte the canonical pattern from `api/catbrains/[id]/route.ts`.
 * Delegates to `kb-index-cache.getKbEntry(id)`; no auth, read-only.
 */
import { NextResponse } from 'next/server';
import { getKbEntry } from '@/lib/services/kb-index-cache';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const entry = getKbEntry(id);
  if (!entry) {
    return NextResponse.json({ error: 'NOT_FOUND', id }, { status: 404 });
  }
  return NextResponse.json(entry);
}
