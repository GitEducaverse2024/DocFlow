/**
 * MidService -- Model Intelligence Document
 *
 * Core service for storing, querying, and exporting LLM model intelligence.
 * Provides CRUD operations, seed data management, CatBot markdown export,
 * and sync from Discovery service.
 */

import db from '@/lib/db';
import { generateId } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { cacheGet, cacheSet } from '@/lib/cache';

// ---- Types ----

/** Raw DB row -- JSON fields are strings */
export interface MidRow {
  id: string;
  model_key: string;
  display_name: string;
  provider: string;
  tier: string;
  best_use: string | null;
  capabilities: string | null;
  cost_tier: string | null;
  cost_notes: string | null;
  scores: string | null;
  status: string;
  auto_created: number;
  created_at: string;
  updated_at: string;
}

/** Parsed entry -- JSON fields are objects */
export interface MidEntry {
  id: string;
  model_key: string;
  display_name: string;
  provider: string;
  tier: string;
  best_use: string | null;
  capabilities: string[];
  cost_tier: string | null;
  cost_notes: string | null;
  scores: Record<string, number>;
  status: string;
  auto_created: number;
  created_at: string;
  updated_at: string;
}

export interface CreateMidInput {
  model_key: string;
  display_name: string;
  provider: string;
  tier?: string;
  best_use?: string;
  capabilities?: string[];
  cost_tier?: string;
  cost_notes?: string;
  scores?: Record<string, number>;
  status?: string;
}

export interface UpdateMidInput {
  display_name?: string;
  tier?: string;
  best_use?: string;
  capabilities?: string[];
  cost_tier?: string;
  cost_notes?: string;
  scores?: Record<string, number>;
  status?: string;
}

export interface ModelInventory {
  models: DiscoveredModelLike[];
  providers: unknown[];
  cached_at: string;
  ttl_ms: number;
  is_stale: boolean;
}

interface DiscoveredModelLike {
  id: string;
  name: string;
  provider: string;
  is_local: boolean;
  is_embedding?: boolean;
}

// ---- Helpers ----

function parseRow(row: MidRow): MidEntry {
  let capabilities: string[] = [];
  let scores: Record<string, number> = {};

  if (row.capabilities) {
    try {
      capabilities = JSON.parse(row.capabilities);
    } catch {
      capabilities = [];
    }
  }

  if (row.scores) {
    try {
      scores = JSON.parse(row.scores);
    } catch {
      scores = {};
    }
  }

  return {
    id: row.id,
    model_key: row.model_key,
    display_name: row.display_name,
    provider: row.provider,
    tier: row.tier,
    best_use: row.best_use,
    capabilities,
    cost_tier: row.cost_tier,
    cost_notes: row.cost_notes,
    scores,
    status: row.status,
    auto_created: row.auto_created,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---- CRUD ----

export function getAll(opts?: { status?: string }): MidEntry[] {
  let query = 'SELECT * FROM model_intelligence';
  const params: string[] = [];

  if (opts?.status && opts.status === 'all') {
    // No WHERE clause -- return everything
  } else if (opts?.status) {
    query += ' WHERE status = ?';
    params.push(opts.status);
  } else {
    query += " WHERE status != 'retired'";
  }

  query += ' ORDER BY tier, display_name';

  const rows = db.prepare(query).all(...params) as MidRow[];
  return rows.map(parseRow);
}

export function getById(id: string): MidEntry | null {
  const row = db.prepare('SELECT * FROM model_intelligence WHERE id = ?').get(id) as MidRow | null;
  if (!row) return null;
  return parseRow(row);
}

export function create(data: CreateMidInput): string {
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO model_intelligence
     (id, model_key, display_name, provider, tier, best_use, capabilities, cost_tier, cost_notes, scores, status, auto_created, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    id,
    data.model_key,
    data.display_name,
    data.provider,
    data.tier || 'Libre',
    data.best_use || null,
    data.capabilities ? JSON.stringify(data.capabilities) : null,
    data.cost_tier || 'free',
    data.cost_notes || null,
    data.scores ? JSON.stringify(data.scores) : null,
    data.status || 'active',
    now,
    now,
  );

  return id;
}

export function update(id: string, data: Partial<UpdateMidInput>): boolean {
  const updates: string[] = [];
  const values: unknown[] = [];

  const allowedFields = ['display_name', 'tier', 'best_use', 'cost_tier', 'cost_notes', 'status'];
  for (const field of allowedFields) {
    if ((data as Record<string, unknown>)[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push((data as Record<string, unknown>)[field]);
    }
  }

  // JSON fields need stringify
  if (data.capabilities !== undefined) {
    updates.push('capabilities = ?');
    values.push(JSON.stringify(data.capabilities));
  }
  if (data.scores !== undefined) {
    updates.push('scores = ?');
    values.push(JSON.stringify(data.scores));
  }

  if (updates.length === 0) return false;

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  const result = db.prepare(
    `UPDATE model_intelligence SET ${updates.join(', ')} WHERE id = ?`
  ).run(...values);

  return (result as { changes: number }).changes > 0;
}

// ---- Seed Data ----

export function seedModels(): void {
  const count = (db.prepare('SELECT COUNT(*) as c FROM model_intelligence').get() as { c: number }).c;
  if (count > 0) {
    return;
  }

  const now = new Date().toISOString();
  const seed = db.prepare(
    `INSERT OR IGNORE INTO model_intelligence
     (id, model_key, display_name, provider, tier, best_use, capabilities, cost_tier, cost_notes, scores, status, auto_created, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  );

  // ---- Elite Tier ----

  seed.run(generateId(), 'anthropic/claude-opus-4', 'Claude Opus 4', 'anthropic', 'Elite',
    'Razonamiento complejo, analisis profundo, tareas criticas de alta precision',
    '["function_calling","thinking","200k_context","vision"]',
    'premium', '$15/$75 por 1M tokens',
    '{"reasoning":10,"coding":9,"creativity":9,"speed":5,"multilingual":9}',
    'active', now, now);

  seed.run(generateId(), 'anthropic/claude-sonnet-4', 'Claude Sonnet 4', 'anthropic', 'Elite',
    'Equilibrio optimo entre calidad y velocidad, ideal para coding y analisis',
    '["function_calling","thinking","200k_context","vision"]',
    'high', '$3/$15 por 1M tokens',
    '{"reasoning":9,"coding":9,"creativity":8,"speed":7,"multilingual":9}',
    'active', now, now);

  seed.run(generateId(), 'google/gemini-2.5-pro', 'Gemini 2.5 Pro', 'google', 'Elite',
    'Razonamiento avanzado, contexto largo 1M tokens, multimodal completo',
    '["function_calling","thinking","1m_context","vision","audio"]',
    'high', '$1.25/$10 por 1M tokens',
    '{"reasoning":9,"coding":9,"creativity":8,"speed":6,"multilingual":9}',
    'active', now, now);

  // ---- Pro Tier ----

  seed.run(generateId(), 'anthropic/claude-haiku-3.5', 'Claude Haiku 3.5', 'anthropic', 'Pro',
    'Respuestas rapidas y eficientes, buen equilibrio coste-rendimiento',
    '["function_calling","200k_context","vision"]',
    'low', '$0.25/$1.25 por 1M tokens',
    '{"reasoning":7,"coding":7,"creativity":7,"speed":9,"multilingual":8}',
    'active', now, now);

  seed.run(generateId(), 'openai/gpt-4o', 'GPT-4o', 'openai', 'Pro',
    'Uso general rapido y fiable, buena integracion de herramientas',
    '["function_calling","128k_context","vision"]',
    'medium', '$5/$15 por 1M tokens',
    '{"reasoning":8,"coding":8,"creativity":8,"speed":8,"multilingual":8}',
    'active', now, now);

  seed.run(generateId(), 'openai/gpt-4o-mini', 'GPT-4o Mini', 'openai', 'Pro',
    'Version ligera de GPT-4o, ideal para tareas simples de alto volumen',
    '["function_calling","128k_context","vision"]',
    'low', '$0.15/$0.60 por 1M tokens',
    '{"reasoning":7,"coding":7,"creativity":7,"speed":9,"multilingual":7}',
    'active', now, now);

  seed.run(generateId(), 'google/gemini-2.5-flash', 'Gemini 2.5 Flash', 'google', 'Pro',
    'Modelo rapido de Google, buen rendimiento en tareas generales',
    '["function_calling","1m_context","vision"]',
    'low', '$0.15/$0.60 por 1M tokens',
    '{"reasoning":7,"coding":7,"creativity":7,"speed":9,"multilingual":8}',
    'active', now, now);

  seed.run(generateId(), 'ollama/qwen3:32b', 'Qwen 3 32B', 'ollama', 'Pro',
    'Modelo local potente, bueno en razonamiento y multilingue',
    '["function_calling","thinking","32k_context"]',
    'free', 'Gratuito (local)',
    '{"reasoning":8,"coding":7,"creativity":7,"speed":6,"multilingual":8}',
    'active', now, now);

  // ---- Libre Tier ----

  seed.run(generateId(), 'ollama/gemma3:4b', 'Gemma 3 4B (E4B)', 'ollama', 'Libre',
    'Modelo ultraligero local, ideal para tareas simples y clasificacion rapida',
    '["chat","4k_context"]',
    'free', 'Gratuito (local)',
    '{"reasoning":5,"coding":4,"creativity":5,"speed":10,"multilingual":6}',
    'active', now, now);

  seed.run(generateId(), 'ollama/gemma3:12b', 'Gemma 3 12B', 'ollama', 'Libre',
    'Modelo local equilibrado, bueno para tareas generales sin coste',
    '["chat","8k_context"]',
    'free', 'Gratuito (local)',
    '{"reasoning":6,"coding":6,"creativity":6,"speed":8,"multilingual":7}',
    'active', now, now);

  seed.run(generateId(), 'ollama/gemma3:27b', 'Gemma 3 27B (E26B)', 'ollama', 'Libre',
    'Modelo local potente, calidad cercana a modelos comerciales para muchas tareas',
    '["chat","function_calling","8k_context"]',
    'free', 'Gratuito (local)',
    '{"reasoning":7,"coding":7,"creativity":7,"speed":6,"multilingual":7}',
    'active', now, now);

  seed.run(generateId(), 'ollama/gemma4:27b', 'Gemma 4 27B (E26B)', 'ollama', 'Libre',
    'Gemma 4 local, mejoras en razonamiento y funcion calling respecto a Gemma 3',
    '["chat","function_calling","thinking","8k_context"]',
    'free', 'Gratuito (local)',
    '{"reasoning":8,"coding":7,"creativity":7,"speed":6,"multilingual":7}',
    'active', now, now);

  seed.run(generateId(), 'ollama/gemma4:2b', 'Gemma 4 2B (E2B)', 'ollama', 'Libre',
    'Modelo minimo local, clasificacion y embeddings basicos',
    '["chat","2k_context"]',
    'free', 'Gratuito (local)',
    '{"reasoning":4,"coding":3,"creativity":4,"speed":10,"multilingual":5}',
    'active', now, now);

  seed.run(generateId(), 'ollama/llama3.3:70b', 'Llama 3.3 70B', 'ollama', 'Libre',
    'Modelo Meta grande, excelente razonamiento local para tareas complejas',
    '["chat","function_calling","128k_context"]',
    'free', 'Gratuito (local)',
    '{"reasoning":8,"coding":8,"creativity":7,"speed":4,"multilingual":7}',
    'active', now, now);

  seed.run(generateId(), 'ollama/mistral:7b', 'Mistral 7B', 'ollama', 'Libre',
    'Modelo local ligero y rapido, bueno para tareas de texto simples',
    '["chat","32k_context"]',
    'free', 'Gratuito (local)',
    '{"reasoning":6,"coding":5,"creativity":6,"speed":9,"multilingual":6}',
    'active', now, now);

  seed.run(generateId(), 'ollama/qwen3:8b', 'Qwen 3 8B', 'ollama', 'Libre',
    'Modelo local con buen rendimiento multilingue y razonamiento',
    '["chat","thinking","32k_context"]',
    'free', 'Gratuito (local)',
    '{"reasoning":7,"coding":6,"creativity":6,"speed":8,"multilingual":8}',
    'active', now, now);

  seed.run(generateId(), 'ollama/gemma4:e4b', 'Gemma 4 E4B', 'ollama', 'Pro',
    'Gemma 4 E4B (~9.6GB, fits 16GB VRAM sin offload). Multimodal (texto+imagen), thinking mode, function calling, contexto 256K. Modelo local Pro principal para RAG largo y razonamiento en RTX 5080.',
    '["chat","function_calling","thinking","vision","256k_context"]',
    'free', 'Gratuito (local)',
    '{"reasoning":8,"coding":7,"creativity":7,"speed":8,"multilingual":8}',
    'active', now, now);

  seed.run(generateId(), 'ollama/gemma4:31b', 'Gemma 4 31B (Q4, requires >16GB VRAM)', 'ollama', 'Pro',
    'Gemma 4 31B cuantizado Q4 (~19GB). En hardware 16GB VRAM (RTX 5080) sufre offload CPU/GPU (~35s por prompt simple). Solo viable con >=24GB VRAM. Capacidades: multimodal, thinking, function calling, contexto 256K.',
    '["chat","function_calling","thinking","vision","256k_context"]',
    'free', 'Gratuito (local)',
    '{"reasoning":9,"coding":8,"creativity":7,"speed":3,"multilingual":8}',
    'active', now, now);

  logger.info('mid', `Seeded ${18} models into model_intelligence table`);
}

// ---- Markdown Export ----

const CACHE_KEY_FULL = 'mid:markdown:full';
const CACHE_KEY_COMPACT = 'mid:markdown:compact';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function midToMarkdown(compact?: boolean): string {
  const cacheKey = compact ? CACHE_KEY_COMPACT : CACHE_KEY_FULL;
  const cached = cacheGet<string>(cacheKey);
  if (cached) return cached;

  const models = db.prepare(
    "SELECT * FROM model_intelligence WHERE status != 'retired' ORDER BY tier, display_name"
  ).all() as MidRow[];

  const lines: string[] = ['# Inteligencia de Modelos (MID)\n'];

  const byTier: Record<string, MidRow[]> = { Elite: [], Pro: [], Libre: [] };
  for (const m of models) {
    const bucket = byTier[m.tier] || byTier['Pro'];
    bucket.push(m);
  }

  for (const [tier, tierModels] of Object.entries(byTier)) {
    if (tierModels.length === 0) continue;
    lines.push(`## ${tier}\n`);

    for (const m of tierModels) {
      if (compact) {
        // Compact: 1-2 lines per model
        const statusTag = m.status === 'inactive' ? ' [INACTIVO]' : '';
        let caps = '';
        try { caps = JSON.parse(m.capabilities || '[]').join(', '); } catch { /* skip */ }
        lines.push(`- **${m.display_name}** (${m.provider})${statusTag}: ${m.best_use || 'Sin descripcion'}${caps ? ` | ${caps}` : ''}`);
      } else {
        // Full: 4-6 lines per model
        lines.push(`### ${m.display_name} (${m.provider})`);
        if (m.best_use) lines.push(`Mejor uso: ${m.best_use}`);
        if (m.cost_notes) lines.push(`Coste: ${m.cost_notes}`);
        if (m.capabilities) {
          try {
            const caps = JSON.parse(m.capabilities);
            lines.push(`Capacidades: ${caps.join(', ')}`);
          } catch { /* skip malformed */ }
        }
        if (m.scores) {
          try {
            const scores = JSON.parse(m.scores);
            const scoreStr = Object.entries(scores).map(([k, v]) => `${k}:${v}/10`).join(' | ');
            lines.push(`Scores: ${scoreStr}`);
          } catch { /* skip malformed */ }
        }
        if (m.status === 'inactive') lines.push('[INACTIVO]');
        lines.push('');
      }
    }

    if (compact) lines.push('');
  }

  const result = lines.join('\n');
  cacheSet(cacheKey, result, CACHE_TTL);
  return result;
}

// ---- Sync from Discovery ----

export function syncFromDiscovery(inventory: ModelInventory): { created: number; skipped: number } {
  const existing = new Set(
    (db.prepare('SELECT model_key FROM model_intelligence').all() as { model_key: string }[])
      .map(r => r.model_key)
  );

  let created = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  const insertStmt = db.prepare(
    `INSERT INTO model_intelligence
     (id, model_key, display_name, provider, tier, best_use, capabilities, status, auto_created, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );

  for (const model of inventory.models) {
    if (existing.has(model.id)) {
      skipped++;
      continue;
    }

    const tier = model.is_local ? 'Libre' : 'Pro';
    insertStmt.run(
      generateId(),
      model.id,
      model.name,
      model.provider,
      tier,
      'Auto-detectado -- pendiente de clasificacion manual',
      JSON.stringify(model.is_embedding ? ['embedding'] : ['chat']),
      'active',
      now,
      now,
    );
    created++;
  }

  if (created > 0) {
    logger.info('mid', `Synced from Discovery: ${created} created, ${skipped} skipped`);
  }

  return { created, skipped };
}
