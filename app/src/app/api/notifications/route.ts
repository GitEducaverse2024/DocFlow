import { NextResponse } from 'next/server';
import { getNotifications, createNotification } from '@/lib/services/notifications';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, message, severity, type, link } = body;

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    createNotification({
      type: type || 'system',
      title: String(title).slice(0, 200),
      message: message ? String(message).slice(0, 1000) : undefined,
      severity: severity || 'error',
      link: link || undefined,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    logger.error('notifications', 'Error creating notification', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

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
