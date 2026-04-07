export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { checkHealth } from '@/lib/services/health';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    const result = await checkHealth(force ? { force: true } : undefined);

    return NextResponse.json(result);
  } catch (err) {
    const message = (err as Error).message;
    logger.error('health', 'Health check API failed', { error: message });

    return NextResponse.json(
      { error: 'Health check failed', message },
      { status: 500 }
    );
  }
}
