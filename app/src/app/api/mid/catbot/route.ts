import { NextRequest } from 'next/server';
import { midToMarkdown } from '@/lib/services/mid';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const detail = request.nextUrl.searchParams.get('detail') || 'compact';
    const markdown = midToMarkdown(detail === 'compact');

    return new Response(markdown, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (e) {
    logger.error('mid', 'Error generating CatBot markdown', { error: (e as Error).message });
    return new Response('', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
