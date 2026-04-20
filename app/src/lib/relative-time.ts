/**
 * relative-time.ts — Phase 154 Plan 01 pure helper.
 *
 * Formats an ISO or SQL-style datetime as a Spanish relative time string.
 * Consumed by the `/knowledge` dashboard table (Plan 02) to show `updated`
 * as "hoy" / "ayer" / "hace N días" / "hace N meses" instead of raw ISO.
 *
 * Tolerant of both ISO 8601 (`2026-04-20T10:00:00Z`) and SQL format
 * (`2026-04-20 10:00:00`). SQL format is auto-coerced by swapping the
 * space for `T` and appending `Z` so `new Date(...)` parses it as UTC.
 *
 * Returns the raw input string when it cannot be parsed — callers get
 * deterministic fall-through, never `Invalid Date`.
 */
export function formatRelativeTime(updated: string): string {
  if (!updated) return updated;
  const safe = updated.includes('T') ? updated : updated.replace(' ', 'T') + 'Z';
  const parsed = new Date(safe).getTime();
  if (Number.isNaN(parsed)) return updated;
  const diff = Date.now() - parsed;
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  if (days < 365) return `hace ${Math.floor(days / 30)} meses`;
  return new Date(safe).toLocaleDateString('es-ES');
}
