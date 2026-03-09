import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();
  
  // DocFlow stats
  let docflowStatus = 'ok';
  let dbStatus = 'ok';
  let projectsCount = 0;
  let sourcesCount = 0;
  
  try {
    db.prepare('SELECT 1').get();
    projectsCount = (db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number }).count;
    sourcesCount = (db.prepare('SELECT COUNT(*) as count FROM sources').get() as { count: number }).count;
  } catch {
    docflowStatus = 'error';
    dbStatus = 'error';
  }

  const openclawUrl = process['env']['OPENCLAW_URL'] || 'http://192.168.1.49:18789';
  const n8nUrl = process['env']['N8N_WEBHOOK_URL'] || 'http://192.168.1.49:5678';
  const qdrantUrl = process['env']['QDRANT_URL'] || 'http://192.168.1.49:6333';
  const litellmUrl = process['env']['LITELLM_URL'] || 'http://192.168.1.49:4000';
  const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';

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

  const [openclaw, n8n, qdrant, litellm] = await Promise.allSettled([
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
      const allModels = data.data?.map((m: { id: string }) => m.id) || [];
      const configured_embedding_model = process['env']['EMBEDDING_MODEL'] || 'text-embedding-3-small';
      const embedding_models = [configured_embedding_model];
      const models = allModels.filter((m: string) => !embedding_models.includes(m));
      return { models, embedding_models };
    })
  ]);

  return NextResponse.json({
    timestamp,
    docflow: {
      status: docflowStatus,
      db: dbStatus,
      projects_count: projectsCount,
      sources_count: sourcesCount
    },
    openclaw: openclaw.status === 'fulfilled' ? openclaw.value : { status: 'error', url: openclawUrl, latency_ms: null, error: 'Unknown error', agents: [] },
    n8n: n8n.status === 'fulfilled' ? n8n.value : { status: 'error', url: n8nUrl, latency_ms: null, error: 'Unknown error' },
    qdrant: qdrant.status === 'fulfilled' ? qdrant.value : { status: 'error', url: qdrantUrl, latency_ms: null, error: 'Unknown error', collections: [], collections_count: 0 },
    litellm: litellm.status === 'fulfilled' ? litellm.value : { status: 'error', url: litellmUrl, latency_ms: null, error: 'Unknown error', models: [], embedding_models: [] }
  });
}
