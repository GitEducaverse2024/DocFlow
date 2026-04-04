import { NextResponse } from 'next/server';
import { getInventory } from '@/lib/services/discovery';
import { syncFromDiscovery, getAll } from '@/lib/services/mid';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const inventory = await getInventory(true);
    const { created, skipped } = syncFromDiscovery(inventory);
    const totalInMid = getAll({ status: 'all' }).length;

    return NextResponse.json({ created, skipped, total_in_mid: totalInMid });
  } catch (e) {
    logger.error('mid', 'Error syncing from Discovery', { error: (e as Error).message });
    return NextResponse.json(
      { created: 0, skipped: 0, error: (e as Error).message },
      { status: 200 },
    );
  }
}
