import { NextResponse } from 'next/server';
import { getAllAliases } from '@/lib/services/alias-routing';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const aliases = getAllAliases();
    return NextResponse.json({ aliases });
  } catch (error) {
    logger.error('alias-routing', 'Failed to get aliases', { error });
    return NextResponse.json({ error: 'Failed to load aliases' }, { status: 500 });
  }
}
