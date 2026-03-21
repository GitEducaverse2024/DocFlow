"use client";

import { NextExecutionPreview } from './next-execution-preview';
import type { ScheduleConfig } from '@/lib/schedule-utils';

interface ScheduleConfiguratorProps {
  config: ScheduleConfig;
  onChange: (config: ScheduleConfig) => void;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
}

const DAY_OPTIONS: { value: ScheduleConfig['days']; labelKey: string }[] = [
  { value: 'always', labelKey: 'wizard.section4.daysAlways' },
  { value: 'weekdays', labelKey: 'wizard.section4.daysWeekdays' },
  { value: 'weekends', labelKey: 'wizard.section4.daysWeekends' },
  { value: 'custom', labelKey: 'wizard.section4.daysCustom' },
];

// Monday-Sunday in Spanish abbreviations, mapped to JS day numbers
const WEEKDAY_BUTTONS: { label: string; dayNum: number }[] = [
  { label: 'L', dayNum: 1 },
  { label: 'M', dayNum: 2 },
  { label: 'X', dayNum: 3 },
  { label: 'J', dayNum: 4 },
  { label: 'V', dayNum: 5 },
  { label: 'S', dayNum: 6 },
  { label: 'D', dayNum: 0 },
];

export function ScheduleConfigurator({ config, onChange, t }: ScheduleConfiguratorProps) {
  function toggleCustomDay(dayNum: number) {
    const current = config.custom_days || [];
    const updated = current.includes(dayNum)
      ? current.filter(d => d !== dayNum)
      : [...current, dayNum];
    onChange({ ...config, custom_days: updated });
  }

  return (
    <div className="space-y-4 mt-3">
      {/* Time picker */}
      <div>
        <label className="block text-sm text-zinc-400 mb-1.5">
          {t('wizard.section4.time')}
        </label>
        <input
          type="time"
          value={config.time}
          onChange={(e) => onChange({ ...config, time: e.target.value })}
          className="bg-zinc-900 border border-zinc-800 text-zinc-50 rounded px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50"
        />
      </div>

      {/* Day selector */}
      <div>
        <label className="block text-sm text-zinc-400 mb-1.5">
          {t('wizard.section4.days')}
        </label>
        <div className="flex flex-wrap gap-1">
          {DAY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ ...config, days: opt.value, custom_days: opt.value === 'custom' ? (config.custom_days || []) : undefined })}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                config.days === opt.value
                  ? 'bg-violet-500/20 border border-violet-500/40 text-violet-300'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-300'
              }`}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Custom days */}
      {config.days === 'custom' && (
        <div className="flex gap-1.5">
          {WEEKDAY_BUTTONS.map((wd) => {
            const isActive = (config.custom_days || []).includes(wd.dayNum);
            return (
              <button
                key={wd.dayNum}
                type="button"
                onClick={() => toggleCustomDay(wd.dayNum)}
                className={`w-9 h-9 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-violet-500 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {wd.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Date range */}
      <div>
        <label className="block text-sm text-zinc-400 mb-1.5">
          {t('wizard.section4.dateRange')}
        </label>
        <div className="flex gap-3 items-center">
          <div>
            <span className="text-xs text-zinc-500 block mb-1">{t('wizard.section4.dateFrom')}</span>
            <input
              type="date"
              value={config.start_date || ''}
              onChange={(e) => onChange({ ...config, start_date: e.target.value || undefined })}
              className="bg-zinc-900 border border-zinc-800 text-zinc-50 rounded px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50"
            />
          </div>
          <div>
            <span className="text-xs text-zinc-500 block mb-1">{t('wizard.section4.dateTo')}</span>
            <input
              type="date"
              value={config.end_date || ''}
              onChange={(e) => onChange({ ...config, end_date: e.target.value || undefined })}
              className="bg-zinc-900 border border-zinc-800 text-zinc-50 rounded px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50"
            />
          </div>
        </div>
      </div>

      {/* Next execution preview */}
      <NextExecutionPreview config={config} t={t} />
    </div>
  );
}
