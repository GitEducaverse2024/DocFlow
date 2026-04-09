import { NextRequest, NextResponse } from 'next/server';
import { getKnowledgeGaps, resolveKnowledgeGap } from '@/lib/catbot-db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const resolvedParam = searchParams.get('resolved');
    const area = searchParams.get('area');

    const opts: { resolved?: boolean; knowledgePath?: string } = {};
    if (resolvedParam === 'true') opts.resolved = true;
    else if (resolvedParam === 'false') opts.resolved = false;
    if (area) opts.knowledgePath = area;

    const gaps = getKnowledgeGaps(opts);
    return NextResponse.json({ gaps });
  } catch (error) {
    logger.error('catbot', 'Failed to get knowledge gaps', { error });
    return NextResponse.json({ error: 'Failed to load gaps' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action } = body as { id: string; action: string };

    if (!id || !action) {
      return NextResponse.json({ error: 'Missing id or action' }, { status: 400 });
    }

    if (action === 'resolve') {
      resolveKnowledgeGap(id);
      return NextResponse.json({ success: true, action: 'resolved' });
    } else {
      return NextResponse.json({ error: 'Invalid action. Use resolve' }, { status: 400 });
    }
  } catch (error) {
    logger.error('catbot', 'Failed to update knowledge gap', { error });
    return NextResponse.json({ error: 'Failed to update gap' }, { status: 500 });
  }
}
