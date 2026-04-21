import { NextResponse } from 'next/server';
import { litellm } from '@/lib/services/litellm';
import { ollama } from '@/lib/services/ollama';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// Well-known embedding models that can be pulled (shown as suggestions when not installed)
const SUGGESTED_MODELS = [
  { name: 'qwen3-embedding:0.6b', description: '#1 MTEB multilingual, 1024 dims, 32K ctx, MRL', size_mb: 639 },
  { name: 'qwen3-embedding:4b', description: 'Alta calidad multilingual, 2560 dims, MRL', size_mb: 2500 },
  { name: 'bge-m3', description: 'Hybrid search (dense+sparse), 1024 dims', size_mb: 1200 },
  { name: 'snowflake-arctic-embed2', description: 'Rapido multilingual, 1024 dims, MRL', size_mb: 1200 },
  { name: 'nomic-embed-text', description: 'Rapido EN, 768 dims', size_mb: 274 },
  { name: 'mxbai-embed-large', description: 'Preciso EN, 1024 dims', size_mb: 670 },
  { name: 'all-minilm', description: 'Ultra-ligero EN, 384 dims', size_mb: 46 },
];

// Phase 158 (v30.0): shape enriched from model_intelligence JOIN. Flat root — no
// `capabilities: {...}` nesting. Consumers (UI + CatBot tools) read fields directly.
type ModelRow = {
  model_key: string;
  display_name: string | null;
  provider: string | null;
  tier: string | null;
  cost_tier: string | null;
  supports_reasoning: number | null; // SQLite INTEGER 0/1 — coerced to boolean below
  max_tokens_cap: number | null;
  is_local: number | null;
};

type ModelInfo = {
  id: string;
  display_name: string | null;
  provider: string | null;
  tier: string | null;
  cost_tier: string | null;
  supports_reasoning: boolean | null;
  max_tokens_cap: number | null;
  is_local: boolean | null;
};

function toBoolOrNull(v: number | null | undefined): boolean | null {
  if (v === null || v === undefined) return null;
  return v === 1;
}

/**
 * Load the model_intelligence snapshot into a Map<model_key, row>.
 *
 * On failure (e.g. cold start pre-158-01 where the table or columns don't exist),
 * returns an empty Map so callers produce the "enriched fields = null" fallback shape.
 * This keeps the endpoint live during schema drift rather than 500-ing.
 */
function loadIntelligenceMap(): Map<string, ModelRow> {
  try {
    const rows = db.prepare(
      `SELECT model_key, display_name, provider, tier, cost_tier,
              supports_reasoning, max_tokens_cap, is_local
       FROM model_intelligence`
    ).all() as ModelRow[];
    const map = new Map<string, ModelRow>();
    for (const r of rows) map.set(r.model_key, r);
    return map;
  } catch (err) {
    logger.warn('system', 'api/models: model_intelligence query failed; falling back to null-enriched shape', {
      error: (err as Error).message,
    });
    return new Map();
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  try {
    if (type === 'embedding') {
      // Unchanged from v8.0 — dynamically detect embedding models from Ollama
      const embeddingModels = await ollama.listEmbeddingModels();

      const installed = embeddingModels.map(m => ({
        name: m.name,
        full_name: m.full_name,
        size_mb: m.size_mb,
        family: m.family,
        parameter_size: m.parameter_size,
        supports_mrl: m.supports_mrl,
        mrl_dims: m.mrl_dims,
        native_dims: m.native_dims,
      }));

      const installedNames = installed.map(m => m.name);
      const suggestions = SUGGESTED_MODELS
        .filter(s => !installedNames.includes(s.name.split(':')[0]))
        .map(s => ({ ...s, installed: false }));

      return NextResponse.json({ installed, suggestions });
    }

    // Default: LiteLLM chat models, enriched with model_intelligence (Phase 158, v30.0)
    // Response list is driven by LiteLLM availability — models present only in
    // model_intelligence are intentionally not surfaced.
    const litellmIds = await litellm.getAvailableModels();
    const intelligenceMap = loadIntelligenceMap();

    const models: ModelInfo[] = litellmIds.map((id: string) => {
      const row = intelligenceMap.get(id);
      return {
        id,
        display_name: row?.display_name ?? null,
        provider: row?.provider ?? null,
        tier: row?.tier ?? null,
        cost_tier: row?.cost_tier ?? null,
        supports_reasoning: toBoolOrNull(row?.supports_reasoning ?? null),
        max_tokens_cap: row?.max_tokens_cap ?? null,
        is_local: toBoolOrNull(row?.is_local ?? null),
      };
    });

    return NextResponse.json({ models });
  } catch (err) {
    logger.error('system', 'api/models: unhandled error; returning empty payload', {
      error: (err as Error).message,
    });
    return NextResponse.json({ models: [], installed: [], suggestions: [] });
  }
}
