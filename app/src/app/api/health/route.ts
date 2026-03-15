import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cacheGet, cacheSet } from '@/lib/cache';
// logger available via '@/lib/logger' — not imported as health has no error catch blocks

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'health';
const CACHE_TTL = 30_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fresh = searchParams.get('fresh') === '1';

  if (!fresh) {
    const cached = cacheGet<Record<string, unknown>>(CACHE_KEY);
    if (cached) return NextResponse.json(cached);
  }

  const timestamp = new Date().toISOString();

  // DocFlow stats
  let docflowStatus = 'ok';
  let dbStatus = 'ok';
  let projectsCount = 0;
  let sourcesCount = 0;
  let catpawsCount = 0;

  let dbLatencyMs: number | null = null;
  try {
    const dbStart = Date.now();
    db.prepare('SELECT 1').get();
    dbLatencyMs = Date.now() - dbStart;
    projectsCount = (db.prepare('SELECT COUNT(*) as count FROM catbrains').get() as { count: number }).count;
    sourcesCount = (db.prepare('SELECT COUNT(*) as count FROM sources').get() as { count: number }).count;
    catpawsCount = (db.prepare('SELECT COUNT(*) as c FROM cat_paws WHERE is_active = 1').get() as { c: number }).c;
  } catch {
    docflowStatus = 'error';
    dbStatus = 'error';
  }

  const openclawUrl = process['env']['OPENCLAW_URL'] || 'http://localhost:18789';
  const n8nUrl = process['env']['N8N_WEBHOOK_URL'] || 'http://localhost:5678';
  const qdrantUrl = process['env']['QDRANT_URL'] || 'http://localhost:6333';
  const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
  const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
  const ollamaUrl = process['env']['OLLAMA_URL'] || 'http://docflow-ollama:11434';

  const checkService = async (name: string, url: string, fetchFn: () => Promise<Record<string, unknown>>) => {
    const start = Date.now();
    try {
      const result = await fetchFn();
      const latency = Date.now() - start;
      return { status: 'connected', url, latency_ms: latency, error: null, ...result };
    } catch (error: unknown) {
      const latency = Date.now() - start;
      let errorMsg = (error as Error).message;
      if ((error as Error).name === 'AbortError' || errorMsg.includes('timeout')) {
        errorMsg = 'Timeout (5s)';
      } else if ((error as { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED') {
        errorMsg = 'ECONNREFUSED';
      }
      return { status: 'disconnected', url, latency_ms: latency, error: errorMsg };
    }
  };

  const linkedinMcpUrl = process['env']['LINKEDIN_MCP_URL'];

  const [openclaw, n8n, qdrant, litellm, ollamaCheck, linkedinMcpCheck] = await Promise.allSettled([
    checkService('openclaw', openclawUrl, async () => {
      await fetch(`${openclawUrl}/`, { signal: AbortSignal.timeout(5000) });
      return { agents: [] };
    }),
    checkService('n8n', n8nUrl, async () => {
      const res = await fetch(`${n8nUrl}/healthz`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return {};
    }),
    checkService('qdrant', qdrantUrl, async () => {
      const res = await fetch(`${qdrantUrl}/collections`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const collections = data.result?.collections?.map((c: { name: string }) => c.name) || [];
      return { collections, collections_count: collections.length };
    }),
    checkService('litellm', litellmUrl, async () => {
      const res = await fetch(`${litellmUrl}/v1/models`, {
        headers: { 'Authorization': `Bearer ${litellmKey}` },
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const models = data.data?.map((m: { id: string }) => m.id) || [];
      return { models };
    }),
    checkService('ollama', ollamaUrl, async () => {
      const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const models = (data.models || []).map((m: { name: string }) => m.name);
      return { models, embedding_provider: true };
    }),
    linkedinMcpUrl
      ? checkService('linkedin_mcp', linkedinMcpUrl, async () => {
          const res = await fetch(linkedinMcpUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'docatflow-health', version: '1.0' } } }),
            signal: AbortSignal.timeout(3000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return { configured: true };
        })
      : Promise.resolve({ status: 'fulfilled', value: null } as never)
  ]);

  const data = {
    timestamp,
    docflow: {
      status: docflowStatus,
      db: dbStatus,
      latency_ms: dbLatencyMs,
      projects_count: projectsCount,
      sources_count: sourcesCount,
      catpaws_count: catpawsCount
    },
    openclaw: openclaw.status === 'fulfilled' ? openclaw.value : { status: 'error', url: openclawUrl, latency_ms: null, error: 'Unknown error', agents: [] },
    n8n: n8n.status === 'fulfilled' ? n8n.value : { status: 'error', url: n8nUrl, latency_ms: null, error: 'Unknown error' },
    qdrant: qdrant.status === 'fulfilled' ? qdrant.value : { status: 'error', url: qdrantUrl, latency_ms: null, error: 'Unknown error', collections: [], collections_count: 0 },
    litellm: litellm.status === 'fulfilled' ? litellm.value : { status: 'error', url: litellmUrl, latency_ms: null, error: 'Unknown error', models: [] },
    ollama: ollamaCheck.status === 'fulfilled' ? ollamaCheck.value : { status: 'error', url: ollamaUrl, latency_ms: null, error: 'Unknown error', models: [] },
    ...(linkedinMcpUrl ? {
      linkedin_mcp: linkedinMcpCheck.status === 'fulfilled' && linkedinMcpCheck.value
        ? { ...linkedinMcpCheck.value, configured: true }
        : { status: 'disconnected', url: linkedinMcpUrl, latency_ms: null, error: 'Unknown error', configured: true }
    } : {})
  };

  cacheSet(CACHE_KEY, data, CACHE_TTL);
  return NextResponse.json(data);
}
