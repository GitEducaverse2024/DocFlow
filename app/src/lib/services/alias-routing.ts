import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { getInventory } from '@/lib/services/discovery';
import { getAll as getMidModels } from '@/lib/services/mid';

// ---- Types ----

export interface AliasRow {
  alias: string;
  model_key: string;
  description: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

// ---- Seed ----

export function seedAliases(): void {
  const count = (db.prepare('SELECT COUNT(*) as c FROM model_aliases').get() as { c: number }).c;
  if (count > 0) return;

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO model_aliases (alias, model_key, description, is_active) VALUES (?, ?, ?, 1)'
  );

  stmt.run('chat-rag', 'gemini-main', 'Chat RAG conversations');
  stmt.run('process-docs', 'gemini-main', 'Document processing');
  stmt.run('agent-task', 'gemini-main', 'Agent task execution');
  stmt.run('catbot', 'gemini-main', 'CatBot assistant');
  stmt.run('generate-content', 'gemini-main', 'Content generation (agents, skills, workers)');
  stmt.run('embed', 'text-embedding-3-small', 'Embedding generation');
  stmt.run('canvas-agent', 'gemini-main', 'Canvas agent nodes');
  stmt.run('canvas-format', 'gemini-main', 'Canvas output/storage formatting');

  logger.info('alias-routing', 'Seeded 8 model aliases');
}

// ---- Resolve ----

export async function resolveAlias(alias: string): Promise<string> {
  const start = Date.now();

  // 1. Look up alias in DB
  const row = db.prepare(
    'SELECT * FROM model_aliases WHERE alias = ? AND is_active = 1'
  ).get(alias) as AliasRow | undefined;

  if (!row) {
    // Unknown alias -- fall through to CHAT_MODEL env
    const envModel = process['env']['CHAT_MODEL'] || '';
    if (envModel) {
      logResolution(alias, 'unknown', envModel, true, 'alias_not_found', Date.now() - start);
      return envModel;
    }
    logResolution(alias, 'unknown', 'NONE', true, 'no_model_available', Date.now() - start);
    throw new Error(`No model available for alias "${alias}". Check alias configuration.`);
  }

  const configuredModel = row.model_key;

  // 2. Check Discovery availability
  const inventory = await getInventory();
  const availableIds = new Set(inventory.models.map((m: { model_id: string }) => m.model_id));

  if (availableIds.has(configuredModel)) {
    logResolution(alias, configuredModel, configuredModel, false, undefined, Date.now() - start);
    return configuredModel;
  }

  // 3. Same-tier MID fallback (chat aliases only, NOT embed)
  if (alias !== 'embed') {
    const midModels = getMidModels({ status: 'active' });
    const configuredMid = midModels.find((m: { model_key: string }) => m.model_key === configuredModel);
    const targetTier = configuredMid?.tier || 'Pro';

    const sameTierAlternatives = midModels
      .filter((m: { tier: string; model_key: string }) => m.tier === targetTier && m.model_key !== configuredModel)
      .map((m: { model_key: string }) => m.model_key);

    for (const alt of sameTierAlternatives) {
      if (availableIds.has(alt)) {
        logResolution(alias, configuredModel, alt, true, `same_tier_fallback:${targetTier}`, Date.now() - start);
        return alt;
      }
    }
  }

  // 4. Env fallback -- embed uses EMBEDDING_MODEL, chat uses CHAT_MODEL
  const envKey = alias === 'embed' ? 'EMBEDDING_MODEL' : 'CHAT_MODEL';
  const envModel = process['env'][envKey] || '';
  if (envModel) {
    logResolution(alias, configuredModel, envModel, true, 'env_fallback', Date.now() - start);
    return envModel;
  }

  // 5. Error -- no silent degradation
  logResolution(alias, configuredModel, 'NONE', true, 'no_model_available', Date.now() - start);
  throw new Error(
    `No model available for alias "${alias}". Configured: "${configuredModel}" is down. Check Discovery status.`
  );
}

// ---- Logging ----

function logResolution(
  alias: string,
  requested: string,
  resolved: string,
  fallback: boolean,
  reason: string | undefined,
  latencyMs: number,
): void {
  logger.info('alias-routing', `Alias resolved: ${alias} -> ${resolved}`, {
    alias,
    requested_model: requested,
    resolved_model: resolved,
    fallback_used: fallback,
    fallback_reason: reason,
    latency_ms: latencyMs,
  });
}
