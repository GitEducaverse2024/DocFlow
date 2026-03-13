import { NextResponse } from 'next/server';
import { markAsRead } from '@/lib/services/notifications';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    markAsRead(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('notifications', 'Error marking notification as read', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
