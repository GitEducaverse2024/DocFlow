import { NextRequest, NextResponse } from 'next/server';
import { saveConversation, getConversation, getConversations, deleteConversation } from '@/lib/catbot-db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const conv = getConversation(id);
      if (!conv) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json(conv);
    }

    const userId = searchParams.get('userId') || 'web:default';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const convs = getConversations(userId, limit);
    return NextResponse.json(convs);
  } catch (err) {
    logger.error('[api/catbot/conversations] GET error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, toolsUsed, model, page } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages array required' }, { status: 400 });
    }

    const id = saveConversation({
      userId: 'web:default',
      channel: 'web',
      messages: messages as Record<string, unknown>[],
      toolsUsed: toolsUsed as string[] | undefined,
      model: model as string | undefined,
      page: page as string | undefined,
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    logger.error('[api/catbot/conversations] POST error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    deleteConversation(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[api/catbot/conversations] DELETE error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
