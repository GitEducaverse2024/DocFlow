"use client";

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PipelineStep } from './pipeline-nav';

interface PipelineFooterProps {
  steps: PipelineStep[];
  activeStep: string;
  onStepChange: (stepId: string) => void;
}

export function PipelineFooter({ steps, activeStep, onStepChange }: PipelineFooterProps) {
  const t = useTranslations('pipeline');
  const currentIndex = steps.findIndex(s => s.id === activeStep);
  if (currentIndex === -1) return null;

  const prevStep = currentIndex > 0 ? steps[currentIndex - 1] : null;
  const nextStep = currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null;

  const canGoPrev = prevStep && prevStep.status !== 'locked';
  const canGoNext = nextStep && nextStep.status !== 'locked';

  const stepConfig = (t.raw(`steps.${activeStep}`) as { next: string; prev: string } | undefined);
  const labels = stepConfig || { next: t('defaultNext'), prev: t('defaultPrev') };

  const handleNav = (stepId: string) => {
    onStepChange(stepId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex items-center justify-between mt-8 pt-4 border-t border-zinc-800">
      {canGoPrev ? (
        <Button
          variant="outline"
          onClick={() => handleNav(prevStep.id)}
          className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
        >
          <ChevronLeft className="w-4 h-4 mr-1.5" />
          {labels.prev}
        </Button>
      ) : (
        <div />
      )}

      {canGoNext ? (
        <Button
          onClick={() => handleNav(nextStep.id)}
          className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
        >
          {labels.next}
          <ChevronRight className="w-4 h-4 ml-1.5" />
        </Button>
      ) : (
        <div />
      )}
    </div>
  );
}
