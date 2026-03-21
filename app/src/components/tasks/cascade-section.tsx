"use client";

import { Check, ChevronDown, ChevronUp } from 'lucide-react';

interface CascadeSectionProps {
  index: number;
  title: string;
  isCompleted: boolean;
  isActive: boolean;
  isLocked: boolean;
  summary: string;
  onToggle: () => void;
  children: React.ReactNode;
}

export function CascadeSection({
  index,
  title,
  isCompleted,
  isActive,
  isLocked,
  summary,
  onToggle,
  children,
}: CascadeSectionProps) {
  const circleClasses = isCompleted
    ? 'bg-emerald-500/20 text-emerald-400'
    : isActive
      ? 'bg-violet-500 text-white'
      : 'bg-zinc-800 text-zinc-500';

  const borderClasses = isActive
    ? 'border-violet-500/40'
    : 'border-zinc-800';

  const wrapperClasses = isLocked
    ? 'opacity-50 pointer-events-none'
    : '';

  return (
    <div className={`border rounded-lg ${borderClasses} ${wrapperClasses} transition-colors`}>
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        disabled={isLocked}
      >
        {/* Numbered circle */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ${circleClasses}`}>
          {isCompleted ? <Check className="w-4 h-4" /> : index + 1}
        </div>

        {/* Title */}
        <span className={`text-sm font-medium flex-1 ${isActive ? 'text-zinc-50' : isCompleted ? 'text-zinc-300' : 'text-zinc-500'}`}>
          {title}
        </span>

        {/* Summary (only when completed and collapsed) */}
        {isCompleted && !isActive && summary && (
          <span className="text-xs text-zinc-500 truncate max-w-[300px]">
            {summary}
          </span>
        )}

        {/* Chevron */}
        {!isLocked && (
          isActive
            ? <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0" />
            : <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
        )}
      </button>

      {/* Content */}
      {isActive && (
        <div className="px-4 pb-4 pt-1 border-t border-zinc-800/50">
          {children}
        </div>
      )}
    </div>
  );
}
