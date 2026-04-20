/**
 * kb-index-cache.ts — Phase 152 Plan 01 read-path foundation.
 *
 * Cached access to the `.docflow-kb/` Knowledge Base for CatBot runtime
 * consumers (catbot-tools.ts, catbot-prompt-assembler.ts, Phase 154
 * dashboard). Read-only, TTL-cached, graceful on missing files.
 *
 * Key design points:
 *   - KB_ROOT resolution: `process['env']['KB_ROOT']` bracket-notation
 *     (MEMORY.md mandate — webpack inlining bypass) with fallback to
 *     `path.join(process.cwd(), '..', '.docflow-kb')`. In dev (cwd=app/),
 *     that's `~/docflow/.docflow-kb/`. In Docker prod (cwd=/app), that's
 *     `/.docflow-kb/` (volume-mounted via docker-compose).
 *   - TTL 60s: `kb-sync.cjs --full-rebuild` regenerates the KB; a 60s
 *     staleness window is the agreed tradeoff between freshness and I/O.
 *   - byTableId map (source_of_truth resolver): `_index.json.entries[]`
 *     does NOT expose `source_of_truth` — that field lives only in each
 *     resource .md file's YAML frontmatter. `resolveKbEntry(table, id)`
 *     lazily builds the map by reading frontmatter from ~66 resource
 *     files once per 60s TTL. Cold-start cost is ~15-30ms; warm hits
 *     are O(1) Map lookup.
 *   - NO dot-notation env access. Only bracket: `process['env']['X']`.
 *   - NO dependency on `knowledge-sync.ts` (write path). Separation of
 *     concerns — this module is strict read path.
 */

import fs from 'node:fs';
import path from 'node:path';
// js-yaml is already a transitive dep via next (app/node_modules/js-yaml@4.1.1)
// but does not ship its own types and this repo does not install @types/js-yaml
// to avoid a new package.json dep. We type the single helper we need:
// `load(src: string): unknown`. safeLoad-equivalent — js-yaml v4's `load`
// rejects unsafe constructs by default.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const yaml: { load: (src: string) => unknown } = require('js-yaml');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_KB_ROOT = path.join(process.cwd(), '..', '.docflow-kb');
const INDEX_CACHE_TTL_MS = 60_000;

function getKbRoot(): string {
  return process['env']['KB_ROOT'] || DEFAULT_KB_ROOT;
}

// ---------------------------------------------------------------------------
// Types (exported)
// ---------------------------------------------------------------------------

export interface KbIndexEntry {
  id: string;
  path: string;
  type: string;
  subtype: string | null;
  title: string;
  summary: string;
  tags: string[];
  audience: string[];
  status: string;
  updated: string;
  search_hints: string[] | null;
}

export interface KbIndex {
  schema_version: string;
  entry_count: number;
  entries: KbIndexEntry[];
  indexes: {
    by_type: Record<string, string[]>;
    by_tag: Record<string, string[]>;
    by_audience: Record<string, string[]>;
  };
}

export interface SearchKbParams {
  type?: string;
  subtype?: string;
  tags?: string[];
  audience?: string;
  status?: string;
  search?: string;
  limit?: number;
}

export interface SearchKbResultItem {
  id: string;
  path: string;
  type: string;
  subtype: string | null;
  title: string;
  summary: string;
  tags: string[];
  audience: string[];
  status: string;
  updated: string;
}

export interface SearchKbResult {
  total: number;
  results: SearchKbResultItem[];
}

export interface GetKbEntryResult {
  id: string;
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
  related_resolved: Array<{
    type: string;
    id: string;
    title: string | null;
    path: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Module-level cache state
// ---------------------------------------------------------------------------

interface IndexCache {
  loadedAt: number;
  data: KbIndex | null;
  rootUsed: string;
}

interface SourceOfTruthCache {
  byTableId: Map<string, string>;
  loadedAt: number;
  rootUsed: string;
}

let indexCache: IndexCache = { loadedAt: 0, data: null, rootUsed: '' };
let sotCache: SourceOfTruthCache | null = null;

// ---------------------------------------------------------------------------
// Public API: index + cache lifecycle
// ---------------------------------------------------------------------------

/**
 * Returns the parsed `_index.json` of the KB, or `null` if the file is
 * missing / malformed. Cached for `INDEX_CACHE_TTL_MS` ms. Cache is keyed
 * by KB_ROOT — a change in env invalidates automatically.
 */
export function getKbIndex(): KbIndex | null {
  const now = Date.now();
  const root = getKbRoot();
  if (
    indexCache.data &&
    indexCache.rootUsed === root &&
    now - indexCache.loadedAt < INDEX_CACHE_TTL_MS
  ) {
    return indexCache.data;
  }
  try {
    const raw = fs.readFileSync(path.join(root, '_index.json'), 'utf8');
    const parsed = JSON.parse(raw) as KbIndex;
    indexCache = { loadedAt: now, data: parsed, rootUsed: root };
    sotCache = null; // invalidate the paired cache
    return parsed;
  } catch {
    indexCache = { loadedAt: now, data: null, rootUsed: root };
    sotCache = null;
    return null;
  }
}

/**
 * Forces both the index cache and the source-of-truth cache to be re-read
 * on the next access. Used by tests and by write-path consumers that want
 * to surface changes immediately without waiting for TTL expiry.
 */
export function invalidateKbIndex(): void {
  indexCache = { loadedAt: 0, data: null, rootUsed: '' };
  sotCache = null;
}

// ---------------------------------------------------------------------------
// byTableId source-of-truth map (lazy, per-TTL cold build)
// ---------------------------------------------------------------------------

function buildSourceOfTruthCache(index: KbIndex, root: string): SourceOfTruthCache {
  const byTableId = new Map<string, string>();
  for (const entry of index.entries) {
    if (entry.type !== 'resource') continue;
    try {
      const filePath = path.join(root, entry.path);
      const raw = fs.readFileSync(filePath, 'utf8');
      const fm = parseFrontmatter(raw);
      const sot = fm.source_of_truth as Array<{ db?: string; table?: string; id?: string | number }> | undefined;
      if (!Array.isArray(sot)) continue;
      for (const s of sot) {
        if (s && typeof s.table === 'string' && (typeof s.id === 'string' || typeof s.id === 'number')) {
          byTableId.set(`${s.table}:${String(s.id)}`, entry.path);
        }
      }
    } catch {
      // Skip malformed resource file — keep building from remaining files.
    }
  }
  return { byTableId, loadedAt: Date.now(), rootUsed: root };
}

/**
 * Resolves a DB row (dbTable, dbId) to its KB resource path (relative to
 * `.docflow-kb/`) by reading the `source_of_truth[]` frontmatter of every
 * resource file and building a byTableId map cached for the current TTL.
 * Returns null if no KB file matches or the KB is unavailable.
 */
export function resolveKbEntry(dbTable: string, dbId: string): string | null {
  const idx = getKbIndex();
  if (!idx) return null;
  const root = getKbRoot();
  const now = Date.now();
  if (!sotCache || sotCache.rootUsed !== root || now - sotCache.loadedAt > INDEX_CACHE_TTL_MS) {
    sotCache = buildSourceOfTruthCache(idx, root);
  }
  return sotCache.byTableId.get(`${dbTable}:${dbId}`) ?? null;
}

// ---------------------------------------------------------------------------
// Frontmatter parsing (shared helper)
// ---------------------------------------------------------------------------

function parseFrontmatter(fileContent: string): Record<string, unknown> {
  if (!fileContent.startsWith('---\n') && !fileContent.startsWith('---\r\n')) {
    return {};
  }
  const lines = fileContent.split('\n');
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) return {};
  const yamlText = lines.slice(1, endIdx).join('\n');
  try {
    const parsed = yaml.load(yamlText);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Reads a KB file relative to KB_ROOT and returns `{frontmatter, body}` with
 * YAML frontmatter parsed via js-yaml. Returns null on missing file. If the
 * file has no frontmatter block, returns `{frontmatter: {}, body: <raw>}`.
 */
export function parseKbFile(
  relPath: string,
): { frontmatter: Record<string, unknown>; body: string } | null {
  try {
    const root = getKbRoot();
    const raw = fs.readFileSync(path.join(root, relPath), 'utf8');
    if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) {
      return { frontmatter: {}, body: raw };
    }
    const lines = raw.split('\n');
    let endIdx = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        endIdx = i;
        break;
      }
    }
    if (endIdx === -1) return { frontmatter: {}, body: raw };
    const yamlText = lines.slice(1, endIdx).join('\n');
    const body = lines.slice(endIdx + 1).join('\n');
    let frontmatter: Record<string, unknown> = {};
    try {
      const parsed = yaml.load(yamlText);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        frontmatter = parsed as Record<string, unknown>;
      }
    } catch {
      frontmatter = {};
    }
    return { frontmatter, body };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// searchKb — read-only filtered search over _index.json.entries[]
// ---------------------------------------------------------------------------

/**
 * Search the KB index by any combination of type/subtype/tags/audience/
 * status/search. Defaults to status='active' and limit=10 (cap 50). `tags`
 * are AND-matched. `search` is case-insensitive substring over
 * title/summary/tags/search_hints with ranking title×3, summary×2,
 * tags×1, hints×1. Without `search`, results are ordered by `updated` DESC.
 */
export function searchKb(params: SearchKbParams): SearchKbResult {
  const idx = getKbIndex();
  if (!idx) return { total: 0, results: [] };

  const status = params.status ?? 'active';
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);

  let candidates: KbIndexEntry[] = idx.entries;
  if (params.type) candidates = candidates.filter(e => e.type === params.type);
  if (params.subtype) candidates = candidates.filter(e => e.subtype === params.subtype);
  if (params.audience) candidates = candidates.filter(e => e.audience.includes(params.audience!));
  candidates = candidates.filter(e => e.status === status);
  if (params.tags && params.tags.length > 0) {
    candidates = candidates.filter(e => params.tags!.every(t => e.tags.includes(t)));
  }

  if (params.search) {
    const q = params.search.toLowerCase();
    const scored = candidates
      .map(e => {
        let score = 0;
        if (e.title.toLowerCase().includes(q)) score += 3;
        if (e.summary.toLowerCase().includes(q)) score += 2;
        for (const t of e.tags) if (t.toLowerCase().includes(q)) score += 1;
        const hints = Array.isArray(e.search_hints) ? e.search_hints : [];
        for (const h of hints) {
          if (typeof h === 'string' && h.toLowerCase().includes(q)) score += 1;
        }
        return { entry: e, score };
      })
      .filter(s => s.score > 0);
    scored.sort((a, b) => b.score - a.score || b.entry.updated.localeCompare(a.entry.updated));
    const total = scored.length;
    const results: SearchKbResultItem[] = scored.slice(0, limit).map(s => toResultItem(s.entry));
    return { total, results };
  }

  candidates.sort((a, b) => b.updated.localeCompare(a.updated));
  const total = candidates.length;
  const results: SearchKbResultItem[] = candidates.slice(0, limit).map(toResultItem);
  return { total, results };
}

function toResultItem(e: KbIndexEntry): SearchKbResultItem {
  return {
    id: e.id,
    path: e.path,
    type: e.type,
    subtype: e.subtype,
    title: e.title,
    summary: truncate(e.summary, 200),
    tags: e.tags,
    audience: e.audience,
    status: e.status,
    updated: e.updated,
  };
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ---------------------------------------------------------------------------
// getKbEntry — full read of a single entry (frontmatter + body + related)
// ---------------------------------------------------------------------------

/**
 * Full detail of a KB entry by id. Returns frontmatter (YAML-parsed), body
 * (markdown below the frontmatter), and `related_resolved[]` where each
 * `frontmatter.related` ref is enriched with the referenced entry's title
 * and path when found in the index. Unmatched refs get `title: null, path: null`.
 * Returns null when the id is unknown or the KB is unavailable.
 */
export function getKbEntry(id: string): GetKbEntryResult | null {
  const idx = getKbIndex();
  if (!idx) return null;
  const entry = idx.entries.find(e => e.id === id);
  if (!entry) return null;
  const parsed = parseKbFile(entry.path);
  if (!parsed) return null;

  const rawRelated = parsed.frontmatter.related as Array<{ type?: string; id?: string } | string> | undefined;
  const related = Array.isArray(rawRelated) ? rawRelated : [];
  const related_resolved = related.map(r => {
    const typeVal = typeof r === 'object' && r !== null ? r.type ?? '' : '';
    const idVal = typeof r === 'object' && r !== null ? r.id ?? '' : r;
    const match = idx.entries.find(e => e.id === idVal);
    if (match) {
      return {
        type: typeVal || match.type,
        id: String(idVal),
        title: match.title,
        path: match.path,
      };
    }
    return { type: typeVal, id: String(idVal), title: null, path: null };
  });

  return {
    id: entry.id,
    path: entry.path,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    related_resolved,
  };
}
