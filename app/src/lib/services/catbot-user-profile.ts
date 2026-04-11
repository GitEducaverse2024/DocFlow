/**
 * UserProfileService — Orchestration layer for CatBot user profiles.
 *
 * Handles: user ID derivation, auto-create on first interaction,
 * zero-cost preference extraction from tool call patterns,
 * directive generation, and post-conversation profile updates.
 */

import { upsertProfile, getProfile, catbotDb } from '@/lib/catbot-db';
import type { ProfileRow } from '@/lib/catbot-db';
import db from '@/lib/db';
import { generateId } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolResult {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface ProfileUpdate {
  communicationStyle?: string;
  knownContext?: Record<string, unknown>;
  preferredFormat?: string;
}

// ---------------------------------------------------------------------------
// deriveUserId
// ---------------------------------------------------------------------------

export function deriveUserId(channel?: string, chatId?: string): string {
  if (channel === 'telegram') {
    return `telegram:${chatId || 'unknown'}`;
  }
  return 'web:default';
}

// ---------------------------------------------------------------------------
// ensureProfile
// ---------------------------------------------------------------------------

export function ensureProfile(userId: string, channel?: string): ProfileRow {
  const existing = getProfile(userId);
  if (existing) {
    return existing;
  }

  upsertProfile({ id: userId, channel: channel || 'web' });
  return getProfile(userId)!;
}

// ---------------------------------------------------------------------------
// extractPreferencesFromTools
// ---------------------------------------------------------------------------

export function extractPreferencesFromTools(toolResults: ToolResult[]): ProfileUpdate | null {
  if (toolResults.length === 0) return null;

  const updates: ProfileUpdate = {};
  const toolNames = toolResults.map(r => r.name);

  // Detect technical user (uses bash_execute, service_manage)
  if (toolNames.includes('bash_execute') || toolNames.includes('service_manage')) {
    updates.communicationStyle = 'technical';
  }

  // Detect learning user (uses explain_feature frequently)
  const explainCount = toolNames.filter(n => n === 'explain_feature').length;
  if (explainCount >= 2) {
    updates.communicationStyle = 'learning';
  }

  // Detect canvas-heavy user (2+ canvas_* tools)
  const canvasCount = toolNames.filter(n => n.startsWith('canvas_')).length;
  if (canvasCount >= 2) {
    updates.knownContext = { ...updates.knownContext, uses_canvas_frequently: true };
  }

  // Detect preferred email connector from send_email
  const emailCalls = toolResults.filter(r => r.name === 'send_email');
  if (emailCalls.length > 0) {
    const connectorId = emailCalls[0].args.connector_id;
    if (connectorId) {
      updates.knownContext = { ...updates.knownContext, preferred_email_connector: connectorId };
    }
  }

  return Object.keys(updates).length > 0 ? updates : null;
}

// ---------------------------------------------------------------------------
// generateInitialDirectives
// ---------------------------------------------------------------------------

export function generateInitialDirectives(profile: ProfileRow): string {
  const parts: string[] = [];

  if (profile.display_name) {
    parts.push(`El usuario se llama ${profile.display_name}.`);
  }

  if (profile.channel === 'web') {
    parts.push('Interactua desde la interfaz web de DoCatFlow.');
  } else if (profile.channel === 'telegram' || profile.channel?.startsWith('telegram')) {
    parts.push('Interactua desde Telegram — respuestas concisas.');
  }

  if (profile.communication_style) {
    parts.push(`Prefiere comunicacion ${profile.communication_style}.`);
  }

  if (profile.preferred_format) {
    parts.push(`Formato preferido: ${profile.preferred_format}.`);
  }

  try {
    const ctx = JSON.parse(profile.known_context || '{}');
    if (ctx.uses_canvas_frequently) parts.push('Usuario habitual de Canvas.');
    if (ctx.preferred_email_connector) parts.push(`Usa conector de email: ${ctx.preferred_email_connector}.`);
  } catch { /* ignore malformed JSON */ }

  // Cap at 500 chars
  const result = parts.join(' ');
  return result.slice(0, 500);
}

// ---------------------------------------------------------------------------
// updateProfileAfterConversation
// ---------------------------------------------------------------------------

export function updateProfileAfterConversation(userId: string, toolResults: ToolResult[]): void {
  const preferences = extractPreferencesFromTools(toolResults);
  if (!preferences) return;

  // Merge known_context with existing profile context
  const existing = getProfile(userId);
  let mergedKnownContext: Record<string, unknown> | undefined;

  if (preferences.knownContext) {
    let existingContext: Record<string, unknown> = {};
    if (existing?.known_context) {
      try {
        existingContext = JSON.parse(existing.known_context);
      } catch { /* ignore */ }
    }
    mergedKnownContext = { ...existingContext, ...preferences.knownContext };
  }

  // Build a simulated profile to regenerate directives
  const profileForDirectives: ProfileRow = {
    id: userId,
    display_name: existing?.display_name ?? null,
    channel: existing?.channel ?? 'web',
    personality_notes: existing?.personality_notes ?? null,
    communication_style: preferences.communicationStyle ?? existing?.communication_style ?? null,
    preferred_format: preferences.preferredFormat ?? existing?.preferred_format ?? null,
    known_context: mergedKnownContext
      ? JSON.stringify(mergedKnownContext)
      : existing?.known_context ?? '{}',
    initial_directives: null,
    interaction_count: existing?.interaction_count ?? 0,
    last_seen: existing?.last_seen ?? null,
    created_at: existing?.created_at ?? '',
    updated_at: existing?.updated_at ?? '',
  };

  const newDirectives = generateInitialDirectives(profileForDirectives);

  upsertProfile({
    id: userId,
    communicationStyle: preferences.communicationStyle,
    preferredFormat: preferences.preferredFormat,
    knownContext: mergedKnownContext,
    initialDirectives: newDirectives,
  });
}

// ---------------------------------------------------------------------------
// Phase 137-03 (LEARN-03/04): user_interaction_patterns helpers
// ---------------------------------------------------------------------------

export interface UserInteractionPattern {
  id: string;
  user_id: string;
  pattern_type: string;
  pattern_key: string;
  pattern_value: string;
  confidence: number;
  last_seen: string;
  created_at: string;
}

export function getUserPatterns(userId: string, limit = 10): UserInteractionPattern[] {
  return catbotDb
    .prepare(
      `SELECT id, user_id, pattern_type, pattern_key, pattern_value, confidence, last_seen, created_at
         FROM user_interaction_patterns
        WHERE user_id = ?
        ORDER BY confidence DESC, last_seen DESC
        LIMIT ?`,
    )
    .all(userId, limit) as UserInteractionPattern[];
}

export function writeUserPattern(p: {
  id?: string;
  user_id: string;
  pattern_type: string;
  pattern_key: string;
  pattern_value: string;
  confidence?: number;
}): UserInteractionPattern {
  const id = p.id ?? generateId();
  const now = new Date().toISOString();
  const confidence = p.confidence ?? 1;
  catbotDb
    .prepare(
      `INSERT INTO user_interaction_patterns
         (id, user_id, pattern_type, pattern_key, pattern_value, confidence, last_seen, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, p.user_id, p.pattern_type, p.pattern_key, p.pattern_value, confidence, now, now);
  return {
    id,
    user_id: p.user_id,
    pattern_type: p.pattern_type,
    pattern_key: p.pattern_key,
    pattern_value: p.pattern_value,
    confidence,
    last_seen: now,
    created_at: now,
  };
}

// ---------------------------------------------------------------------------
// Phase 137-03 (LEARN-02): system skill instructions lookup
//
// Reads skills table from docflow.db (NOT catbot.db — skills are canonical
// in the main DB). PromptAssembler uses this to inject the "Protocolo de
// creacion de CatPaw" unconditionally in the system prompt.
// ---------------------------------------------------------------------------

export function getSystemSkillInstructions(name: string): string | null {
  try {
    const row = db
      .prepare(
        "SELECT instructions FROM skills WHERE category = 'system' AND name = ? LIMIT 1",
      )
      .get(name) as { instructions: string } | undefined;
    return row?.instructions ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 137-03 (LEARN-08 oracle): complexity_decisions outcome stats
//
// CatBot reads this via the get_complexity_outcome_stats tool to answer
// "what percentage of complex requests complete successfully?". Always-allowed
// readonly oracle.
// ---------------------------------------------------------------------------

export interface ComplexityOutcomeStats {
  window_days: number;
  total: number;
  completed: number;
  failed: number;
  timeout: number;
  pending: number;
  success_rate: number;
}

export function getComplexityOutcomeStats(windowDays: number = 30): ComplexityOutcomeStats {
  const w = Math.max(1, Math.min(365, Math.floor(windowDays)));
  const rows = catbotDb
    .prepare(
      `SELECT outcome, COUNT(*) AS cnt
         FROM complexity_decisions
        WHERE created_at > datetime('now', ?)
        GROUP BY outcome`,
    )
    .all(`-${w} days`) as Array<{ outcome: string | null; cnt: number }>;

  const bucket = { completed: 0, failed: 0, timeout: 0, pending: 0 };
  for (const r of rows) {
    const key = (r.outcome ?? 'pending') as keyof typeof bucket;
    if (key in bucket) {
      bucket[key] += r.cnt;
    } else {
      bucket.pending += r.cnt;
    }
  }
  const total = bucket.completed + bucket.failed + bucket.timeout + bucket.pending;
  const success_rate = total > 0 ? bucket.completed / total : 0;
  return {
    window_days: w,
    total,
    completed: bucket.completed,
    failed: bucket.failed,
    timeout: bucket.timeout,
    pending: bucket.pending,
    success_rate,
  };
}
