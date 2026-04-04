import { NextResponse } from 'next/server';
import { getInventory } from '@/lib/services/discovery';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const inventory = await getInventory(true);

    logger.info('discovery', 'Inventario refrescado manualmente', {
      models: inventory.models.length,
      providers: inventory.providers.length,
    });

    return NextResponse.json({ status: 'refreshed', inventory });
  } catch (e) {
    logger.error('discovery', 'Error refreshing model inventory', { error: (e as Error).message });
    return NextResponse.json(
      { status: 'error', error: (e as Error).message },
      { status: 200 },
    );
  }
}
