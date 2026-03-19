"use client";

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PipelineStep } from './pipeline-nav';

interface PipelineFooterProps {
  steps: PipelineStep[];
  activeStep: string;
  onStepChange: (stepId: string) => void;
}

const stepLabels: Record<string, { next: string; prev: string }> = {
  sources: { next: 'Ir a Procesar', prev: '' },
  process: { next: 'Ver Historial', prev: 'Volver a Fuentes' },
  history: { next: 'Configurar RAG', prev: 'Volver a Procesar' },
  rag: { next: 'Ir al Chat', prev: 'Ver Historial' },
  chat: { next: '', prev: 'Volver a RAG' },
};

export function PipelineFooter({ steps, activeStep, onStepChange }: PipelineFooterProps) {
  const currentIndex = steps.findIndex(s => s.id === activeStep);
  if (currentIndex === -1) return null;

  const prevStep = currentIndex > 0 ? steps[currentIndex - 1] : null;
  const nextStep = currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null;

  const canGoPrev = prevStep && prevStep.status !== 'locked';
  const canGoNext = nextStep && nextStep.status !== 'locked';

  const labels = stepLabels[activeStep] || { next: 'Siguiente', prev: 'Anterior' };

  const handleNav = (stepId: string) => {
    onStepChange(stepId);
    // Scroll to top
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
