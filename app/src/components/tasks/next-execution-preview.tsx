"use client";

import { CalendarClock } from 'lucide-react';

interface ScheduleConfig {
  time: string;
  days: 'always' | 'weekdays' | 'weekends' | 'custom';
  custom_days?: number[];
  start_date?: string;
  end_date?: string;
  is_active: boolean;
}

interface NextExecutionPreviewProps {
  config: ScheduleConfig;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
}

function calculateNextExecution(config: ScheduleConfig): Date | null {
  const [hours, minutes] = (config.time || '09:00').split(':').map(Number);
  const now = new Date();

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

  // Search up to 14 days ahead
  for (let dayOffset = 0; dayOffset <= 14; dayOffset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + dayOffset);
    candidate.setHours(hours, minutes, 0, 0);

    // Skip if in the past
    if (candidate <= now) continue;

    // Check day-of-week filter
    if (!validDays.includes(candidate.getDay())) continue;

    // Check date range bounds
    if (startDate && candidate < startDate) continue;
    if (endDate && candidate > endDate) continue;

    return candidate;
  }

  return null;
}

export function NextExecutionPreview({ config, t }: NextExecutionPreviewProps) {
  const nextExecution = calculateNextExecution(config);

  const formattedDate = nextExecution
    ? nextExecution.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }) + ' a las ' + nextExecution.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : null;

  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 flex items-start gap-2">
      <CalendarClock className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
      <div className="text-sm">
        <span className="text-zinc-400">{t('wizard.section4.nextExecution')}</span>{' '}
        {formattedDate ? (
          <span className="text-zinc-200">{formattedDate}</span>
        ) : (
          <span className="text-zinc-500">{t('wizard.section4.noExecution')}</span>
        )}
      </div>
    </div>
  );
}
