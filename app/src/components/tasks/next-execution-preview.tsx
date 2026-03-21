"use client";

import { CalendarClock } from 'lucide-react';
import { calculateNextExecution, formatNextExecution, type ScheduleConfig } from '@/lib/schedule-utils';

interface NextExecutionPreviewProps {
  config: ScheduleConfig;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
}

export function NextExecutionPreview({ config, t }: NextExecutionPreviewProps) {
  const nextExecution = calculateNextExecution(config);
  const formattedDate = nextExecution ? formatNextExecution(nextExecution, 'es-ES') : null;

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
