import { NextRequest, NextResponse } from 'next/server';
import { getInventory, inventoryToMarkdown } from '@/lib/services/discovery';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const format = request.nextUrl.searchParams.get('format');
    const inventory = await getInventory();

    if (format === 'catbot') {
      return new Response(inventoryToMarkdown(inventory), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    return NextResponse.json(inventory);
  } catch (e) {
    logger.error('discovery', 'Error fetching model inventory', { error: (e as Error).message });
    return NextResponse.json(
      { error: 'Discovery failed', models: [], providers: [] },
      { status: 200 },
    );
  }
}
