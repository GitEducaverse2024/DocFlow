import { NextResponse } from 'next/server';
import { getKnowledgeStats } from '@/lib/catbot-db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stats = getKnowledgeStats();
    return NextResponse.json(stats);
  } catch (error) {
    logger.error('catbot', 'Failed to get knowledge stats', { error });
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
  }
}
