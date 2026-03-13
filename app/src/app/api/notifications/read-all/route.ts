import { NextResponse } from 'next/server';
import { markAllAsRead } from '@/lib/services/notifications';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    markAllAsRead();
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('notifications', 'Error marking all notifications as read', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
