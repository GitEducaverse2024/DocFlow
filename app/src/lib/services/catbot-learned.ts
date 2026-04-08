/**
 * LearnedEntryService — Staging, dedup, rate limiting, and promotion for knowledge_learned.
 *
 * Entries start as staging (validated=0) and are not injected into the prompt
 * until validated (access_count >= VALIDATION_THRESHOLD or admin approval).
 */

import {
  saveLearnedEntry,
  getLearnedEntries,
  incrementAccessCount,
  setValidated,
  deleteLearnedEntry,
} from '@/lib/catbot-db';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VALIDATION_THRESHOLD = 3;
export const MAX_ENTRIES_PER_CONVERSATION = 3;

const VALID_CATEGORIES = new Set(['best_practice', 'pitfall', 'troubleshoot']);

// ---------------------------------------------------------------------------
// Conversation rate-limit tracker (in-memory per process)
// ---------------------------------------------------------------------------

const conversationCounters = new Map<string, number>();

// ---------------------------------------------------------------------------
// Jaccard similarity (word-level)
// ---------------------------------------------------------------------------

export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length >= 3));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length >= 3));

  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }

  const unionSize = new Set([...setA, ...setB]).size;
  return intersection / unionSize;
}

// ---------------------------------------------------------------------------
// saveLearnedEntryWithStaging
// ---------------------------------------------------------------------------

export function saveLearnedEntryWithStaging(
  entry: {
    knowledgePath: string;
    category: string;
    content: string;
    learnedFrom?: string;
  },
  conversationId?: string,
): { id: string | null; error?: string } {
  // Validate category
  if (!VALID_CATEGORIES.has(entry.category)) {
    return { id: null, error: 'invalid_category' };
  }

  // Rate limit check
  if (conversationId) {
    const count = conversationCounters.get(conversationId) ?? 0;
    if (count >= MAX_ENTRIES_PER_CONVERSATION) {
      return { id: null, error: 'rate_limited' };
    }
  }

  // Truncate content to 500 chars
  const content = entry.content.length > 500 ? entry.content.slice(0, 500) : entry.content;

  // Dedup check: look for existing entries with same path+category
  const existing = getLearnedEntries({
    knowledgePath: entry.knowledgePath,
  });
  for (const row of existing) {
    if (row.category === entry.category && jaccardSimilarity(row.content, content) > 0.8) {
      return { id: null, error: 'duplicate' };
    }
  }

  // Save via catbot-db (starts with validated=0, confidence=0.5 by default)
  const id = saveLearnedEntry({
    knowledgePath: entry.knowledgePath,
    category: entry.category,
    content,
    learnedFrom: entry.learnedFrom ?? 'usage',
  });

  // Increment conversation counter
  if (conversationId) {
    conversationCounters.set(conversationId, (conversationCounters.get(conversationId) ?? 0) + 1);
  }

  return { id };
}

// ---------------------------------------------------------------------------
// Promotion
// ---------------------------------------------------------------------------

export function promoteIfReady(entryId: string): boolean {
  const entries = getLearnedEntries();
  const entry = entries.find(e => e.id === entryId);
  if (!entry) return false;
  if (entry.access_count < VALIDATION_THRESHOLD) return false;

  setValidated(entryId, true);
  return true;
}

// ---------------------------------------------------------------------------
// Admin operations
// ---------------------------------------------------------------------------

export function adminValidate(entryId: string): void {
  setValidated(entryId, true);
}

export function adminReject(entryId: string): void {
  deleteLearnedEntry(entryId);
}
