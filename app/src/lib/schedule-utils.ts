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
