/**
 * Phase 132 — Rules index loader + on-demand rule lookup.
 *
 * Internal service (NOT a CatBot tool). Used by IntentJobExecutor
 * architect phase to feed rules into ARCHITECT_PROMPT and to expand
 * individual rules when the LLM requests details via get_canvas_rule.
 *
 * Design:
 * - loadRulesIndex(): reads canvas-rules-index.md (small, ~1.7KB), cached.
 * - getCanvasRule(id): parses R01-R25 from canvas-nodes-catalog.md (long form),
 *   and SE01-SE03/DA01-DA04 from the index (short form = long form), cached.
 * - Case-insensitive lookup via .toUpperCase().
 * - _resetCache() is a test seam.
 *
 * Path resolution: supports Docker (cwd=/app, catalog at /app/.planning/...)
 * and local dev/tests (cwd=~/docflow/app, catalog at ~/docflow/.planning/...).
 */

import fs from 'fs';
import path from 'path';

export type RuleCategory =
  | 'data_contracts'
  | 'responsibilities'
  | 'arrays_loops'
  | 'instructions'
  | 'planning'
  | 'templates'
  | 'resilience'
  | 'side_effects'
  | 'anti_patterns'
  | 'other';

export interface RuleDetail {
  id: string;          // "R01", "SE02", "DA04"
  short: string;       // <=100 chars (from index line)
  long: string;        // full paragraph from catalog (R01-R25) or short (SE/DA)
  category: RuleCategory;
}

let cachedIndex: string | null = null;
let cachedRules: Map<string, RuleDetail> | null = null;

function resolveIndexPath(): string {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'data/knowledge/canvas-rules-index.md'),
    path.join(cwd, 'app/data/knowledge/canvas-rules-index.md'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // Return first candidate to produce a meaningful ENOENT if truly missing.
  return candidates[0];
}

function resolveCatalogPath(): string {
  const cwd = process.cwd();
  const candidates = [
    // Runtime in Docker: entrypoint copies the catalog into the mounted volume.
    '/app/data/knowledge/canvas-nodes-catalog.md',
    // Local dev / vitest from app/: host seed source, identical content.
    path.join(cwd, 'data/knowledge/canvas-nodes-catalog.md'),
    // Local dev from repo root.
    path.join(cwd, 'app/data/knowledge/canvas-nodes-catalog.md'),
    // Legacy .planning location (kept for tools that still read from there).
    path.join(cwd, '.planning/knowledge/canvas-nodes-catalog.md'),
    path.join(cwd, '../.planning/knowledge/canvas-nodes-catalog.md'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

export function loadRulesIndex(): string {
  if (cachedIndex !== null) return cachedIndex;
  const p = resolveIndexPath();
  cachedIndex = fs.readFileSync(p, 'utf-8');
  return cachedIndex;
}

export function getCanvasRule(ruleId: string): RuleDetail | null {
  if (!cachedRules) {
    cachedRules = parseRules();
  }
  return cachedRules.get(ruleId.toUpperCase()) ?? null;
}

function parseRules(): Map<string, RuleDetail> {
  const out = new Map<string, RuleDetail>();

  // R01-R25 long form from canvas-nodes-catalog.md
  // Format: `- **RNN** full paragraph text.`
  try {
    const catalogPath = resolveCatalogPath();
    const catalog = fs.readFileSync(catalogPath, 'utf-8');
    const ruleRe = /- \*\*(R\d{2})\*\*\s*([\s\S]+?)(?=\n- \*\*R\d{2}|\n\n|\n##|$)/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(catalog)) !== null) {
      const id = m[1];
      const long = m[2].trim().replace(/\s+/g, ' ');
      out.set(id, {
        id,
        short: truncate100(long),
        long,
        category: categorize(id),
      });
    }
  } catch {
    // Catalog not found — R01-R25 will fall back to index-only short form below.
  }

  // SE01-SE03 and DA01-DA04 from the index itself (short form only)
  const index = loadRulesIndex();
  const extraRe = /- (SE\d{2}|DA\d{2}): (.+)/g;
  let em: RegExpExecArray | null;
  while ((em = extraRe.exec(index)) !== null) {
    const id = em[1];
    const text = em[2].trim();
    out.set(id, {
      id,
      short: text,
      long: text,
      category: categorize(id),
    });
  }

  // Fallback: if any R-rule was missing from the catalog parse (path issues,
  // formatting drift), synthesize its entry from the index short line so
  // getCanvasRule still works for downstream consumers.
  const indexRuleRe = /- (R\d{2}): (.+)/g;
  let im: RegExpExecArray | null;
  while ((im = indexRuleRe.exec(index)) !== null) {
    const id = im[1];
    if (out.has(id)) continue;
    const text = im[2].trim();
    out.set(id, {
      id,
      short: text,
      long: text,
      category: categorize(id),
    });
  }

  return out;
}

function truncate100(s: string): string {
  return s.length <= 100 ? s : s.slice(0, 97) + '...';
}

function categorize(id: string): RuleCategory {
  if (id.startsWith('SE')) return 'side_effects';
  if (id.startsWith('DA')) return 'anti_patterns';
  const n = Number(id.slice(1));
  if ([1, 10, 13, 15, 16].includes(n)) return 'data_contracts';
  if ([5, 6, 7, 8, 9, 20, 21, 23].includes(n)) return 'responsibilities';
  if ([2, 14, 25].includes(n)) return 'arrays_loops';
  if ([11, 12, 17].includes(n)) return 'instructions';
  if ([3, 4].includes(n)) return 'planning';
  if ([18, 19].includes(n)) return 'templates';
  if ([22, 24].includes(n)) return 'resilience';
  return 'other';
}

/** Test seam: reset in-memory caches so unit tests are isolated. */
export function _resetCache(): void {
  cachedIndex = null;
  cachedRules = null;
}
