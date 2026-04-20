/**
 * kb-filters.ts — Phase 154 Plan 01 pure filter helpers for KB dashboard.
 *
 * Consumed from client components (`KnowledgeTable`, `KnowledgeFilters`) in
 * Plan 02. Pure TypeScript — no React imports — so it is unit-testable in
 * vitest env=node.
 *
 * Design notes:
 *   - `applyKbFilters` mirrors the `searchKb()` contract of
 *     kb-index-cache.ts (AND-match on tags, case-insensitive search on
 *     title+summary) but removes server-side defaults: callers decide
 *     whether to pass `status: 'active'` (defaulting is a UI concern).
 *   - `collectDistinct*` helpers derive option lists dynamically from the
 *     current `entries[]` — NEVER hardcoded — so Phase 151 type drift
 *     (Conflict 3 in RESEARCH: real runtime has 9 types, not 10) is
 *     absorbed automatically.
 */
import type { KbIndexEntry } from '@/lib/services/kb-index-cache';

export interface KbFilterState {
  type?: string;
  subtype?: string;
  status?: string;
  audience?: string;
  tags: string[]; // AND-match
  search: string; // case-insensitive on title + summary
}

export function applyKbFilters(
  entries: readonly KbIndexEntry[],
  f: KbFilterState,
): KbIndexEntry[] {
  const q = (f.search ?? '').trim().toLowerCase();
  const wantTags = f.tags ?? [];
  return entries.filter((e) => {
    if (f.type && e.type !== f.type) return false;
    if (f.subtype && e.subtype !== f.subtype) return false;
    if (f.status && e.status !== f.status) return false;
    if (f.audience && !e.audience.includes(f.audience)) return false;
    if (wantTags.length && !wantTags.every((t) => e.tags.includes(t))) return false;
    if (q) {
      const hay = `${e.title} ${e.summary}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function collectDistinctTypes(entries: readonly KbIndexEntry[]): string[] {
  return Array.from(new Set(entries.map((e) => e.type))).sort();
}

export function collectDistinctSubtypes(
  entries: readonly KbIndexEntry[],
  type?: string,
): string[] {
  const scoped = type ? entries.filter((e) => e.type === type) : entries;
  return Array.from(
    new Set(scoped.map((e) => e.subtype).filter((s): s is string => !!s)),
  ).sort();
}

export function collectDistinctTags(
  entries: readonly KbIndexEntry[],
  max = 50,
): string[] {
  const count = new Map<string, number>();
  for (const e of entries) {
    for (const t of e.tags) count.set(t, (count.get(t) ?? 0) + 1);
  }
  return Array.from(count.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([t]) => t);
}
