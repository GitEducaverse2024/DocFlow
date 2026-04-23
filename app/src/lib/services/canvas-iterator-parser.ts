import { jsonrepair } from 'jsonrepair';
import { logger } from '@/lib/logger';

// Extracted from canvas-executor.ts (R26 RFC: ITER-01, v30.2 P1).
// Parses iterator node input into a string[] of items. Robust against LLM
// malformed JSON (unescaped quotes/newlines in body fields), markdown fences,
// truncated arrays. Silent [] fallback is a BUG (caused run 609828fa cascade);
// this module always logs the decision path so CatBot's Auditor can detect
// recovery paths and hard failures.

export function parseIteratorItems(input: string, separator: string): string[] {
  if (!input || !input.trim()) return [];

  const stripped = input
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(stripped);
    if (Array.isArray(parsed)) {
      return parsed.map(item => typeof item === 'string' ? item : JSON.stringify(item));
    }
  } catch {
    if (stripped.startsWith('[')) {
      try {
        const repaired = jsonrepair(stripped);
        const parsed = JSON.parse(repaired);
        if (Array.isArray(parsed)) {
          logger.warn('canvas', 'Iterator: jsonrepair applied', {
            originalLength: input.length,
            repairedItems: parsed.length,
            method: 'jsonrepair',
          });
          return parsed.map(item => typeof item === 'string' ? item : JSON.stringify(item));
        }
      } catch {
        // jsonrepair also failed — try last-complete-object regex as final LLM-output salvage
        const matches = stripped.match(/\{(?:[^{}]|\{[^{}]*\})*\}/g);
        if (matches && matches.length > 0) {
          const recovered: string[] = [];
          for (const m of matches) {
            try {
              JSON.parse(m);
              recovered.push(m);
            } catch { /* skip unparseable fragment */ }
          }
          if (recovered.length > 0) {
            logger.warn('canvas', 'Iterator: regex-salvage applied after jsonrepair failure', {
              originalLength: input.length,
              recoveredItems: recovered.length,
              method: 'regex-salvage',
            });
            return recovered;
          }
        }
        logger.error('canvas', 'Iterator: JSON array unrecoverable (jsonrepair + regex-salvage both failed)', {
          length: input.length,
          firstChars: input.slice(0, 200),
        });
        return [];
      }
      return [];
    }
  }

  if (separator) {
    return input.split(separator).map(s => s.trim()).filter(Boolean);
  }

  const lines = input.split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length > 1) return lines;

  return [input.trim()];
}
