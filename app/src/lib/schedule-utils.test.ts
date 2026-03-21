import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateNextExecution, formatNextExecution, type ScheduleConfig } from './schedule-utils';

describe('calculateNextExecution', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns today at 14:00 if current time is before 14:00 with days=always', () => {
    // Wednesday 2026-03-18 at 10:00
    vi.setSystemTime(new Date(2026, 2, 18, 10, 0, 0));

    const result = calculateNextExecution({
      time: '14:00',
      days: 'always',
      is_active: true,
    });

    expect(result).not.toBeNull();
    expect(result!.getDate()).toBe(18);
    expect(result!.getHours()).toBe(14);
    expect(result!.getMinutes()).toBe(0);
  });

  it('returns tomorrow at 14:00 if current time is after 14:00 with days=always', () => {
    // Wednesday 2026-03-18 at 15:00
    vi.setSystemTime(new Date(2026, 2, 18, 15, 0, 0));

    const result = calculateNextExecution({
      time: '14:00',
      days: 'always',
      is_active: true,
    });

    expect(result).not.toBeNull();
    expect(result!.getDate()).toBe(19);
    expect(result!.getHours()).toBe(14);
    expect(result!.getMinutes()).toBe(0);
  });

  it('returns next Monday for weekdays when current day is Saturday', () => {
    // Saturday 2026-03-21 at 08:00
    vi.setSystemTime(new Date(2026, 2, 21, 8, 0, 0));

    const result = calculateNextExecution({
      time: '09:00',
      days: 'weekdays',
      is_active: true,
    });

    expect(result).not.toBeNull();
    // Next Monday is March 23
    expect(result!.getDate()).toBe(23);
    expect(result!.getDay()).toBe(1); // Monday
    expect(result!.getHours()).toBe(9);
  });

  it('returns next Saturday for weekends when current day is Wednesday', () => {
    // Wednesday 2026-03-18 at 08:00
    vi.setSystemTime(new Date(2026, 2, 18, 8, 0, 0));

    const result = calculateNextExecution({
      time: '10:00',
      days: 'weekends',
      is_active: true,
    });

    expect(result).not.toBeNull();
    // Next Saturday is March 21
    expect(result!.getDate()).toBe(21);
    expect(result!.getDay()).toBe(6); // Saturday
    expect(result!.getHours()).toBe(10);
  });

  it('skips days not in custom_days list', () => {
    // Tuesday 2026-03-17 at 07:00 (day 2)
    vi.setSystemTime(new Date(2026, 2, 17, 7, 0, 0));

    const result = calculateNextExecution({
      time: '08:00',
      days: 'custom',
      custom_days: [1, 3, 5], // Mon, Wed, Fri
      is_active: true,
    });

    expect(result).not.toBeNull();
    // Next valid day is Wednesday March 18 (day 3)
    expect(result!.getDate()).toBe(18);
    expect(result!.getDay()).toBe(3); // Wednesday
  });

  it('returns null or date >= start_date when start_date is in the future', () => {
    // Wednesday 2026-03-18 at 10:00
    vi.setSystemTime(new Date(2026, 2, 18, 10, 0, 0));

    const result = calculateNextExecution({
      time: '12:00',
      days: 'always',
      start_date: '2099-01-01',
      is_active: true,
    });

    // Should return null because start_date is far in the future (beyond 14-day window)
    expect(result).toBeNull();
  });

  it('returns null when end_date is in the past', () => {
    // Wednesday 2026-03-18 at 10:00
    vi.setSystemTime(new Date(2026, 2, 18, 10, 0, 0));

    const result = calculateNextExecution({
      time: '12:00',
      days: 'always',
      end_date: '2020-01-01',
      is_active: true,
    });

    expect(result).toBeNull();
  });

  it('handles midnight time correctly', () => {
    // Wednesday 2026-03-18 at 23:00
    vi.setSystemTime(new Date(2026, 2, 18, 23, 0, 0));

    const result = calculateNextExecution({
      time: '00:00',
      days: 'always',
      is_active: true,
    });

    expect(result).not.toBeNull();
    // Should be tomorrow at 00:00
    expect(result!.getDate()).toBe(19);
    expect(result!.getHours()).toBe(0);
    expect(result!.getMinutes()).toBe(0);
  });

  it('handles empty custom_days array (treats as all days)', () => {
    // Wednesday 2026-03-18 at 10:00
    vi.setSystemTime(new Date(2026, 2, 18, 10, 0, 0));

    const result = calculateNextExecution({
      time: '14:00',
      days: 'custom',
      custom_days: [],
      is_active: true,
    });

    // Empty custom_days treated as all days valid
    expect(result).not.toBeNull();
    expect(result!.getDate()).toBe(18);
    expect(result!.getHours()).toBe(14);
  });

  it('handles end of week correctly (Friday to Monday for weekdays)', () => {
    // Friday 2026-03-20 at 20:00
    vi.setSystemTime(new Date(2026, 2, 20, 20, 0, 0));

    const result = calculateNextExecution({
      time: '09:00',
      days: 'weekdays',
      is_active: true,
    });

    expect(result).not.toBeNull();
    // Next weekday is Monday March 23
    expect(result!.getDate()).toBe(23);
    expect(result!.getDay()).toBe(1); // Monday
  });
});

describe('formatNextExecution', () => {
  it('returns human-readable Spanish string for a valid date', () => {
    const date = new Date(2026, 2, 21, 14, 30, 0); // Saturday March 21, 2026 14:30

    const result = formatNextExecution(date, 'es-ES');

    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
    // Should contain the time
    expect(result).toContain('14:30');
  });

  it('returns a "no execution" message for null date', () => {
    const result = formatNextExecution(null, 'es-ES');

    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns English format for en-US locale', () => {
    const date = new Date(2026, 2, 21, 14, 30, 0);

    const result = formatNextExecution(date, 'en-US');

    expect(result).toBeTruthy();
    expect(result).toContain('14:30');
  });
});
