import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cacheGet, cacheSet } from '@/lib/cache';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface ApiKeyRow {
  id: string;
  provider: string;
  api_key: string | null;
  endpoint: string | null;
  is_active: number;
  last_tested: string | null;
  test_status: string;
  created_at: string;
  updated_at: string;
}

function maskKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 8) return '••••';
  return key.substring(0, 4) + '••••' + key.substring(key.length - 4);
}

const CACHE_KEY = 'settings:api-keys';
const CACHE_TTL = 300_000;

export async function GET() {
  const cached = cacheGet<unknown[]>(CACHE_KEY);
  if (cached) return NextResponse.json(cached);

  try {
    const rows = db.prepare("SELECT * FROM api_keys ORDER BY CASE provider WHEN 'openai' THEN 1 WHEN 'anthropic' THEN 2 WHEN 'google' THEN 3 WHEN 'litellm' THEN 4 WHEN 'ollama' THEN 5 END").all() as ApiKeyRow[];

    const masked = rows.map(row => ({
      ...row,
      api_key: maskKey(row.api_key),
      has_key: !!row.api_key,
    }));

    cacheSet(CACHE_KEY, masked, CACHE_TTL);
    return NextResponse.json(masked);
  } catch (error) {
    logger.error('settings', 'Error obteniendo API keys', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
