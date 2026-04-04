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

// ---- CRUD ----

export function getAllAliases(opts?: { active_only?: boolean }): AliasRow[] {
  const query = opts?.active_only
    ? 'SELECT * FROM model_aliases WHERE is_active = 1 ORDER BY alias'
    : 'SELECT * FROM model_aliases ORDER BY alias';
  return db.prepare(query).all() as AliasRow[];
}

export function updateAlias(alias: string, newModelKey: string): AliasRow {
  if (!newModelKey || newModelKey.trim() === '') {
    throw new Error('New model key cannot be empty');
  }

  const result = db.prepare(
    "UPDATE model_aliases SET model_key = ?, updated_at = datetime('now') WHERE alias = ?"
  ).run(newModelKey, alias);

  if (result.changes === 0) {
    throw new Error(`Alias "${alias}" not found`);
  }

  const updated = db.prepare('SELECT * FROM model_aliases WHERE alias = ?').get(alias) as AliasRow;

  logger.info('alias-routing', `Alias updated: ${alias} -> ${newModelKey}`, {
    alias,
    new_model: newModelKey,
  });

  return updated;
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
  const availableIds = new Set(inventory.models.map((m: { id: string }) => m.id));

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

/**
 * MIGRATION CHECKLIST (ALIAS-01)
 * Verified: 2026-04-04 via grep audit of app/src/
 *
 * Plan 02 (Easy migrations -- generation routes + CatPaw + Task executor):
 * - [ ] app/api/agents/generate/route.ts:18 -> resolveAlias('generate-content')
 * - [ ] app/api/skills/generate/route.ts:15 -> resolveAlias('generate-content')
 * - [ ] app/api/workers/generate/route.ts:15 -> resolveAlias('generate-content')
 * - [ ] app/api/testing/generate/route.ts:100 -> resolveAlias('generate-content')
 * - [ ] lib/services/execute-catpaw.ts:465 -> resolveAlias('agent-task')
 * - [ ] lib/services/task-executor.ts:22,33,499,570 -> resolveAlias('agent-task')
 * - [ ] lib/services/catbot-tools.ts:867,870 -> resolveAlias('agent-task')
 * - [ ] app/api/cat-paws/[id]/chat/route.ts:480 -> resolveAlias('agent-task')
 * - [ ] app/api/cat-paws/route.ts:74 -> resolveAlias('agent-task')
 * - [ ] lib/services/bundle-importer.ts:144 -> resolveAlias('generate-content')
 *
 * Plan 03 (Hard migrations -- CatBot + Chat RAG + Canvas + Doc processing):
 * - [ ] app/api/catbot/chat/route.ts:321 -> resolveAlias('catbot')
 * - [ ] app/api/catbrains/[id]/chat/route.ts:92 -> resolveAlias('chat-rag')
 * - [ ] lib/services/canvas-executor.ts:112,505,1366,1393 -> resolveAlias('canvas-agent')
 * - [ ] lib/services/canvas-executor.ts:1535 -> resolveAlias('canvas-format')
 * - [ ] app/api/catbrains/[id]/process/route.ts:286,567 -> resolveAlias('process-docs')
 * - [ ] lib/services/execute-catbrain.ts:142 -> resolveAlias('process-docs')
 *
 * KEEP as-is (DB seeds / UI defaults / schema DEFAULTs / compatibility):
 * - lib/db.ts:257,288,347,408,907,1176,1302,1315 (per-entity direct configs & schema defaults)
 * - components/catbot/catbot-panel.tsx:106 (UI useState default, Phase 111)
 * - app/settings/page.tsx:820 (UI default, Phase 111)
 * - app/agents/new/page.tsx:228 (UI component default, Phase 111)
 * - lib/services/litellm.ts:48 (resolveModel fallback -- compatibility layer)
 * - lib/services/litellm.ts:59 (getEmbeddings default -- compatibility layer)
 * - app/api/catbrains/[id]/rag/info/route.ts:52 (vector size detection, not a model selection)
 * - lib/services/catbot-tools.ts:58 (schema description text, not runtime)
 * - lib/services/alias-routing.ts:27-34 (seed data for this service)
 * - lib/services/bundle-generator.test.ts:120 (test fixture)
 */

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
