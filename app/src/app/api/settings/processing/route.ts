import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cacheGet, cacheSet, cacheInvalidate } from '@/lib/cache';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const DEFAULTS: Record<string, string> = {
  'processing.maxTokens': '50000',
  'processing.autoTruncate': 'true',
  'processing.includeMetadata': 'true',
};

const CACHE_KEY = 'settings:processing';
const CACHE_TTL = 300_000;

export async function GET() {
  const cached = cacheGet<Record<string, unknown>>(CACHE_KEY);
  if (cached) return NextResponse.json(cached);

  try {
    const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'processing.%'").all() as { key: string; value: string }[];
    const result: Record<string, string> = { ...DEFAULTS };
    for (const row of rows) {
      result[row.key] = row.value;
    }

    const data = {
      maxTokens: parseInt(result['processing.maxTokens'], 10),
      autoTruncate: result['processing.autoTruncate'] === 'true',
      includeMetadata: result['processing.includeMetadata'] === 'true',
    };

    cacheSet(CACHE_KEY, data, CACHE_TTL);
    return NextResponse.json(data);
  } catch (error) {
    logger.error('settings', 'Error leyendo configuracion de procesamiento', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const now = new Date().toISOString();
    const upsert = db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at');

    if (body.maxTokens !== undefined) {
      const val = Math.max(10000, Math.min(500000, parseInt(body.maxTokens, 10) || 50000));
      upsert.run('processing.maxTokens', String(val), now);
    }
    if (body.autoTruncate !== undefined) {
      upsert.run('processing.autoTruncate', body.autoTruncate ? 'true' : 'false', now);
    }
    if (body.includeMetadata !== undefined) {
      upsert.run('processing.includeMetadata', body.includeMetadata ? 'true' : 'false', now);
    }

    cacheInvalidate(CACHE_KEY);
    logger.info('settings', 'Configuracion de procesamiento actualizada');
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('settings', 'Error actualizando configuracion de procesamiento', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
