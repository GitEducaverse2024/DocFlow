"use client";

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface ObjetivoSectionProps {
  taskName: string;
  setTaskName: (v: string) => void;
  taskDescription: string;
  setTaskDescription: (v: string) => void;
  expectedOutput: string;
  setExpectedOutput: (v: string) => void;
  nameError: boolean;
  setNameError: (v: boolean) => void;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
}

export function ObjetivoSection({
  taskName,
  setTaskName,
  taskDescription,
  setTaskDescription,
  expectedOutput,
  setExpectedOutput,
  nameError,
  setNameError,
  t,
}: ObjetivoSectionProps) {
  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs text-zinc-500 block mb-1">
          {t('wizard.step1.taskName')} <span className="text-red-400">*</span>
        </label>
        <Input
          value={taskName}
          onChange={(e) => {
            setTaskName(e.target.value);
            if (e.target.value.trim()) setNameError(false);
          }}
          onBlur={() => { if (!taskName.trim()) setNameError(true); }}
          placeholder={t('wizard.step1.taskNamePlaceholder')}
          className={`bg-zinc-900 border-zinc-800 text-zinc-50 ${nameError ? 'border-red-500' : ''}`}
        />
        {nameError && (
          <p className="text-xs text-red-400 mt-1">{t('wizard.step1.taskNameRequired')}</p>
        )}
      </div>
      <div>
        <label className="text-xs text-zinc-500 block mb-1">{t('wizard.step1.description')}</label>
        <Textarea
          value={taskDescription}
          onChange={(e) => setTaskDescription(e.target.value)}
          placeholder={t('wizard.step1.descriptionPlaceholder')}
          className="bg-zinc-900 border-zinc-800 text-zinc-50 min-h-[80px]"
          rows={3}
        />
      </div>
      <div>
        <label className="text-xs text-zinc-500 block mb-1">{t('wizard.step1.expectedOutput')}</label>
        <Textarea
          value={expectedOutput}
          onChange={(e) => setExpectedOutput(e.target.value)}
          placeholder={t('wizard.step1.expectedOutputPlaceholder')}
          className="bg-zinc-900 border-zinc-800 text-zinc-50 min-h-[80px]"
          rows={3}
        />
      </div>
    </div>
  );
}
