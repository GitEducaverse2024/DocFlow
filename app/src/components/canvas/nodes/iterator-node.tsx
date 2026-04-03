"use client";

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Repeat, Check, X, Clock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

function computeIteratorLabel(
  nodeData: { label?: string; limit_mode?: string; max_rounds?: number; max_time?: number },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: any) => string
): string {
  const mode = nodeData.limit_mode || 'none';
  switch (mode) {
    case 'rounds': {
      const rounds = nodeData.max_rounds || 10;
      return `${t('nodes.iterator')} (max ${rounds})`;
    }
    case 'time': {
      const time = nodeData.max_time || 300;
      return `${t('nodes.iterator')} (${time}s)`;
    }
    default:
      return nodeData.label || t('nodes.iterator');
  }
}

export function IteratorNode({ data, selected }: NodeProps) {
  const t = useTranslations('canvas');
  const nodeData = data as {
    label?: string;
    limit_mode?: 'none' | 'rounds' | 'time';
    max_rounds?: number;
    max_time?: number;
    separator?: string;
    iteratorEndId?: string;
  };

  const execStatus = (data as Record<string, unknown>).executionStatus as string | undefined;
  const iterationInfo = (data as Record<string, unknown>).iterationInfo as string | undefined;
  const isRunning = execStatus === 'running';
  const isCompleted = execStatus === 'completed';
  const isFailed = execStatus === 'failed';
  const isWaiting = execStatus === 'waiting';
  const isSkipped = execStatus === 'skipped';

  const borderClass =
    isRunning   ? 'border-violet-400 animate-pulse shadow-violet-500/30 shadow-lg' :
    isCompleted ? 'border-emerald-400 shadow-emerald-500/20 shadow-md' :
    isFailed    ? 'border-red-400 shadow-red-500/20 shadow-md' :
    isWaiting   ? 'border-amber-400 animate-pulse shadow-amber-500/20 shadow-md' :
    isSkipped   ? 'border-zinc-600 opacity-50' :
    selected    ? 'border-rose-400' : 'border-rose-600';

  const displayLabel = computeIteratorLabel(nodeData, t);
  const hasPair = !!nodeData.iteratorEndId;

  return (
    <div
      className={`w-[240px] min-h-[100px] rounded-xl bg-rose-950/80 border-2 transition-colors relative ${borderClass} p-3`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#e11d48', width: 10, height: 10 }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Repeat className="w-4 h-4 text-rose-400 shrink-0" />
        <span className="text-sm font-semibold text-rose-100 truncate">
          {displayLabel}
        </span>
      </div>

      {/* Pair status */}
      <div className="text-xs text-zinc-400 mb-1">
        {hasPair
          ? <span className="text-rose-300">{t('nodes.iteratorPaired')}</span>
          : <span className="text-zinc-500 italic">{t('nodes.iteratorNoPair')}</span>
        }
      </div>

      {/* Iteration progress during execution */}
      {iterationInfo && (
        <div className="text-[10px] text-rose-300 font-mono bg-rose-950/60 rounded px-1.5 py-0.5 mt-1">
          {iterationInfo}
        </div>
      )}

      {/* Element handle — emits current element per iteration (top-right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="element"
        style={{ top: '35%', background: '#16a34a', width: 10, height: 10 }}
      />
      <span
        className="absolute text-[9px] text-green-400 font-medium pointer-events-none select-none"
        style={{ right: -8, top: 'calc(35% - 7px)' }}
      >
        ⟳
      </span>

      {/* Completed handle — bypass for empty arrays (bottom-right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="completed"
        style={{ top: '65%', background: '#2563eb', width: 10, height: 10 }}
      />
      <span
        className="absolute text-[9px] text-blue-400 font-medium pointer-events-none select-none"
        style={{ right: -12, top: 'calc(65% - 7px)' }}
      >
        ✓✓
      </span>

      {/* Execution status indicator */}
      {execStatus && execStatus !== 'pending' && (
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs">
          {isRunning && <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />}
          {isCompleted && <Check className="w-4 h-4 text-emerald-400" />}
          {isFailed && <X className="w-4 h-4 text-red-400" />}
          {isWaiting && <Clock className="w-4 h-4 text-amber-400" />}
        </div>
      )}
    </div>
  );
}
