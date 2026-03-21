"use client";

import { Input } from '@/components/ui/input';
import { ScheduleConfigurator } from './schedule-configurator';

interface ScheduleConfig {
  time: string;
  days: 'always' | 'weekdays' | 'weekends' | 'custom';
  custom_days?: number[];
  start_date?: string;
  end_date?: string;
  is_active: boolean;
}

interface CicloSectionProps {
  executionMode: 'single' | 'variable' | 'scheduled';
  setExecutionMode: (mode: 'single' | 'variable' | 'scheduled') => void;
  executionCount: number;
  setExecutionCount: (count: number) => void;
  scheduleConfig: ScheduleConfig | null;
  setScheduleConfig: (config: ScheduleConfig | null) => void;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
}

const MODES: { value: 'single' | 'variable' | 'scheduled'; titleKey: string; descKey: string; detailKey: string }[] = [
  { value: 'single', titleKey: 'wizard.section4.single', descKey: 'wizard.section4.singleDesc', detailKey: 'wizard.section4.singleDetail' },
  { value: 'variable', titleKey: 'wizard.section4.variable', descKey: 'wizard.section4.variableDesc', detailKey: 'wizard.section4.variableDetail' },
  { value: 'scheduled', titleKey: 'wizard.section4.scheduled', descKey: 'wizard.section4.scheduledDesc', detailKey: 'wizard.section4.scheduledDetail' },
];

export function CicloSection({
  executionMode,
  setExecutionMode,
  executionCount,
  setExecutionCount,
  scheduleConfig,
  setScheduleConfig,
  t,
}: CicloSectionProps) {

  function handleModeChange(mode: 'single' | 'variable' | 'scheduled') {
    setExecutionMode(mode);
    if (mode === 'scheduled' && !scheduleConfig) {
      setScheduleConfig({ time: '09:00', days: 'always', is_active: true });
    }
    if (mode === 'variable' && executionCount < 2) {
      setExecutionCount(2);
    }
  }

  return (
    <div className="space-y-3">
      {/* Radio card options */}
      {MODES.map((mode) => {
        const isSelected = executionMode === mode.value;
        return (
          <div key={mode.value}>
            <button
              type="button"
              onClick={() => handleModeChange(mode.value)}
              className={`w-full text-left border rounded-lg p-4 transition-colors cursor-pointer ${
                isSelected
                  ? 'border-violet-500/40 bg-violet-500/5'
                  : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Custom radio indicator */}
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                  isSelected ? 'border-violet-500' : 'border-zinc-600'
                }`}>
                  {isSelected && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                </div>
                <div>
                  <div className={`text-sm font-medium ${isSelected ? 'text-zinc-50' : 'text-zinc-300'}`}>
                    {t(mode.titleKey)} <span className="text-zinc-500 font-normal">- {t(mode.descKey)}</span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">{t(mode.detailKey)}</div>
                </div>
              </div>
            </button>

            {/* Variable sub-form */}
            {isSelected && mode.value === 'variable' && (
              <div className="mt-3 ml-7 space-y-2">
                <label className="block text-sm text-zinc-400">
                  {t('wizard.section4.variableCount')}
                </label>
                <Input
                  type="number"
                  min={2}
                  max={100}
                  step={1}
                  value={executionCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) setExecutionCount(Math.min(100, Math.max(2, val)));
                  }}
                  className="w-24 bg-zinc-900 border-zinc-800"
                />
                <p className="text-xs text-zinc-500">
                  {t('wizard.section4.variableInfo', { count: executionCount })}
                </p>
              </div>
            )}

            {/* Scheduled sub-form */}
            {isSelected && mode.value === 'scheduled' && scheduleConfig && (
              <div className="ml-7">
                <ScheduleConfigurator
                  config={scheduleConfig}
                  onChange={setScheduleConfig}
                  t={t}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
