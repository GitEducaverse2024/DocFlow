import { NextRequest, NextResponse } from 'next/server';
import { getLearnedEntries, setValidated, deleteLearnedEntry } from '@/lib/catbot-db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const validatedParam = searchParams.get('validated');

    const opts: { validated?: boolean } = {};
    if (validatedParam === 'true') opts.validated = true;
    else if (validatedParam === 'false') opts.validated = false;

    const entries = getLearnedEntries(opts);
    return NextResponse.json({ entries });
  } catch (error) {
    logger.error('Failed to get learned entries', { error });
    return NextResponse.json({ error: 'Failed to load entries' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action } = body as { id: string; action: string };

    if (!id || !action) {
      return NextResponse.json({ error: 'Missing id or action' }, { status: 400 });
    }

    if (action === 'validate') {
      setValidated(id, true);
      return NextResponse.json({ success: true, action: 'validated' });
    } else if (action === 'reject') {
      deleteLearnedEntry(id);
      return NextResponse.json({ success: true, action: 'rejected' });
    } else {
      return NextResponse.json({ error: 'Invalid action. Use validate or reject' }, { status: 400 });
    }
  } catch (error) {
    logger.error('Failed to update learned entry', { error });
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
  }
}
