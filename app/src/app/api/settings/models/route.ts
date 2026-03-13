import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cacheGet, cacheSet } from '@/lib/cache';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface ApiKeyRow {
  provider: string;
  api_key: string | null;
  endpoint: string | null;
  test_status: string;
  is_active: number;
}

// Model IDs use LiteLLM routing prefixes so they work directly with the gateway
const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ['openai/gpt-4o', 'openai/gpt-4o-mini'],
  anthropic: ['anthropic/claude-sonnet-4-6', 'anthropic/claude-opus-4-6'],
  google: ['gemini/gemini-2.5-pro', 'gemini/gemini-2.5-flash'],
};

async function fetchLiteLLMModels(endpoint: string, key: string | null): Promise<string[]> {
  try {
    const headers: Record<string, string> = {};
    if (key) headers['Authorization'] = `Bearer ${key}`;
    const res = await fetch(`${endpoint}/v1/models`, { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map((m: { id: string }) => m.id);
  } catch {
    return [];
  }
}

async function fetchOllamaModels(endpoint: string): Promise<string[]> {
  try {
    const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  }
}

const CACHE_KEY = 'settings:models';
const CACHE_TTL = 300_000;

export async function GET() {
  const cached = cacheGet<unknown[]>(CACHE_KEY);
  if (cached) return NextResponse.json(cached);

  try {
    const rows = db.prepare('SELECT * FROM api_keys WHERE is_active = 1').all() as ApiKeyRow[];

    const groups: { provider: string; name: string; models: string[] }[] = [];

    for (const row of rows) {
      const hasKey = !!row.api_key || row.provider === 'ollama';
      if (!hasKey && row.provider !== 'litellm' && row.provider !== 'ollama') continue;

      let models: string[] = [];

      if (row.provider === 'litellm' && row.endpoint) {
        models = await fetchLiteLLMModels(row.endpoint, row.api_key);
        if (models.length > 0) {
          groups.push({ provider: 'litellm', name: 'LiteLLM (Gateway local)', models });
        }
      } else if (row.provider === 'ollama' && row.endpoint) {
        models = await fetchOllamaModels(row.endpoint);
        // Filter out embedding models for chat
        models = models.filter(m => !m.includes('embed') && !m.includes('minilm'));
        if (models.length > 0) {
          groups.push({ provider: 'ollama', name: 'Ollama (Local)', models });
        }
      } else if (PROVIDER_MODELS[row.provider]) {
        // Only show static-list providers if their API key is verified
        if (row.test_status !== 'ok') continue;
        models = PROVIDER_MODELS[row.provider];
        const names: Record<string, string> = {
          openai: 'OpenAI',
          anthropic: 'Anthropic (Claude)',
          google: 'Google (Gemini)',
        };
        groups.push({ provider: row.provider, name: names[row.provider] || row.provider, models });
      }
    }

    cacheSet(CACHE_KEY, groups, CACHE_TTL);
    return NextResponse.json(groups);
  } catch (error) {
    logger.error('settings', 'Error obteniendo modelos', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
