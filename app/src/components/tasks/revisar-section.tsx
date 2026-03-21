"use client";

import { Save, Rocket, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PipelineStep } from './pipeline-section';
import type { ForkBranch } from './fork-step-config';

interface ScheduleConfig {
  time: string;
  days: 'always' | 'weekdays' | 'weekends' | 'custom';
  custom_days?: number[];
  start_date?: string;
  end_date?: string;
  is_active: boolean;
}

interface RevisarSectionProps {
  taskName: string;
  taskDescription: string;
  expectedOutput: string;
  projectNames: string[];
  pipelineSteps: PipelineStep[];
  forkBranches: Record<string, ForkBranch[]>;
  executionMode: 'single' | 'variable' | 'scheduled';
  executionCount: number;
  scheduleConfig: ScheduleConfig | null;
  saving: boolean;
  launching: boolean;
  onSave: () => void;
  onLaunch: () => void;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
}

const STEP_TYPE_COLORS: Record<string, string> = {
  agent: 'bg-blue-500/20 text-blue-300',
  canvas: 'bg-emerald-500/20 text-emerald-300',
  checkpoint: 'bg-amber-500/20 text-amber-300',
  merge: 'bg-purple-500/20 text-purple-300',
  fork: 'bg-orange-500/20 text-orange-300',
  join: 'bg-orange-500/20 text-orange-300',
};

function getDayDescription(config: ScheduleConfig, t: RevisarSectionProps['t']): string {
  switch (config.days) {
    case 'weekdays': return t('wizard.section4.daysWeekdays');
    case 'weekends': return t('wizard.section4.daysWeekends');
    case 'custom': return t('wizard.section4.daysCustom');
    case 'always':
    default: return t('wizard.section4.daysAlways');
  }
}

export function RevisarSection({
  taskName,
  taskDescription,
  expectedOutput,
  projectNames,
  pipelineSteps,
  forkBranches,
  executionMode,
  executionCount,
  scheduleConfig,
  saving,
  launching,
  onSave,
  onLaunch,
  t,
}: RevisarSectionProps) {
  const isBusy = saving || launching;

  return (
    <div className="space-y-4">
      {/* Objetivo block */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 space-y-1">
        <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
          {t('wizard.section5.objetivo')}
        </h4>
        <p className="text-sm font-medium text-zinc-100">{taskName}</p>
        {taskDescription && <p className="text-sm text-zinc-400">{taskDescription}</p>}
        {expectedOutput && (
          <p className="text-xs text-zinc-500 mt-1">
            {t('wizard.step1.expectedOutput')}: {expectedOutput}
          </p>
        )}
      </div>

      {/* CatBrains block */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
        <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
          {t('wizard.section5.catbrains')}
        </h4>
        {projectNames.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {projectNames.map((name, i) => (
              <span
                key={i}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-violet-500/15 text-violet-300 border border-violet-500/20"
              >
                {name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">{t('wizard.section5.catbrainsNone')}</p>
        )}
      </div>

      {/* Pipeline block */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
        <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
          {t('wizard.section5.pipeline')}
        </h4>
        <div className="space-y-1.5">
          {pipelineSteps.map((step, i) => {
            const colorClass = STEP_TYPE_COLORS[step.type] || 'bg-zinc-700/30 text-zinc-400';

            if (step.type === 'fork' && step.fork_group) {
              const branches = forkBranches[step.fork_group] || [];
              return (
                <div key={step.id}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-600 w-5 text-right">{i + 1}.</span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${colorClass}`}>
                      fork
                    </span>
                    <span className="text-sm text-zinc-300">
                      {t('wizard.section5.fork', { count: branches.length })}
                    </span>
                  </div>
                  {branches.map((branch, bi) => (
                    <div key={bi} className="ml-10 text-xs text-zinc-500">
                      {branch.label}: {branch.steps.length} {branch.steps.length === 1 ? 'paso' : 'pasos'}
                    </div>
                  ))}
                </div>
              );
            }

            return (
              <div key={step.id} className="flex items-center gap-2">
                <span className="text-xs text-zinc-600 w-5 text-right">{i + 1}.</span>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${colorClass}`}>
                  {step.type}
                </span>
                <span className="text-sm text-zinc-300">{step.name || '-'}</span>
              </div>
            );
          })}
          {pipelineSteps.length === 0 && (
            <p className="text-sm text-zinc-500">{t('wizard.pipeline.summaryEmpty')}</p>
          )}
        </div>
      </div>

      {/* Ciclo block */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
        <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
          {t('wizard.section5.ciclo')}
        </h4>
        <p className="text-sm text-zinc-300">
          {executionMode === 'single' && t('wizard.section4.summary.single')}
          {executionMode === 'variable' && t('wizard.section4.summary.variable', { count: executionCount })}
          {executionMode === 'scheduled' && scheduleConfig && (
            t('wizard.section4.summary.scheduled', {
              time: scheduleConfig.time,
              days: getDayDescription(scheduleConfig, t),
            })
          )}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-3 pt-2">
        <Button
          onClick={onSave}
          disabled={isBusy}
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {t('wizard.section5.saveDraft')}
        </Button>
        <Button
          onClick={onLaunch}
          disabled={isBusy}
          className="bg-violet-600 hover:bg-violet-500 text-white"
        >
          {launching ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Rocket className="w-4 h-4 mr-2" />
          )}
          {t('wizard.section5.launchNow')}
        </Button>
      </div>
    </div>
  );
}
