import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from './relative-time';

describe('formatRelativeTime', () => {
  const now = Date.now();

  it('returns "hoy" for a date on the same day', () => {
    const iso = new Date(now - 60_000).toISOString(); // 1 minute ago
    expect(formatRelativeTime(iso)).toBe('hoy');
  });

  it('returns "ayer" for 1 day ago', () => {
    const iso = new Date(now - 24 * 3600_000 - 60_000).toISOString();
    expect(formatRelativeTime(iso)).toBe('ayer');
  });

  it('returns "hace N días" for 5 days ago', () => {
    const iso = new Date(now - 5 * 24 * 3600_000).toISOString();
    expect(formatRelativeTime(iso)).toBe('hace 5 días');
  });

  it('returns "hace N meses" for 60 days ago', () => {
    const iso = new Date(now - 60 * 24 * 3600_000).toISOString();
    expect(formatRelativeTime(iso)).toBe('hace 2 meses');
  });

  it('tolerates SQL datetime format "YYYY-MM-DD HH:MM:SS"', () => {
    // Build a SQL-style date ~5 days ago (approx — allow drift of ±1 day)
    const past = new Date(now - 5 * 24 * 3600_000);
    const sql = `${past.getUTCFullYear()}-${String(past.getUTCMonth() + 1).padStart(2, '0')}-${String(past.getUTCDate()).padStart(2, '0')} 10:00:00`;
    const out = formatRelativeTime(sql);
    expect(out).toMatch(/^hace \d+ días$/);
  });

  it('returns the raw string when unparseable', () => {
    expect(formatRelativeTime('not-a-date')).toBe('not-a-date');
  });
});
