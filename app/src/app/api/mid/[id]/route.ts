import { NextRequest, NextResponse } from 'next/server';
import { getById, update } from '@/lib/services/mid';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const entry = getById(params.id);
    if (!entry) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(entry);
  } catch (e) {
    logger.error('mid', 'Error fetching MID entry', { error: (e as Error).message });
    return NextResponse.json({ error: (e as Error).message }, { status: 200 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json();

    const allowedFields = [
      'display_name', 'tier', 'best_use', 'capabilities',
      'cost_tier', 'cost_notes', 'scores', 'status',
    ];
    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No editable fields provided' },
        { status: 400 },
      );
    }

    const updated = update(params.id, updateData);
    if (!updated) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ updated: true });
  } catch (e) {
    logger.error('mid', 'Error updating MID entry', { error: (e as Error).message });
    return NextResponse.json({ error: (e as Error).message }, { status: 200 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const retired = update(params.id, { status: 'retired' });
    if (!retired) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ retired: true });
  } catch (e) {
    logger.error('mid', 'Error retiring MID entry', { error: (e as Error).message });
    return NextResponse.json({ error: (e as Error).message }, { status: 200 });
  }
}
