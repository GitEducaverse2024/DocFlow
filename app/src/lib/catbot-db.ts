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
// Default export
// ---------------------------------------------------------------------------

export default catbotDb;
