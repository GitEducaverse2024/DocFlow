import { NextRequest, NextResponse } from 'next/server';
import { getAll, create } from '@/lib/services/mid';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get('status') || undefined;
    const models = getAll({ status });
    return NextResponse.json({ models });
  } catch (e) {
    logger.error('mid', 'Error listing MID entries', { error: (e as Error).message });
    return NextResponse.json({ models: [], error: (e as Error).message }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { model_key, display_name, provider } = body;
    if (!model_key || !display_name || !provider) {
      return NextResponse.json(
        { error: 'Missing required fields: model_key, display_name, provider' },
        { status: 400 },
      );
    }

    const id = create({
      model_key,
      display_name,
      provider,
      tier: body.tier,
      best_use: body.best_use,
      capabilities: body.capabilities,
      cost_tier: body.cost_tier,
      cost_notes: body.cost_notes,
      scores: body.scores,
      status: body.status,
    });

    return NextResponse.json({ id, created: true }, { status: 201 });
  } catch (e) {
    logger.error('mid', 'Error creating MID entry', { error: (e as Error).message });
    return NextResponse.json({ error: (e as Error).message }, { status: 200 });
  }
}
