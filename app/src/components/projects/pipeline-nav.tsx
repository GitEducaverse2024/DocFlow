"use client";

import { Fragment } from 'react';
import { Check, Lock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PipelineStep {
  id: string;
  number: number;
  label: string;
  icon: React.ReactNode;
  status: 'completed' | 'active' | 'pending' | 'locked' | 'stale';
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
                  "flex-1 h-0.5 mt-5 min-w-2 transition-colors duration-300",
                  steps[index - 1].status === 'completed' ? "bg-emerald-600" :
                  steps[index - 1].status === 'stale' ? "bg-amber-600" : "bg-zinc-800"
                )}
              />
            )}
            <button
              onClick={() => {
                if (step.status !== 'locked') {
                  onStepClick(step.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              title={
                step.status === 'stale' ? `${step.label}: ${step.description}` :
                step.id === 'chat' && step.status === 'pending' ? 'Tu asistente está listo. Haz click para chatear.' :
                `${step.label}: ${step.description}`
              }
              className={cn(
                "flex flex-col items-center gap-1 relative px-1 sm:px-2",
                step.status === 'locked' && "opacity-40 cursor-not-allowed",
                step.status !== 'locked' && "cursor-pointer group"
              )}
            >
              {/* Circle with hover scale and pulse ring */}
              <div className="relative">
                {/* Pulse ring on active step */}
                {step.id === activeStep && step.status !== 'locked' && (
                  <div className={cn(
                    "absolute inset-0 rounded-full animate-ping opacity-20",
                    step.status === 'completed' ? "bg-emerald-500" :
                    step.status === 'stale' ? "bg-amber-500" :
                    step.status === 'active' ? "bg-violet-500" : "bg-zinc-500"
                  )} style={{ animationDuration: '2s' }} />
                )}
                {/* Special pulse for Chat step when available */}
                {step.id === 'chat' && step.status === 'pending' && step.id !== activeStep && (
                  <div className="absolute inset-0 rounded-full animate-ping opacity-15 bg-emerald-400" style={{ animationDuration: '2.5s' }} />
                )}
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-200",
                  step.status !== 'locked' && "group-hover:scale-110",
                  // Completed
                  step.status === 'completed' && step.id === activeStep && "bg-emerald-600 border-emerald-600 text-white ring-4 ring-emerald-600/20",
                  step.status === 'completed' && step.id !== activeStep && "bg-emerald-600 border-emerald-600 text-white group-hover:ring-2 group-hover:ring-emerald-600/30",
                  // Stale
                  step.status === 'stale' && step.id === activeStep && "bg-amber-600 border-amber-600 text-white ring-4 ring-amber-600/20",
                  step.status === 'stale' && step.id !== activeStep && "bg-amber-600 border-amber-600 text-white group-hover:ring-2 group-hover:ring-amber-600/30",
                  // Active
                  step.status === 'active' && "bg-violet-600 border-violet-600 text-white ring-4 ring-violet-600/20",
                  // Chat step special gradient when available
                  step.id === 'chat' && step.status === 'pending' && step.id === activeStep && "bg-gradient-to-br from-violet-500 to-emerald-500 border-emerald-500 text-white ring-4 ring-emerald-500/20",
                  step.id === 'chat' && step.status === 'pending' && step.id !== activeStep && "bg-gradient-to-br from-violet-500 to-emerald-500 border-emerald-500 text-white ring-2 ring-emerald-500/30 group-hover:ring-4 group-hover:ring-emerald-500/30",
                  // Normal pending styles (non-chat)
                  step.id !== 'chat' && step.status === 'pending' && step.id === activeStep && "bg-zinc-700 border-zinc-600 text-zinc-200 ring-4 ring-zinc-600/20",
                  step.id !== 'chat' && step.status === 'pending' && step.id !== activeStep && "bg-zinc-800 border-zinc-700 text-zinc-400 group-hover:border-zinc-600 group-hover:ring-2 group-hover:ring-zinc-600/20",
                  // Locked
                  step.status === 'locked' && "bg-zinc-900 border-zinc-800 text-zinc-600"
                )}>
                  {step.status === 'completed' ? (
                    <Check className="w-5 h-5" />
                  ) : step.status === 'stale' ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : step.status === 'locked' ? (
                    <Lock className="w-4 h-4" />
                  ) : (
                    step.number
                  )}
                </div>
              </div>

              {/* Label */}
              <span className={cn(
                "text-xs font-medium hidden sm:block transition-colors",
                step.id === activeStep && step.status === 'completed' && "text-emerald-400",
                step.id !== activeStep && step.status === 'completed' && "text-emerald-400/70 group-hover:text-emerald-400",
                step.status === 'stale' && "text-amber-400",
                step.status === 'active' && "text-violet-400",
                step.id === 'chat' && step.status === 'pending' && "text-emerald-400",
                step.id !== 'chat' && step.status === 'pending' && step.id === activeStep && "text-zinc-300",
                step.id !== 'chat' && step.status === 'pending' && step.id !== activeStep && "text-zinc-500 group-hover:text-zinc-300",
                step.status === 'locked' && "text-zinc-600"
              )}>
                {step.id === 'chat' && step.status === 'pending' ? 'Chat ✨' : step.label}
              </span>

              {/* Description */}
              <span className={cn(
                "text-[10px] hidden sm:block whitespace-nowrap",
                step.status === 'stale' ? "text-amber-500/70" :
                step.id === 'chat' && step.status === 'pending' ? "text-emerald-500/70" : "text-zinc-600"
              )}>
                {step.id === 'chat' && step.status === 'pending' ? 'Listo para chatear' : step.description}
              </span>
            </button>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
