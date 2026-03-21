"use client";

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Flag, Check, X, Clock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function OutputNode({ data, selected }: NodeProps) {
  const t = useTranslations('canvas');
  const nodeData = data as {
    label?: string;
    outputName?: string;
    format?: 'markdown' | 'json' | 'plain';
  };

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

  const formatLabels: Record<string, string> = {
    markdown: t('nodeConfig.output.formatMarkdown'),
    json: t('nodeConfig.output.formatJson'),
    plain: t('nodeConfig.output.formatPlain'),
  };

  return (
    <div
      className={`w-[120px] min-h-[80px] rounded-full flex flex-col items-center justify-center bg-zinc-900 border-2 transition-colors relative ${borderClass} px-3 py-2`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#059669', width: 10, height: 10 }}
      />
      <Flag className="w-4 h-4 text-emerald-400 mb-1" />
      <span className="text-xs text-zinc-300 font-medium text-center leading-tight truncate w-full text-center">
        {nodeData.outputName || nodeData.label || t('nodes.result')}
      </span>
      {nodeData.format && (
        <span className="text-[9px] text-zinc-500 mt-0.5">
          {formatLabels[nodeData.format] || nodeData.format}
        </span>
      )}
      {isCompleted && (
        <span className="mt-1 text-[9px] bg-emerald-900/60 text-emerald-300 px-1.5 py-0.5 rounded-full">
          {t('nodes.viewResult')}
        </span>
      )}
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
