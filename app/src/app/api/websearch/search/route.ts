import { NextResponse } from 'next/server';
import { withRetry } from '@/lib/retry';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface SearchResponse {
  engine: string;
  query: string;
  results: SearchResult[];
  total: number;
  fallback_used?: boolean;
}

async function searchSearXNG(query: string, maxResults: number): Promise<SearchResponse> {
  const searxngUrl = process['env']['SEARXNG_URL'];
  if (!searxngUrl) throw new Error('SEARXNG_URL not configured');

  const data = await withRetry(async () => {
    const res = await fetch(
      `${searxngUrl}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=es-ES`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) throw new Error(`SearXNG ${res.status}: ${await res.text().catch(() => '')}`);
    return res.json();
  }, { maxAttempts: 3, baseDelayMs: 1000 });

  const results: SearchResult[] = (data.results || []).slice(0, maxResults).map((r: Record<string, string>) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || '',
  }));

  return { engine: 'searxng', query, results, total: results.length };
}

async function searchGemini(query: string, maxResults: number): Promise<SearchResponse> {
  const litellmUrl = process['env']['LITELLM_URL'];
  if (!litellmUrl) throw new Error('LITELLM_URL not configured');

  const baseUrl = process['env']['NEXT_PUBLIC_BASE_URL'] || process['env']['BASE_URL'] || 'http://localhost:3500';

  const data = await withRetry(async () => {
    const res = await fetch(`${baseUrl}/api/websearch/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text().catch(() => '')}`);
    return res.json();
  }, { maxAttempts: 3, baseDelayMs: 1000 });

  const results: SearchResult[] = (data.results || []).slice(0, maxResults).map((r: Record<string, string>) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.snippet || '',
  }));

  return { engine: 'gemini', query, results, total: results.length };
}

async function searchOllama(query: string, maxResults: number): Promise<SearchResponse> {
  const apiKey = process['env']['OLLAMA_WEBSEARCH_API_KEY'];
  if (!apiKey) throw new Error('OLLAMA_WEBSEARCH_API_KEY not configured');

  const data = await withRetry(async () => {
    const res = await fetch('https://ollama.com/api/web_search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, max_results: maxResults }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => '')}`);
    return res.json();
  }, { maxAttempts: 3, baseDelayMs: 1000 });

  const results: SearchResult[] = (data.results || []).slice(0, maxResults).map((r: Record<string, string>) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.snippet || r.content || '',
  }));

  return { engine: 'ollama', query, results, total: results.length };
}

async function searchAuto(query: string, maxResults: number): Promise<SearchResponse> {
  const engines: Array<{ name: string; check: string; fn: () => Promise<SearchResponse> }> = [];

  if (process['env']['SEARXNG_URL']) {
    engines.push({ name: 'searxng', check: 'SEARXNG_URL', fn: () => searchSearXNG(query, maxResults) });
  }
  if (process['env']['LITELLM_URL']) {
    engines.push({ name: 'gemini', check: 'LITELLM_URL', fn: () => searchGemini(query, maxResults) });
  }
  if (process['env']['OLLAMA_WEBSEARCH_API_KEY']) {
    engines.push({ name: 'ollama', check: 'OLLAMA_WEBSEARCH_API_KEY', fn: () => searchOllama(query, maxResults) });
  }

  if (engines.length === 0) {
    throw new Error('No search engines configured. Set SEARXNG_URL, LITELLM_URL, or OLLAMA_WEBSEARCH_API_KEY.');
  }

  let lastError: Error | null = null;
  for (const engine of engines) {
    try {
      const result = await engine.fn();
      if (engines.indexOf(engine) > 0) {
        result.fallback_used = true;
      }
      return result;
    } catch (e) {
      lastError = e as Error;
      logger.warn('websearch', `Auto-fallback: ${engine.name} failed: ${(e as Error).message}`);
    }
  }

  throw lastError || new Error('All search engines failed');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = (body.query || '').trim();
    const engine: string = body.engine || 'auto';
    const maxResults: number = Math.min(Math.max(body.max_results || 8, 1), 20);

    if (!query) {
      return NextResponse.json({ error: 'Query es requerida' }, { status: 400 });
    }
    if (query.length > 500) {
      return NextResponse.json({ error: 'Query demasiado larga (max 500 caracteres)' }, { status: 400 });
    }

    let result: SearchResponse;

    switch (engine) {
      case 'searxng':
        result = await searchSearXNG(query, maxResults);
        break;
      case 'gemini':
        result = await searchGemini(query, maxResults);
        break;
      case 'ollama':
        result = await searchOllama(query, maxResults);
        break;
      case 'auto':
      default:
        result = await searchAuto(query, maxResults);
        break;
    }

    logger.info('websearch', `Search: "${query.slice(0, 50)}" via ${result.engine} -> ${result.total} results`);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = (error as Error).message || 'Error desconocido';
    logger.error('websearch', `Search error: ${msg}`);
    return NextResponse.json(
      { error: `Error en busqueda web: ${msg}` },
      { status: 502 }
    );
  }
}
