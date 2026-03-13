import { NextResponse } from 'next/server';
import { getUnreadCount } from '@/lib/services/notifications';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const count = getUnreadCount();
    return NextResponse.json({ count });
  } catch (error) {
    logger.error('notifications', 'Error fetching unread count', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
