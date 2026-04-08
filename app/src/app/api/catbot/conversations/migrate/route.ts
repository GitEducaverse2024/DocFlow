import { NextRequest, NextResponse } from 'next/server';
import { saveConversation } from '@/lib/catbot-db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Non-empty messages array required' }, { status: 400 });
    }

    const id = saveConversation({
      userId: 'web:default',
      channel: 'web',
      messages: messages as Record<string, unknown>[],
    });

    logger.info('[api/catbot/conversations/migrate] Migrated localStorage messages', {
      count: messages.length,
      conversationId: id,
    });

    return NextResponse.json({ id, migrated: messages.length });
  } catch (err) {
    logger.error('[api/catbot/conversations/migrate] POST error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
