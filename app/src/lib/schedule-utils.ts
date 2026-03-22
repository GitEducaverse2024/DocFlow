/**
 * Schedule utility functions for task execution scheduling.
 * Extracted from next-execution-preview.tsx for testability and reuse.
 */

export interface ScheduleConfig {
  time: string;
  days: 'always' | 'weekdays' | 'weekends' | 'custom';
  custom_days?: number[];
  start_date?: string;
  end_date?: string;
  is_active: boolean;
}

/**
 * Calculate the next execution date from an arbitrary base date.
 * Returns null if no valid execution date exists within 14 days of baseDate.
 *
 * Day numbers follow JS convention: 0=Sunday, 1=Monday, ..., 6=Saturday.
 */
export function calculateNextExecutionFromDate(config: ScheduleConfig, baseDate: Date): Date | null {
  const [hours, minutes] = (config.time || '09:00').split(':').map(Number);

  // Determine which days of week are valid (0=Sunday, 1=Monday, ..., 6=Saturday)
  let validDays: number[];
  switch (config.days) {
    case 'weekdays':
      validDays = [1, 2, 3, 4, 5];
      break;
    case 'weekends':
      validDays = [0, 6];
      break;
    case 'custom':
      validDays = config.custom_days && config.custom_days.length > 0
        ? [...config.custom_days]
        : [0, 1, 2, 3, 4, 5, 6];
      break;
    case 'always':
    default:
      validDays = [0, 1, 2, 3, 4, 5, 6];
      break;
  }

  const startDate = config.start_date ? new Date(config.start_date + 'T00:00:00') : null;
  const endDate = config.end_date ? new Date(config.end_date + 'T23:59:59') : null;

  // Search up to 14 days ahead from baseDate
  for (let dayOffset = 0; dayOffset <= 14; dayOffset++) {
    const candidate = new Date(baseDate);
    candidate.setDate(candidate.getDate() + dayOffset);
    candidate.setHours(hours, minutes, 0, 0);

    // Skip if not strictly after baseDate
    if (candidate <= baseDate) continue;

    // Check day-of-week filter
    if (!validDays.includes(candidate.getDay())) continue;

    // Check date range bounds
    if (startDate && candidate < startDate) continue;
    if (endDate && candidate > endDate) continue;

    return candidate;
  }

  return null;
}

/**
 * Calculate the next execution date based on schedule configuration.
 * Returns null if no valid execution date exists within the next 14 days.
 *
 * Thin wrapper around calculateNextExecutionFromDate using current time as base.
 */
export function calculateNextExecution(config: ScheduleConfig): Date | null {
  return calculateNextExecutionFromDate(config, new Date());
}

// ---- Canvas schedule config (v17.0 — cron scheduling on canvases) ----

export interface CanvasScheduleConfig {
  is_active: boolean;
  type: 'interval' | 'weekly' | 'cron' | 'dates';
  // interval
  interval_value?: number;
  interval_unit?: 'minutes' | 'hours' | 'days';
  // weekly
  days?: number[];        // 0=Sun..6=Sat
  time?: string;          // HH:MM
  // cron
  cron_expression?: string;  // 5-field cron
  // dates
  specific_dates?: string[]; // ISO datetime strings
}

/**
 * Parse a 5-field cron expression and compute the next run after `baseDate`.
 * Supports: minute, hour, day-of-month, month, day-of-week.
 * Returns null if no match within 60 days.
 */
export function nextRunFromCron(expr: string, baseDate: Date): Date | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  function parseField(field: string, min: number, max: number): number[] | null {
    if (field === '*') return null; // means "all"
    const values: number[] = [];
    for (const segment of field.split(',')) {
      const stepMatch = segment.match(/^(\d+|\*)\/(\d+)$/);
      if (stepMatch) {
        const start = stepMatch[1] === '*' ? min : parseInt(stepMatch[1], 10);
        const step = parseInt(stepMatch[2], 10);
        for (let i = start; i <= max; i += step) values.push(i);
      } else if (segment.includes('-')) {
        const [a, b] = segment.split('-').map(Number);
        for (let i = a; i <= b; i++) values.push(i);
      } else {
        values.push(parseInt(segment, 10));
      }
    }
    return values.filter(v => v >= min && v <= max);
  }

  const minutes = parseField(parts[0], 0, 59);
  const hours = parseField(parts[1], 0, 23);
  const daysOfMonth = parseField(parts[2], 1, 31);
  const months = parseField(parts[3], 1, 12);
  const daysOfWeek = parseField(parts[4], 0, 6);

  const limit = new Date(baseDate);
  limit.setDate(limit.getDate() + 60);

  const candidate = new Date(baseDate);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1); // strictly after

  while (candidate < limit) {
    if (months && !months.includes(candidate.getMonth() + 1)) {
      candidate.setMonth(candidate.getMonth() + 1, 1);
      candidate.setHours(0, 0, 0, 0);
      continue;
    }
    if (daysOfMonth && !daysOfMonth.includes(candidate.getDate())) {
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(0, 0, 0, 0);
      continue;
    }
    if (daysOfWeek && !daysOfWeek.includes(candidate.getDay())) {
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(0, 0, 0, 0);
      continue;
    }
    if (hours && !hours.includes(candidate.getHours())) {
      candidate.setHours(candidate.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (minutes && !minutes.includes(candidate.getMinutes())) {
      candidate.setMinutes(candidate.getMinutes() + 1, 0, 0);
      continue;
    }
    return candidate;
  }
  return null;
}

/**
 * Calculate next execution for a canvas schedule config.
 */
export function calculateCanvasNextExecution(config: CanvasScheduleConfig, baseDate?: Date): Date | null {
  const now = baseDate || new Date();

  switch (config.type) {
    case 'interval': {
      const val = config.interval_value || 1;
      const unit = config.interval_unit || 'hours';
      const ms = val * (unit === 'minutes' ? 60_000 : unit === 'hours' ? 3_600_000 : 86_400_000);
      return new Date(now.getTime() + ms);
    }
    case 'weekly': {
      const days = config.days || [1, 2, 3, 4, 5];
      const [h, m] = (config.time || '09:00').split(':').map(Number);
      for (let offset = 0; offset <= 14; offset++) {
        const c = new Date(now);
        c.setDate(c.getDate() + offset);
        c.setHours(h, m, 0, 0);
        if (c <= now) continue;
        if (!days.includes(c.getDay())) continue;
        return c;
      }
      return null;
    }
    case 'cron': {
      if (!config.cron_expression) return null;
      return nextRunFromCron(config.cron_expression, now);
    }
    case 'dates': {
      if (!config.specific_dates?.length) return null;
      const upcoming = config.specific_dates
        .map(d => new Date(d))
        .filter(d => d > now)
        .sort((a, b) => a.getTime() - b.getTime());
      return upcoming[0] || null;
    }
    default:
      return null;
  }
}

/**
 * Validate a 5-field cron expression format.
 */
export function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const fieldPattern = /^(\*|\d+(-\d+)?(,\d+(-\d+)?)*)(\/([\d]+))?$/;
  return parts.every(p => fieldPattern.test(p));
}

/**
 * Human-readable summary of a canvas schedule config.
 */
export function summarizeCanvasSchedule(config: CanvasScheduleConfig): string {
  if (!config.is_active) return '';
  switch (config.type) {
    case 'interval': {
      const val = config.interval_value || 1;
      const unit = config.interval_unit || 'hours';
      const unitLabel = unit === 'minutes' ? 'min' : unit === 'hours' ? 'h' : 'd';
      return `${val}${unitLabel}`;
    }
    case 'weekly': {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const days = config.days || [];
      const isWeekdays = days.length === 5 && [1,2,3,4,5].every(d => days.includes(d));
      const dayStr = isWeekdays ? 'Mon-Fri' : days.map(d => dayNames[d]).join(',');
      return `${dayStr} ${config.time || '09:00'}`;
    }
    case 'cron':
      return config.cron_expression || 'cron';
    case 'dates':
      return `${config.specific_dates?.length || 0} dates`;
    default:
      return '';
  }
}

/**
 * Format a next execution date as a human-readable string.
 * Returns a localized date string or a "no execution" message.
 */
export function formatNextExecution(date: Date | null, locale: string): string {
  if (!date) {
    return locale.startsWith('en')
      ? 'No scheduled execution'
      : 'Sin ejecucion programada';
  }

  const dateStr = date.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const timeStr = date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return `${dateStr} a las ${timeStr}`;
}
