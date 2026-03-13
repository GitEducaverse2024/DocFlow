import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cacheInvalidate } from '@/lib/cache';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: { provider: string } }) {
  try {
    const provider = params.provider;
    const body = await request.json();
    const { api_key, endpoint } = body;

    const existing = db.prepare('SELECT * FROM api_keys WHERE provider = ?').get(provider);
    if (!existing) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (api_key !== undefined) {
      updates.push('api_key = ?');
      values.push(api_key || null);
      // Reset test status when key changes
      updates.push('test_status = ?');
      values.push('untested');
    }
    if (endpoint !== undefined) {
      updates.push('endpoint = ?');
      values.push(endpoint || null);
    }

    if (updates.length === 0) {
      return NextResponse.json(existing);
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(provider);

    db.prepare(`UPDATE api_keys SET ${updates.join(', ')} WHERE provider = ?`).run(...values);

    cacheInvalidate('settings:api-keys');
    logger.info('settings', 'API key actualizada', { provider });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('settings', 'Error actualizando API key', { provider: params.provider, error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { provider: string } }) {
  try {
    const provider = params.provider;

    db.prepare('UPDATE api_keys SET api_key = NULL, test_status = ?, updated_at = ? WHERE provider = ?')
      .run('untested', new Date().toISOString(), provider);

    cacheInvalidate('settings:api-keys');
    logger.info('settings', 'API key eliminada', { provider });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('settings', 'Error eliminando API key', { provider: params.provider, error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
