/**
 * DiscoveryService — Unified model discovery across all providers.
 *
 * Consolidates scattered model listing into a single service with:
 * - Parallel provider querying via Promise.allSettled
 * - TTL-based caching (5 min)
 * - Graceful degradation (partial results if providers are down)
 * - Lazy initialization (no side effects at module load)
 */

import { withRetry } from '../retry';
import { logger } from '@/lib/logger';
import { cacheGet, cacheSet } from '@/lib/cache';
import db from '@/lib/db';

// ---- Types ----

export interface DiscoveredModel {
  /** Unique ID: "provider/model_id" */
  id: string;
  /** Display name */
  name: string;
  /** Provider source */
  provider: 'ollama' | 'openai' | 'anthropic' | 'google' | 'litellm';
  /** Raw model identifier from the API */
  model_id: string;
  /** Whether the model runs locally */
  is_local: boolean;
  /** Size in MB (Ollama only) */
  size_mb: number | null;
  /** Parameter count string, e.g. "8B" */
  parameter_size: string | null;
  /** Model family, e.g. "llama" */
  family: string | null;
  /** Quantization level */
  quantization: string | null;
  /** Whether this is an embedding model */
  is_embedding: boolean;
  /** Last modification timestamp (Ollama only) */
  modified_at: string | null;
}

export interface ProviderStatus {
  provider: string;
  status: 'connected' | 'disconnected' | 'no_key';
  latency_ms: number | null;
  error: string | null;
  model_count: number;
}

export interface ModelInventory {
  models: DiscoveredModel[];
  providers: ProviderStatus[];
  cached_at: string;
  ttl_ms: number;
  is_stale: boolean;
}

// ---- Constants ----

const CACHE_KEY = 'discovery:inventory';
const CACHE_TTL = 300_000; // 5 minutes

const OLLAMA_URL = process['env']['OLLAMA_URL'] || 'http://docflow-ollama:11434';
const LITELLM_URL = process['env']['LITELLM_URL'] || 'http://localhost:4000';
const LITELLM_API_KEY = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';

// Known embedding model patterns
const EMBEDDING_PATTERNS = [
  'embed', 'minilm', 'bge-', 'gte-', 'e5-',
  'text-embedding', 'embedding',
];

// ---- Internal DB type ----

interface ApiKeyRow {
  provider: string;
  api_key: string | null;
  endpoint: string | null;
  test_status: string;
  is_active: number;
}

// ---- Provider Discovery Functions ----

/**
 * Discover all models from the local Ollama instance.
 * Returns empty array on failure (graceful degradation).
 */
export async function discoverOllama(): Promise<DiscoveredModel[]> {
  try {
    const res = await withRetry(async () => {
      const r = await fetch(`${OLLAMA_URL}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    }, { maxAttempts: 2, baseDelayMs: 500 });

    const data = await res.json();
    const models = (data.models || []) as Array<{
      name: string;
      size: number;
      modified_at?: string;
      details?: { family?: string; parameter_size?: string; quantization_level?: string };
    }>;

    return models.map((m): DiscoveredModel => {
      const baseName = m.name.split(':')[0];
      const isEmbedding = EMBEDDING_PATTERNS.some(p =>
        baseName.toLowerCase().includes(p)
      );

      return {
        id: `ollama/${m.name}`,
        name: baseName,
        provider: 'ollama',
        model_id: m.name,
        is_local: true,
        size_mb: Math.round(m.size / 1024 / 1024),
        parameter_size: m.details?.parameter_size || null,
        family: m.details?.family || null,
        quantization: m.details?.quantization_level || null,
        is_embedding: isEmbedding,
        modified_at: m.modified_at || null,
      };
    });
  } catch (err) {
    logger.warn('system', 'Ollama discovery failed', {
      error: (err as Error).message,
    });
    return [];
  }
}

/**
 * Discover models from a cloud API provider.
 * Uses the exact auth patterns from the existing test route.
 * Returns empty array on failure (graceful degradation).
 */
export async function discoverProvider(
  provider: 'openai' | 'anthropic' | 'google',
  endpoint: string,
  apiKey: string,
): Promise<DiscoveredModel[]> {
  try {
    let res: Response;

    switch (provider) {
      case 'openai': {
        res = await withRetry(async () => {
          const r = await fetch(`${endpoint}/models`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(10000),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r;
        }, { maxAttempts: 2 });

        const data = await res.json();
        const allModels = (data.data || []) as Array<{ id: string }>;

        // Filter to chat-capable models
        return allModels
          .filter((m) =>
            m.id.startsWith('gpt-') ||
            m.id.startsWith('o') ||
            m.id.startsWith('chatgpt')
          )
          .map((m): DiscoveredModel => ({
            id: `openai/${m.id}`,
            name: m.id,
            provider: 'openai',
            model_id: m.id,
            is_local: false,
            size_mb: null,
            parameter_size: null,
            family: null,
            quantization: null,
            is_embedding: m.id.includes('embedding'),
            modified_at: null,
          }));
      }

      case 'anthropic': {
        res = await withRetry(async () => {
          const r = await fetch(`${endpoint}/models`, {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            signal: AbortSignal.timeout(10000),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r;
        }, { maxAttempts: 2 });

        const data = await res.json();
        const models = (data.data || []) as Array<{ id: string }>;

        // DISC-07: If models endpoint returns empty, return empty (no fallback list)
        return models.map((m): DiscoveredModel => ({
          id: `anthropic/${m.id}`,
          name: m.id,
          provider: 'anthropic',
          model_id: m.id,
          is_local: false,
          size_mb: null,
          parameter_size: null,
          family: 'claude',
          quantization: null,
          is_embedding: false,
          modified_at: null,
        }));
      }

      case 'google': {
        // Google uses key in query param, NOT header
        res = await withRetry(async () => {
          const r = await fetch(`${endpoint}/models?key=${apiKey}`, {
            signal: AbortSignal.timeout(10000),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r;
        }, { maxAttempts: 2 });

        const data = await res.json();
        const allModels = (data.models || []) as Array<{ name: string }>;

        // Filter to gemini models, strip 'models/' prefix
        return allModels
          .filter((m) => m.name.replace('models/', '').includes('gemini'))
          .map((m): DiscoveredModel => {
            const modelId = m.name.replace('models/', '');
            return {
              id: `google/${modelId}`,
              name: modelId,
              provider: 'google',
              model_id: modelId,
              is_local: false,
              size_mb: null,
              parameter_size: null,
              family: 'gemini',
              quantization: null,
              is_embedding: modelId.includes('embedding'),
              modified_at: null,
            };
          });
      }

      default:
        return [];
    }
  } catch (err) {
    logger.warn('system', `${provider} discovery failed`, {
      error: (err as Error).message,
    });
    return [];
  }
}

/**
 * Discover models available through LiteLLM proxy.
 */
async function discoverLiteLLM(): Promise<DiscoveredModel[]> {
  try {
    const res = await withRetry(async () => {
      const r = await fetch(`${LITELLM_URL}/v1/models`, {
        headers: { 'Authorization': `Bearer ${LITELLM_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    }, { maxAttempts: 2 });

    const data = await res.json();
    const models = (data.data || []) as Array<{ id: string }>;

    return models.map((m): DiscoveredModel => ({
      id: `litellm/${m.id}`,
      name: m.id,
      provider: 'litellm',
      model_id: m.id,
      is_local: false,
      size_mb: null,
      parameter_size: null,
      family: null,
      quantization: null,
      is_embedding: m.id.includes('embedding'),
      modified_at: null,
    }));
  } catch (err) {
    logger.warn('system', 'LiteLLM discovery failed', {
      error: (err as Error).message,
    });
    return [];
  }
}

/**
 * Helper to time a discovery function and build a ProviderStatus.
 */
async function timedDiscover(
  providerName: string,
  fn: () => Promise<DiscoveredModel[]>,
): Promise<{ models: DiscoveredModel[]; status: ProviderStatus }> {
  const start = Date.now();
  try {
    const models = await fn();
    const latency = Date.now() - start;
    return {
      models,
      status: {
        provider: providerName,
        status: models.length > 0 ? 'connected' : 'disconnected',
        latency_ms: latency,
        error: null,
        model_count: models.length,
      },
    };
  } catch (err) {
    const latency = Date.now() - start;
    return {
      models: [],
      status: {
        provider: providerName,
        status: 'disconnected',
        latency_ms: latency,
        error: (err as Error).message,
        model_count: 0,
      },
    };
  }
}

/**
 * Discover all available models across all active providers.
 * Uses Promise.allSettled for parallel execution with graceful degradation.
 */
export async function discoverAll(): Promise<ModelInventory> {
  // Always discover Ollama + LiteLLM
  const discoveryTasks: Array<Promise<{ models: DiscoveredModel[]; status: ProviderStatus }>> = [
    timedDiscover('ollama', discoverOllama),
    timedDiscover('litellm', discoverLiteLLM),
  ];

  // Read active API providers from database
  try {
    const rows = db.prepare(
      'SELECT provider, api_key, endpoint, test_status, is_active FROM api_keys WHERE is_active = 1'
    ).all() as ApiKeyRow[];

    for (const row of rows) {
      if (['openai', 'anthropic', 'google'].includes(row.provider) && row.api_key && row.endpoint) {
        const provider = row.provider as 'openai' | 'anthropic' | 'google';
        discoveryTasks.push(
          timedDiscover(provider, () => discoverProvider(provider, row.endpoint!, row.api_key!)),
        );
      }
    }
  } catch (err) {
    logger.warn('system', 'Failed to read api_keys table', {
      error: (err as Error).message,
    });
  }

  // Execute all in parallel
  const results = await Promise.allSettled(discoveryTasks);

  const allModels: DiscoveredModel[] = [];
  const allStatuses: ProviderStatus[] = [];
  const seenModelIds = new Set<string>();

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { models, status } = result.value;
      allStatuses.push(status);

      // Deduplicate: if same model_id exists from a direct provider, skip litellm version
      for (const model of models) {
        if (!seenModelIds.has(model.model_id)) {
          seenModelIds.add(model.model_id);
          allModels.push(model);
        }
      }
    } else {
      // Promise.allSettled should not reject, but handle defensively
      logger.error('system', 'Discovery task rejected unexpectedly', {
        reason: result.reason?.message || String(result.reason),
      });
    }
  }

  return {
    models: allModels,
    providers: allStatuses,
    cached_at: new Date().toISOString(),
    ttl_ms: CACHE_TTL,
    is_stale: false,
  };
}

/**
 * Get the model inventory, using cache when available.
 * Lazy — first call triggers discovery, not module load.
 *
 * @param forceRefresh - bypass cache and re-discover all providers
 */
export async function getInventory(forceRefresh?: boolean): Promise<ModelInventory> {
  if (!forceRefresh) {
    const cached = cacheGet<ModelInventory>(CACHE_KEY);
    if (cached) {
      return cached;
    }
  }

  const inventory = await discoverAll();
  cacheSet(CACHE_KEY, inventory, CACHE_TTL);

  logger.info('system', 'Model inventory refreshed', {
    models: inventory.models.length,
    providers: inventory.providers.length,
  });

  return inventory;
}

/**
 * Format a ModelInventory as readable Markdown.
 * Groups models by provider with status headers.
 */
export function inventoryToMarkdown(inventory: ModelInventory): string {
  const lines: string[] = [];

  lines.push('# Model Inventory');
  lines.push('');
  lines.push(`Discovered at: ${inventory.cached_at}`);
  lines.push(`TTL: ${inventory.ttl_ms / 1000}s | Stale: ${inventory.is_stale}`);
  lines.push('');

  // Group models by provider
  const byProvider = new Map<string, DiscoveredModel[]>();
  for (const model of inventory.models) {
    const existing = byProvider.get(model.provider) || [];
    existing.push(model);
    byProvider.set(model.provider, existing);
  }

  // Provider sections
  for (const status of inventory.providers) {
    const emoji = status.status === 'connected' ? '[OK]' : '[DOWN]';
    lines.push(`## ${status.provider} ${emoji} (${status.status})`);
    if (status.latency_ms !== null) {
      lines.push(`Latency: ${status.latency_ms}ms | Models: ${status.model_count}`);
    }
    if (status.error) {
      lines.push(`Error: ${status.error}`);
    }
    lines.push('');

    const models = byProvider.get(status.provider) || [];
    if (models.length === 0) {
      lines.push('_No models discovered_');
    } else {
      for (const m of models) {
        const tags: string[] = [];
        if (m.is_local) tags.push('local');
        if (m.is_embedding) tags.push('embedding');
        else tags.push('chat');
        if (m.parameter_size) tags.push(m.parameter_size);
        if (m.size_mb) tags.push(`${m.size_mb}MB`);

        lines.push(`- **${m.name}** (\`${m.model_id}\`) [${tags.join(', ')}]`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
