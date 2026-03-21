"use client";

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Play, Check, X, Clock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function StartNode({ data, selected }: NodeProps) {
  const t = useTranslations('canvas');
  const execStatus = (data as Record<string, unknown>).executionStatus as string | undefined;
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
    selected    ? 'border-emerald-400' : 'border-emerald-600';

  return (
    <div
      className={`w-[100px] h-[100px] rounded-full flex flex-col items-center justify-center bg-emerald-950 border-2 transition-colors relative ${borderClass}`}
    >
      <Play className="w-8 h-8 text-emerald-400 fill-emerald-400" />
      <span className="text-xs text-emerald-300 mt-1 font-medium">{t('nodes.start')}</span>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#059669', width: 10, height: 10 }}
      />
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
