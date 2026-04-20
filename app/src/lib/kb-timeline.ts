/**
 * kb-timeline.ts — Phase 154 Plan 01 pure aggregation helper.
 *
 * Aggregates KbIndex.header.last_changes[] by day (YYYY-MM-DD) for the
 * `<KnowledgeTimeline>` recharts LineChart in Plan 02. Pure function —
 * no DOM, no recharts dep — so it is unit-testable in vitest env=node.
 *
 * Accepts both ISO 8601 and SQL datetime formats. Invalid dates are
 * silently skipped (never throws). Output array is sorted ascending by
 * day so recharts can render it directly.
 */

export interface KbChange {
  id: string;
  updated: string;
}

export interface TimelineDay {
  day: string;
  count: number;
}

export function aggregateChangesByDay(changes: readonly KbChange[]): TimelineDay[] {
  const byDay = new Map<string, number>();
  for (const c of changes) {
    if (!c || typeof c.updated !== 'string' || !c.updated) continue;
    const safe = c.updated.includes('T') ? c.updated : c.updated.replace(' ', 'T') + 'Z';
    const day = safe.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    // Reject impossible dates via Date parse sanity check.
    if (Number.isNaN(new Date(safe).getTime())) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({ day, count }));
}
