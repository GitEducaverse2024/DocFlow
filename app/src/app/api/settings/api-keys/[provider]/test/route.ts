import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface ApiKeyRow {
  provider: string;
  api_key: string | null;
  endpoint: string | null;
}

async function testOpenAI(endpoint: string, key: string) {
  const res = await fetch(`${endpoint}/models`, {
    headers: { 'Authorization': `Bearer ${key}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const models = (data.data || [])
    .map((m: { id: string }) => m.id)
    .filter((id: string) => id.startsWith('gpt-') || id.startsWith('o'))
    .slice(0, 20);
  return models;
}

async function testAnthropic(endpoint: string, key: string) {
  const res = await fetch(`${endpoint}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    }),
    signal: AbortSignal.timeout(15000),
  });
  // Even a 400 with "model not found" means the key works
  if (res.status === 401) throw new Error('API key inválida');
  if (res.status === 403) throw new Error('API key sin permisos suficientes');
  // Get available models via models endpoint
  const modelsRes = await fetch(`${endpoint}/models`, {
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    signal: AbortSignal.timeout(10000),
  });
  let models = ['claude-sonnet-4-6', 'claude-opus-4-6'];
  if (modelsRes.ok) {
    const data = await modelsRes.json();
    if (data.data) {
      models = data.data.map((m: { id: string }) => m.id).slice(0, 20);
    }
  }
  return models;
}

async function testGoogle(endpoint: string, key: string) {
  const res = await fetch(`${endpoint}/models?key=${key}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const models = (data.models || [])
    .map((m: { name: string }) => m.name.replace('models/', ''))
    .filter((id: string) => id.includes('gemini'))
    .slice(0, 20);
  return models;
}

async function testLiteLLM(endpoint: string, key: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;
  const res = await fetch(`${endpoint}/v1/models`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const models = (data.data || []).map((m: { id: string }) => m.id).slice(0, 30);
  return models;
}

async function testOllama(endpoint: string) {
  const res = await fetch(`${endpoint}/api/tags`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const models = (data.models || []).map((m: { name: string }) => m.name).slice(0, 30);
  return models;
}

export async function POST(request: Request, { params }: { params: { provider: string } }) {
  try {
    const provider = params.provider;
    logger.info('settings', 'Probando API key', { provider });
    const row = db.prepare('SELECT * FROM api_keys WHERE provider = ?').get(provider) as ApiKeyRow | undefined;

    if (!row) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    const endpoint = row.endpoint || '';
    const key = row.api_key || '';

    if (!endpoint) {
      return NextResponse.json({ status: 'failed', error: 'No endpoint configured' });
    }

    if (provider !== 'ollama' && !key) {
      return NextResponse.json({ status: 'failed', error: 'No API key configured' });
    }

    let models: string[] = [];

    try {
      switch (provider) {
        case 'openai':
          models = await testOpenAI(endpoint, key);
          break;
        case 'anthropic':
          models = await testAnthropic(endpoint, key);
          break;
        case 'google':
          models = await testGoogle(endpoint, key);
          break;
        case 'litellm':
          models = await testLiteLLM(endpoint, key);
          break;
        case 'ollama':
          models = await testOllama(endpoint);
          break;
        default:
          return NextResponse.json({ status: 'failed', error: 'Unknown provider' });
      }
    } catch (e) {
      logger.error('settings', 'Test API key fallido', { provider, error: (e as Error).message });
      const now = new Date().toISOString();
      db.prepare('UPDATE api_keys SET test_status = ?, last_tested = ?, updated_at = ? WHERE provider = ?')
        .run('failed', now, now, provider);
      return NextResponse.json({ status: 'failed', error: (e as Error).message, models: [] });
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE api_keys SET test_status = ?, last_tested = ?, updated_at = ? WHERE provider = ?')
      .run('ok', now, now, provider);

    logger.info('settings', 'Test API key exitoso', { provider, modelCount: models.length });
    return NextResponse.json({ status: 'ok', models });
  } catch (error) {
    logger.error('settings', 'Error en test de API key', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
