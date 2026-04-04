export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAllAliases, updateAlias } from '@/lib/services/alias-routing';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const aliases = getAllAliases();
    return NextResponse.json({ aliases });
  } catch (e) {
    logger.error('alias-routing', 'Error listing aliases', { error: (e as Error).message });
    return NextResponse.json({ aliases: [], error: (e as Error).message }, { status: 200 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const alias = typeof body?.alias === 'string' ? body.alias.trim() : '';
    const model_key = typeof body?.model_key === 'string' ? body.model_key.trim() : '';

    if (!alias || !model_key) {
      return NextResponse.json({ error: 'Missing alias or model_key' }, { status: 400 });
    }

    const updated = updateAlias(alias, model_key);
    return NextResponse.json({ updated });
  } catch (e) {
    logger.error('alias-routing', 'Error updating alias', { error: (e as Error).message });
    return NextResponse.json({ error: (e as Error).message }, { status: 200 });
  }
}
