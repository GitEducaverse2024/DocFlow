import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { generateId } from '@/lib/utils';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Database connection (follows exact pattern from db.ts)
// ---------------------------------------------------------------------------

const catbotDbPath = process['env']['CATBOT_DB_PATH']
  || path.join(process.cwd(), 'data', 'catbot.db');

const dbDir = path.dirname(catbotDbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const catbotDb = new Database(catbotDbPath);

// Enable WAL mode for better concurrent read/write performance
// Wrapped in try-catch to avoid SQLITE_BUSY during Next.js build
try {
  catbotDb.pragma('journal_mode = WAL');
  catbotDb.pragma('busy_timeout = 5000');
} catch {
  // Build-time: DB may be locked by parallel imports, WAL will be set at runtime
}

// ---------------------------------------------------------------------------
// Schema: 5 tables
// ---------------------------------------------------------------------------

catbotDb.exec(`
  CREATE TABLE IF NOT EXISTS user_profiles (
    id TEXT PRIMARY KEY,
    display_name TEXT,
    channel TEXT DEFAULT 'web',
    personality_notes TEXT,
    communication_style TEXT,
    preferred_format TEXT,
    known_context TEXT DEFAULT '{}',
    initial_directives TEXT,
    interaction_count INTEGER DEFAULT 0,
    last_seen TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_memory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    trigger_patterns TEXT NOT NULL,
    steps TEXT NOT NULL,
    preferences TEXT DEFAULT '{}',
    source_conversation_id TEXT,
    success_count INTEGER DEFAULT 0,
    last_used TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversation_log (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'web:default',
    channel TEXT DEFAULT 'web',
    messages TEXT NOT NULL,
    tools_used TEXT DEFAULT '[]',
    token_count INTEGER DEFAULT 0,
    model TEXT,
    page TEXT,
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT
  );

  CREATE TABLE IF NOT EXISTS summaries (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'web:default',
    period_type TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    summary TEXT NOT NULL,
    topics TEXT DEFAULT '[]',
    tools_used TEXT DEFAULT '[]',
    decisions TEXT DEFAULT '[]',
    pending TEXT DEFAULT '[]',
    conversation_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS knowledge_learned (
    id TEXT PRIMARY KEY,
    knowledge_path TEXT NOT NULL,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    learned_from TEXT DEFAULT 'usage',
    confidence REAL DEFAULT 0.5,
    validated INTEGER DEFAULT 0,
    access_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS knowledge_gaps (
    id TEXT PRIMARY KEY,
    knowledge_path TEXT,
    query TEXT NOT NULL,
    context TEXT,
    reported_at TEXT DEFAULT (datetime('now')),
    resolved INTEGER DEFAULT 0,
    resolved_at TEXT
  );

  CREATE TABLE IF NOT EXISTS intents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    channel TEXT DEFAULT 'web',
    original_request TEXT NOT NULL,
    parsed_goal TEXT,
    steps TEXT DEFAULT '[]',
    current_step INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    result TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_intents_status ON intents(status);
  CREATE INDEX IF NOT EXISTS idx_intents_user_status ON intents(user_id, status);

  CREATE TABLE IF NOT EXISTS intent_jobs (
    id TEXT PRIMARY KEY,
    intent_id TEXT,
    user_id TEXT NOT NULL,
    channel TEXT DEFAULT 'web',
    channel_ref TEXT,
    pipeline_phase TEXT DEFAULT 'pending',
    tool_name TEXT,
    tool_args TEXT,
    canvas_id TEXT,
    status TEXT DEFAULT 'pending',
    progress_message TEXT DEFAULT '{}',
    result TEXT,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_intent_jobs_status ON intent_jobs(status);
  CREATE INDEX IF NOT EXISTS idx_intent_jobs_user_status ON intent_jobs(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_intent_jobs_phase ON intent_jobs(pipeline_phase);
`);

logger.info('catbot', 'Database initialized', { path: catbotDbPath });

// ---------------------------------------------------------------------------
// TypeScript Row Types
// ---------------------------------------------------------------------------

export interface ConversationRow {
  id: string;
  user_id: string;
  channel: string;
  messages: string; // JSON
  tools_used: string; // JSON
  token_count: number;
  model: string | null;
  page: string | null;
  started_at: string;
  ended_at: string | null;
}

export interface ProfileRow {
  id: string;
  display_name: string | null;
  channel: string;
  personality_notes: string | null;
  communication_style: string | null;
  preferred_format: string | null;
  known_context: string; // JSON
  initial_directives: string | null;
  interaction_count: number;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryRow {
  id: string;
  user_id: string;
  trigger_patterns: string; // JSON
  steps: string; // JSON
  preferences: string; // JSON
  source_conversation_id: string | null;
  success_count: number;
  last_used: string | null;
  created_at: string;
}

export interface SummaryRow {
  id: string;
  user_id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  summary: string;
  topics: string; // JSON
  tools_used: string; // JSON
  decisions: string; // JSON
  pending: string; // JSON
  conversation_count: number;
  created_at: string;
}

export interface LearnedRow {
  id: string;
  knowledge_path: string;
  category: string;
  content: string;
  learned_from: string;
  confidence: number;
  validated: number;
  access_count: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeGapRow {
  id: string;
  knowledge_path: string | null;
  query: string;
  context: string | null;
  reported_at: string;
  resolved: number;
  resolved_at: string | null;
}

export interface IntentRow {
  id: string;
  user_id: string;
  channel: string;
  original_request: string;
  parsed_goal: string | null;
  steps: string; // JSON array of { tool, args?, description? }
  current_step: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'abandoned';
  attempts: number;
  last_error: string | null;
  result: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface IntentJobRow {
  id: string;
  intent_id: string | null;
  user_id: string;
  channel: string;
  channel_ref: string | null;
  pipeline_phase:
    | 'pending'
    | 'strategist'
    | 'decomposer'
    | 'architect'
    | 'awaiting_approval'
    | 'awaiting_user'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled';
  tool_name: string | null;
  tool_args: string | null; // JSON
  canvas_id: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress_message: string; // JSON
  result: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// ---------------------------------------------------------------------------
// CRUD: conversation_log
// ---------------------------------------------------------------------------

export function saveConversation(conv: {
  userId?: string;
  channel?: string;
  messages: Record<string, unknown>[];
  toolsUsed?: string[];
  tokenCount?: number;
  model?: string;
  page?: string;
}): string {
  const id = generateId();
  catbotDb.prepare(`
    INSERT INTO conversation_log (id, user_id, channel, messages, tools_used, token_count, model, page)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    conv.userId ?? 'web:default',
    conv.channel ?? 'web',
    JSON.stringify(conv.messages),
    JSON.stringify(conv.toolsUsed ?? []),
    conv.tokenCount ?? 0,
    conv.model ?? null,
    conv.page ?? null,
  );
  return id;
}

export function getConversation(id: string): ConversationRow | undefined {
  return catbotDb.prepare('SELECT * FROM conversation_log WHERE id = ?').get(id) as ConversationRow | undefined;
}

export function getConversations(userId?: string, limit?: number): ConversationRow[] {
  if (userId) {
    return catbotDb.prepare(
      'SELECT * FROM conversation_log WHERE user_id = ? ORDER BY started_at DESC LIMIT ?'
    ).all(userId, limit ?? 100) as ConversationRow[];
  }
  return catbotDb.prepare(
    'SELECT * FROM conversation_log ORDER BY started_at DESC LIMIT ?'
  ).all(limit ?? 100) as ConversationRow[];
}

export function deleteConversation(id: string): void {
  catbotDb.prepare('DELETE FROM conversation_log WHERE id = ?').run(id);
}

// ---------------------------------------------------------------------------
// CRUD: user_profiles
// ---------------------------------------------------------------------------

export function upsertProfile(profile: {
  id: string;
  displayName?: string;
  channel?: string;
  personalityNotes?: string;
  communicationStyle?: string;
  preferredFormat?: string;
  knownContext?: Record<string, unknown>;
  initialDirectives?: string;
}): void {
  const existing = getProfile(profile.id);
  if (existing) {
    catbotDb.prepare(`
      UPDATE user_profiles SET
        display_name = COALESCE(?, display_name),
        channel = COALESCE(?, channel),
        personality_notes = COALESCE(?, personality_notes),
        communication_style = COALESCE(?, communication_style),
        preferred_format = COALESCE(?, preferred_format),
        known_context = COALESCE(?, known_context),
        initial_directives = COALESCE(?, initial_directives),
        interaction_count = interaction_count + 1,
        last_seen = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      profile.displayName ?? null,
      profile.channel ?? null,
      profile.personalityNotes ?? null,
      profile.communicationStyle ?? null,
      profile.preferredFormat ?? null,
      profile.knownContext ? JSON.stringify(profile.knownContext) : null,
      profile.initialDirectives ?? null,
      profile.id,
    );
  } else {
    catbotDb.prepare(`
      INSERT INTO user_profiles (id, display_name, channel, personality_notes, communication_style, preferred_format, known_context, initial_directives, interaction_count, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
    `).run(
      profile.id,
      profile.displayName ?? null,
      profile.channel ?? 'web',
      profile.personalityNotes ?? null,
      profile.communicationStyle ?? null,
      profile.preferredFormat ?? null,
      profile.knownContext ? JSON.stringify(profile.knownContext) : '{}',
      profile.initialDirectives ?? null,
    );
  }
}

export function getProfile(id: string): ProfileRow | undefined {
  return catbotDb.prepare('SELECT * FROM user_profiles WHERE id = ?').get(id) as ProfileRow | undefined;
}

// ---------------------------------------------------------------------------
// CRUD: user_memory
// ---------------------------------------------------------------------------

export function saveMemory(mem: {
  userId: string;
  triggerPatterns: string[];
  steps: Record<string, unknown>[];
  preferences?: Record<string, unknown>;
  sourceConversationId?: string;
}): string {
  const id = generateId();
  catbotDb.prepare(`
    INSERT INTO user_memory (id, user_id, trigger_patterns, steps, preferences, source_conversation_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    mem.userId,
    JSON.stringify(mem.triggerPatterns),
    JSON.stringify(mem.steps),
    JSON.stringify(mem.preferences ?? {}),
    mem.sourceConversationId ?? null,
  );
  return id;
}

export function getMemories(userId: string): MemoryRow[] {
  return catbotDb.prepare(
    'SELECT * FROM user_memory WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId) as MemoryRow[];
}

export function updateRecipeSuccess(id: string): void {
  catbotDb.prepare(`
    UPDATE user_memory SET success_count = success_count + 1, last_used = datetime('now') WHERE id = ?
  `).run(id);
}

export function getRecipesForUser(userId: string, limit = 20): MemoryRow[] {
  return catbotDb.prepare(
    'SELECT * FROM user_memory WHERE user_id = ? ORDER BY success_count DESC, last_used DESC LIMIT ?'
  ).all(userId, limit) as MemoryRow[];
}

export function findSimilarRecipe(userId: string, triggerPatterns: string[]): MemoryRow | undefined {
  const recipes = getMemories(userId);
  for (const recipe of recipes) {
    const existing = JSON.parse(recipe.trigger_patterns) as string[];
    const union = new Set([...triggerPatterns, ...existing]);
    const overlap = triggerPatterns.filter(t => existing.includes(t)).length;
    const jaccard = overlap / union.size;
    if (jaccard > 0.8) return recipe;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// CRUD: summaries
// ---------------------------------------------------------------------------

export function saveSummary(sum: {
  userId?: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  summary: string;
  topics?: string[];
  toolsUsed?: string[];
  decisions?: string[];
  pending?: string[];
  conversationCount?: number;
}): string {
  const id = generateId();
  catbotDb.prepare(`
    INSERT INTO summaries (id, user_id, period_type, period_start, period_end, summary, topics, tools_used, decisions, pending, conversation_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    sum.userId ?? 'web:default',
    sum.periodType,
    sum.periodStart,
    sum.periodEnd,
    sum.summary,
    JSON.stringify(sum.topics ?? []),
    JSON.stringify(sum.toolsUsed ?? []),
    JSON.stringify(sum.decisions ?? []),
    JSON.stringify(sum.pending ?? []),
    sum.conversationCount ?? 0,
  );
  return id;
}

export function getSummaries(userId?: string, periodType?: string): SummaryRow[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (userId) {
    conditions.push('user_id = ?');
    params.push(userId);
  }
  if (periodType) {
    conditions.push('period_type = ?');
    params.push(periodType);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return catbotDb.prepare(
    `SELECT * FROM summaries ${where} ORDER BY created_at DESC`
  ).all(...params) as SummaryRow[];
}

// ---------------------------------------------------------------------------
// CRUD: knowledge_learned
// ---------------------------------------------------------------------------

export function saveLearnedEntry(entry: {
  knowledgePath: string;
  category: string;
  content: string;
  learnedFrom?: string;
}): string {
  const id = generateId();
  catbotDb.prepare(`
    INSERT INTO knowledge_learned (id, knowledge_path, category, content, learned_from)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    id,
    entry.knowledgePath,
    entry.category,
    entry.content,
    entry.learnedFrom ?? 'usage',
  );
  return id;
}

export function incrementAccessCount(id: string): void {
  catbotDb.prepare(`
    UPDATE knowledge_learned SET access_count = access_count + 1, updated_at = datetime('now') WHERE id = ?
  `).run(id);
}

export function setValidated(id: string, validated: boolean): void {
  catbotDb.prepare(`
    UPDATE knowledge_learned SET validated = ?, updated_at = datetime('now') WHERE id = ?
  `).run(validated ? 1 : 0, id);
}

export function deleteLearnedEntry(id: string): void {
  catbotDb.prepare('DELETE FROM knowledge_learned WHERE id = ?').run(id);
}

export function getLearnedEntries(opts?: {
  knowledgePath?: string;
  validated?: boolean;
}): LearnedRow[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts?.knowledgePath) {
    conditions.push('knowledge_path = ?');
    params.push(opts.knowledgePath);
  }
  if (opts?.validated !== undefined) {
    conditions.push('validated = ?');
    params.push(opts.validated ? 1 : 0);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return catbotDb.prepare(
    `SELECT * FROM knowledge_learned ${where} ORDER BY created_at DESC`
  ).all(...params) as LearnedRow[];
}

// ---------------------------------------------------------------------------
// Aggregates: knowledge stats
// ---------------------------------------------------------------------------

export function getKnowledgeStats(): {
  total: number;
  staging: number;
  validated: number;
  avgAccessCount: number;
} {
  const row = catbotDb.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN validated = 0 THEN 1 ELSE 0 END) AS staging,
      SUM(CASE WHEN validated = 1 THEN 1 ELSE 0 END) AS validated,
      COALESCE(AVG(access_count), 0) AS avgAccessCount
    FROM knowledge_learned
  `).get() as { total: number; staging: number; validated: number; avgAccessCount: number };

  return {
    total: row.total ?? 0,
    staging: row.staging ?? 0,
    validated: row.validated ?? 0,
    avgAccessCount: Math.round((row.avgAccessCount ?? 0) * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// CRUD: knowledge_gaps
// ---------------------------------------------------------------------------

export function saveKnowledgeGap(gap: {
  query: string;
  knowledgePath?: string;
  context?: string;
}): string {
  const id = generateId();
  catbotDb.prepare(`
    INSERT INTO knowledge_gaps (id, knowledge_path, query, context)
    VALUES (?, ?, ?, ?)
  `).run(
    id,
    gap.knowledgePath ?? null,
    gap.query,
    gap.context ?? null,
  );
  return id;
}

export function getKnowledgeGaps(opts?: {
  resolved?: boolean;
  knowledgePath?: string;
}): KnowledgeGapRow[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts?.resolved !== undefined) {
    conditions.push('resolved = ?');
    params.push(opts.resolved ? 1 : 0);
  }
  if (opts?.knowledgePath) {
    conditions.push('knowledge_path = ?');
    params.push(opts.knowledgePath);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return catbotDb.prepare(
    `SELECT * FROM knowledge_gaps ${where} ORDER BY reported_at DESC`
  ).all(...params) as KnowledgeGapRow[];
}

export function resolveKnowledgeGap(id: string): void {
  catbotDb.prepare(`
    UPDATE knowledge_gaps SET resolved = 1, resolved_at = datetime('now') WHERE id = ?
  `).run(id);
}

// ---------------------------------------------------------------------------
// CRUD: intents (Phase 129 — Intent Queue)
// ---------------------------------------------------------------------------

export function createIntent(intent: {
  userId: string;
  channel?: string;
  originalRequest: string;
  parsedGoal?: string;
  steps?: Array<{ tool: string; args?: Record<string, unknown>; description?: string }>;
}): string {
  const id = generateId();
  catbotDb.prepare(`
    INSERT INTO intents (id, user_id, channel, original_request, parsed_goal, steps)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    intent.userId,
    intent.channel ?? 'web',
    intent.originalRequest,
    intent.parsedGoal ?? null,
    JSON.stringify(intent.steps ?? []),
  );
  return id;
}

export function updateIntentStatus(
  id: string,
  patch: {
    status?: IntentRow['status'];
    currentStep?: number;
    lastError?: string | null;
    result?: string | null;
    incrementAttempts?: boolean;
  },
): void {
  const fields: string[] = ["updated_at = datetime('now')"];
  const params: Array<string | number | null> = [];

  if (patch.status !== undefined) {
    fields.push('status = ?');
    params.push(patch.status);
    if (patch.status === 'completed' || patch.status === 'abandoned') {
      fields.push("completed_at = datetime('now')");
    }
  }
  if (patch.currentStep !== undefined) {
    fields.push('current_step = ?');
    params.push(patch.currentStep);
  }
  if (patch.lastError !== undefined) {
    fields.push('last_error = ?');
    params.push(patch.lastError);
  }
  if (patch.result !== undefined) {
    fields.push('result = ?');
    params.push(patch.result);
  }
  if (patch.incrementAttempts) {
    fields.push('attempts = attempts + 1');
  }

  params.push(id);
  catbotDb.prepare(`UPDATE intents SET ${fields.join(', ')} WHERE id = ?`).run(...params);
}

export function getIntent(id: string): IntentRow | undefined {
  return catbotDb.prepare('SELECT * FROM intents WHERE id = ?').get(id) as IntentRow | undefined;
}

export function listIntentsByUser(
  userId: string,
  opts?: { status?: IntentRow['status']; limit?: number },
): IntentRow[] {
  const where: string[] = ['user_id = ?'];
  const params: Array<string | number> = [userId];
  if (opts?.status) {
    where.push('status = ?');
    params.push(opts.status);
  }
  const limit = opts?.limit ?? 50;
  return catbotDb.prepare(
    `SELECT * FROM intents WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`,
  ).all(...params, limit) as IntentRow[];
}

export function getRetryableIntents(maxAttempts: number = 3): IntentRow[] {
  return catbotDb.prepare(
    `SELECT * FROM intents WHERE status = 'failed' AND attempts < ? ORDER BY updated_at ASC LIMIT 20`,
  ).all(maxAttempts) as IntentRow[];
}

export function countUnresolvedIntents(): number {
  const row = catbotDb.prepare(
    `SELECT COUNT(*) AS cnt FROM intents WHERE status IN ('failed','abandoned')`,
  ).get() as { cnt: number };
  return row.cnt;
}

export function abandonIntent(id: string, reason: string): void {
  catbotDb.prepare(`
    UPDATE intents
    SET status = 'abandoned', last_error = ?, completed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(reason, id);
}

// ---------------------------------------------------------------------------
// CRUD: intent_jobs (Phase 130 — async CatFlow pipeline)
// ---------------------------------------------------------------------------

export function createIntentJob(job: {
  intentId?: string;
  userId: string;
  channel?: string;
  channelRef?: string;
  toolName: string;
  toolArgs?: Record<string, unknown>;
}): string {
  const id = generateId();
  catbotDb.prepare(`
    INSERT INTO intent_jobs (id, intent_id, user_id, channel, channel_ref, tool_name, tool_args)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    job.intentId ?? null,
    job.userId,
    job.channel ?? 'web',
    job.channelRef ?? null,
    job.toolName,
    JSON.stringify(job.toolArgs ?? {}),
  );
  return id;
}

export function updateIntentJob(
  id: string,
  patch: Partial<Pick<IntentJobRow, 'pipeline_phase' | 'status' | 'canvas_id' | 'result' | 'error'>> & {
    progressMessage?: Record<string, unknown>;
  },
): void {
  const fields: string[] = ["updated_at = datetime('now')"];
  const params: Array<string | number | null> = [];

  if (patch.pipeline_phase !== undefined) {
    fields.push('pipeline_phase = ?');
    params.push(patch.pipeline_phase);
  }
  if (patch.status !== undefined) {
    fields.push('status = ?');
    params.push(patch.status);
    if (patch.status === 'completed' || patch.status === 'failed' || patch.status === 'cancelled') {
      fields.push("completed_at = datetime('now')");
    }
  }
  if (patch.canvas_id !== undefined) {
    fields.push('canvas_id = ?');
    params.push(patch.canvas_id);
  }
  if (patch.result !== undefined) {
    fields.push('result = ?');
    params.push(patch.result);
  }
  if (patch.error !== undefined) {
    fields.push('error = ?');
    params.push(patch.error);
  }
  if (patch.progressMessage !== undefined) {
    fields.push('progress_message = ?');
    params.push(JSON.stringify(patch.progressMessage));
  }

  params.push(id);
  catbotDb.prepare(`UPDATE intent_jobs SET ${fields.join(', ')} WHERE id = ?`).run(...params);
}

export function getIntentJob(id: string): IntentJobRow | undefined {
  return catbotDb.prepare('SELECT * FROM intent_jobs WHERE id = ?').get(id) as IntentJobRow | undefined;
}

export function listJobsByUser(
  userId: string,
  opts?: { status?: IntentJobRow['status']; limit?: number },
): IntentJobRow[] {
  const where: string[] = ['user_id = ?'];
  const params: Array<string | number> = [userId];
  if (opts?.status) {
    where.push('status = ?');
    params.push(opts.status);
  }
  const limit = opts?.limit ?? 20;
  return catbotDb.prepare(
    `SELECT * FROM intent_jobs WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`,
  ).all(...params, limit) as IntentJobRow[];
}

export function getNextPendingJob(): IntentJobRow | undefined {
  return catbotDb.prepare(
    `SELECT * FROM intent_jobs WHERE status = 'pending' AND pipeline_phase = 'pending' ORDER BY created_at ASC LIMIT 1`,
  ).get() as IntentJobRow | undefined;
}

export function countStuckPipelines(): number {
  const row = catbotDb.prepare(
    `SELECT COUNT(*) AS cnt FROM intent_jobs
     WHERE status = 'running' AND updated_at < datetime('now', '-30 minutes')`,
  ).get() as { cnt: number };
  return row.cnt;
}

// ---------------------------------------------------------------------------
// Admin operations
// ---------------------------------------------------------------------------

export function getAllProfiles(): ProfileRow[] {
  return catbotDb.prepare('SELECT * FROM user_profiles ORDER BY created_at DESC').all() as ProfileRow[];
}

export function countUserData(userId: string): {
  profile: boolean;
  conversations: number;
  recipes: number;
  summaries: number;
  learned: number;
} {
  const profileCount = (catbotDb.prepare('SELECT COUNT(*) as cnt FROM user_profiles WHERE id = ?').get(userId) as { cnt: number }).cnt;
  const conversations = (catbotDb.prepare('SELECT COUNT(*) as cnt FROM conversation_log WHERE user_id = ?').get(userId) as { cnt: number }).cnt;
  const recipes = (catbotDb.prepare('SELECT COUNT(*) as cnt FROM user_memory WHERE user_id = ?').get(userId) as { cnt: number }).cnt;
  const summaries = (catbotDb.prepare('SELECT COUNT(*) as cnt FROM summaries WHERE user_id = ?').get(userId) as { cnt: number }).cnt;
  const learned = (catbotDb.prepare('SELECT COUNT(*) as cnt FROM knowledge_learned').get() as { cnt: number }).cnt;

  return {
    profile: profileCount > 0,
    conversations,
    recipes,
    summaries,
    learned,
  };
}

export function deleteUserData(userId: string, dataTypes: string[]): void {
  const txn = catbotDb.transaction(() => {
    if (dataTypes.includes('profile')) {
      catbotDb.prepare('DELETE FROM user_profiles WHERE id = ?').run(userId);
    }
    if (dataTypes.includes('conversations')) {
      catbotDb.prepare('DELETE FROM conversation_log WHERE user_id = ?').run(userId);
    }
    if (dataTypes.includes('recipes')) {
      catbotDb.prepare('DELETE FROM user_memory WHERE user_id = ?').run(userId);
    }
    if (dataTypes.includes('summaries')) {
      catbotDb.prepare('DELETE FROM summaries WHERE user_id = ?').run(userId);
    }
  });
  txn();
}

// ---------------------------------------------------------------------------
// Helpers: date range queries + idempotency
// ---------------------------------------------------------------------------

export function getConversationsByDateRange(startDate: string, endDate: string, userId?: string): ConversationRow[] {
  if (userId) {
    return catbotDb.prepare(
      'SELECT * FROM conversation_log WHERE started_at >= ? AND started_at < ? AND user_id = ? ORDER BY started_at ASC'
    ).all(startDate, endDate, userId) as ConversationRow[];
  }
  return catbotDb.prepare(
    'SELECT * FROM conversation_log WHERE started_at >= ? AND started_at < ? ORDER BY started_at ASC'
  ).all(startDate, endDate) as ConversationRow[];
}

export function summaryExists(userId: string, periodType: string, periodStart: string): boolean {
  const row = catbotDb.prepare(
    'SELECT id FROM summaries WHERE user_id = ? AND period_type = ? AND period_start = ?'
  ).get(userId, periodType, periodStart);
  return !!row;
}

export function getActiveUserIds(startDate: string, endDate: string): string[] {
  const rows = catbotDb.prepare(
    'SELECT DISTINCT user_id FROM conversation_log WHERE started_at >= ? AND started_at < ?'
  ).all(startDate, endDate) as Array<{ user_id: string }>;
  return rows.map(r => r.user_id);
}

// ---------------------------------------------------------------------------
// Default + named export
// ---------------------------------------------------------------------------

export { catbotDb };
export default catbotDb;
