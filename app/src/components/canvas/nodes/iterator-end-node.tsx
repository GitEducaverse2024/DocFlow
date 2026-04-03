"use client";

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { CornerDownLeft, Check, X, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function IteratorEndNode({ data, selected }: NodeProps) {
  const t = useTranslations('canvas');
  const nodeData = data as {
    label?: string;
    iteratorId?: string;
  };

  const execStatus = (data as Record<string, unknown>).executionStatus as string | undefined;
  const iterationInfo = (data as Record<string, unknown>).iterationInfo as string | undefined;
  const isRunning = execStatus === 'running';
  const isCompleted = execStatus === 'completed';
  const isFailed = execStatus === 'failed';
  const isSkipped = execStatus === 'skipped';

  const borderClass =
    isRunning   ? 'border-violet-400 animate-pulse shadow-violet-500/30 shadow-lg' :
    isCompleted ? 'border-emerald-400 shadow-emerald-500/20 shadow-md' :
    isFailed    ? 'border-red-400 shadow-red-500/20 shadow-md' :
    isSkipped   ? 'border-zinc-600 opacity-50' :
    selected    ? 'border-rose-400' : 'border-rose-700';

  const hasPair = !!nodeData.iteratorId;

  return (
    <div
      className={`w-[160px] min-h-[70px] rounded-xl bg-rose-950/60 border-2 border-dashed transition-colors relative ${borderClass} p-2.5`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#e11d48', width: 10, height: 10 }}
      />

      {/* Header */}
      <div className="flex items-center gap-1.5 mb-1">
        <CornerDownLeft className="w-3.5 h-3.5 text-rose-400 shrink-0" />
        <span className="text-xs font-semibold text-rose-200 truncate">
          {nodeData.label || t('nodes.iteratorEnd')}
        </span>
      </div>

      {/* Pair indicator */}
      {!hasPair && (
        <div className="text-[10px] text-zinc-500 italic">{t('nodes.iteratorEndNoPair')}</div>
      )}

      {/* Iteration info during execution */}
      {iterationInfo && (
        <div className="text-[10px] text-rose-300 font-mono">{iterationInfo}</div>
      )}

      {/* Output handle — carries accumulated results after loop completes */}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#e11d48', width: 10, height: 10 }}
      />

      {/* Execution status indicator */}
      {execStatus && execStatus !== 'pending' && (
        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-xs">
          {isRunning && <Loader2 className="w-3 h-3 text-violet-400 animate-spin" />}
          {isCompleted && <Check className="w-3 h-3 text-emerald-400" />}
          {isFailed && <X className="w-3 h-3 text-red-400" />}
        </div>
      )}
    </div>
  );
}
