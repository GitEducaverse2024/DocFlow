import { NextResponse } from 'next/server';
import { getNotifications } from '@/lib/services/notifications';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const type = searchParams.get('type') || undefined;
    const severity = searchParams.get('severity') || undefined;

    const result = getNotifications({ limit, offset, type, severity });

    return NextResponse.json({
      notifications: result.notifications,
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    logger.error('notifications', 'Error fetching notifications', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
