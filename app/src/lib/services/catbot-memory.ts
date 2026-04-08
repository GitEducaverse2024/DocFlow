/**
 * MemoryService (Capa 0) — Recipe matching, auto-save, and success tracking.
 *
 * Provides the core memory layer for CatBot: matches user queries against
 * previously saved recipes (workflow patterns), auto-saves new recipes from
 * successful tool call sequences, and handles deduplication via Jaccard similarity.
 */

import {
  getRecipesForUser,
  saveMemory,
  findSimilarRecipe,
  updateRecipeSuccess as dbUpdateRecipeSuccess,
} from '@/lib/catbot-db';
import type { MemoryRow } from '@/lib/catbot-db';
import type { ToolResult } from '@/lib/services/catbot-user-profile';

// ---------------------------------------------------------------------------
// Spanish stopwords (common words to filter from trigger patterns)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'para', 'con', 'por', 'del', 'los', 'las', 'una', 'uno', 'que', 'como',
  'esta', 'este', 'ese', 'esa', 'todo', 'toda', 'todos', 'todas', 'hay',
  'ser', 'mas', 'pero', 'sin', 'sobre', 'entre', 'hasta', 'desde', 'donde',
  'cuando', 'cual', 'quien', 'esto', 'eso', 'algo', 'otro', 'otra',
  'cada', 'muy', 'bien', 'solo', 'puede', 'hacer', 'tiene',
]);

// ---------------------------------------------------------------------------
// normalizeQuery
// ---------------------------------------------------------------------------

export function normalizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\w\sáéíóúüñ]/g, '') // remove punctuation, keep accents
    .split(/\s+/)
    .filter(w => w.length >= 3)
    .filter(w => !STOPWORDS.has(w));
}

// ---------------------------------------------------------------------------
// extractTriggerPatterns
// ---------------------------------------------------------------------------

export function extractTriggerPatterns(query: string, toolResults: ToolResult[]): string[] {
  const queryWords = normalizeQuery(query).slice(0, 5);
  const toolNames = [...new Set(toolResults.map(r => r.name))];
  return [...new Set([...queryWords, ...toolNames])];
}

// ---------------------------------------------------------------------------
// matchRecipe
// ---------------------------------------------------------------------------

export function matchRecipe(userId: string, query: string): MemoryRow | null {
  const recipes = getRecipesForUser(userId);
  if (recipes.length === 0) return null;

  const queryWords = normalizeQuery(query);
  if (queryWords.length === 0) return null;

  let bestRecipe: MemoryRow | null = null;
  let bestScore = 0;

  for (const recipe of recipes) {
    let triggers: string[];
    try {
      triggers = JSON.parse(recipe.trigger_patterns) as string[];
    } catch {
      continue;
    }

    if (triggers.length === 0) continue;

    // Count keyword overlap
    const matchCount = triggers.filter(t => queryWords.includes(t)).length;

    // Minimum threshold: 2 matches, or all if trigger has only 1 keyword
    const minRequired = triggers.length === 1 ? 1 : 2;
    if (matchCount < minRequired) continue;

    // Score: overlap ratio + success_count bonus
    const overlapRatio = matchCount / Math.max(triggers.length, queryWords.length);
    if (overlapRatio < 0.5 && triggers.length > 1) continue;

    // Composite score: overlap ratio weighted + success_count tie-breaker
    const score = overlapRatio * 100 + recipe.success_count;

    if (score > bestScore) {
      bestScore = score;
      bestRecipe = recipe;
    }
  }

  return bestRecipe;
}

// ---------------------------------------------------------------------------
// autoSaveRecipe
// ---------------------------------------------------------------------------

export function autoSaveRecipe(
  userId: string,
  query: string,
  toolResults: ToolResult[],
  conversationId?: string,
): string | null {
  // Guard: need 2+ tool calls
  if (toolResults.length < 2) return null;

  // Guard: no errors or SUDO_REQUIRED in results
  for (const tr of toolResults) {
    const resultStr = typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result);
    if (resultStr.includes('error') || resultStr.includes('SUDO_REQUIRED')) {
      return null;
    }
  }

  const triggerPatterns = extractTriggerPatterns(query, toolResults);

  // Dedup: if similar recipe exists, update success_count instead
  const existing = findSimilarRecipe(userId, triggerPatterns);
  if (existing) {
    dbUpdateRecipeSuccess(existing.id);
    return existing.id;
  }

  // Build steps from tool sequence
  const steps = toolResults.map(tr => ({
    tool: tr.name,
    description: `${tr.name}(${Object.keys(tr.args).join(', ')})`,
  }));

  return saveMemory({
    userId,
    triggerPatterns,
    steps,
    preferences: {},
    sourceConversationId: conversationId,
  });
}

// ---------------------------------------------------------------------------
// Re-export updateRecipeSuccess for convenience
// ---------------------------------------------------------------------------

export { dbUpdateRecipeSuccess as updateRecipeSuccess };
