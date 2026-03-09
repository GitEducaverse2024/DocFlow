"use client";

import { Fragment } from 'react';
import { Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PipelineStep {
  id: string;
  number: number;
  label: string;
  icon: React.ReactNode;
  status: 'completed' | 'active' | 'pending' | 'locked';
  description: string;
}

interface PipelineNavProps {
  steps: PipelineStep[];
  activeStep: string;
  onStepClick: (stepId: string) => void;
}

export function PipelineNav({ steps, activeStep, onStepClick }: PipelineNavProps) {
  return (
    <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-sm -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 py-3">
      <div className="flex items-start w-full gap-0">
        {steps.map((step, index) => (
          <Fragment key={step.id}>
            {index > 0 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mt-5 min-w-2",
                  steps[index - 1].status === 'completed' ? "bg-emerald-600" : "bg-zinc-800"
                )}
              />
            )}
            <button
              onClick={() => step.status !== 'locked' && onStepClick(step.id)}
              className={cn(
                "flex flex-col items-center gap-1 relative px-1 sm:px-2",
                step.status === 'locked' && "opacity-40 cursor-not-allowed",
                step.status !== 'locked' && "cursor-pointer group"
              )}
            >
              {/* Circle */}
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all",
                step.status === 'completed' && step.id === activeStep && "bg-emerald-600 border-emerald-600 text-white ring-4 ring-emerald-600/20",
                step.status === 'completed' && step.id !== activeStep && "bg-emerald-600 border-emerald-600 text-white",
                step.status === 'active' && "bg-violet-600 border-violet-600 text-white ring-4 ring-violet-600/20",
                step.status === 'pending' && step.id === activeStep && "bg-zinc-700 border-zinc-600 text-zinc-200 ring-4 ring-zinc-600/20",
                step.status === 'pending' && step.id !== activeStep && "bg-zinc-800 border-zinc-700 text-zinc-400",
                step.status === 'locked' && "bg-zinc-900 border-zinc-800 text-zinc-600"
              )}>
                {step.status === 'completed' ? (
                  <Check className="w-5 h-5" />
                ) : step.status === 'locked' ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  step.number
                )}
              </div>

              {/* Label — hidden on mobile */}
              <span className={cn(
                "text-xs font-medium hidden sm:block",
                step.id === activeStep && step.status === 'completed' && "text-emerald-400",
                step.id !== activeStep && step.status === 'completed' && "text-emerald-400/70",
                step.status === 'active' && "text-violet-400",
                step.status === 'pending' && step.id === activeStep && "text-zinc-300",
                step.status === 'pending' && step.id !== activeStep && "text-zinc-500",
                step.status === 'locked' && "text-zinc-600"
              )}>
                {step.label}
              </span>

              {/* Description — hidden on mobile */}
              <span className="text-[10px] text-zinc-600 hidden sm:block whitespace-nowrap">
                {step.description}
              </span>
            </button>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
