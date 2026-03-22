"use client";

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Network, Check, X, Clock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function MultiAgentNode({ data, selected }: NodeProps) {
  const t = useTranslations('canvas');
  const nodeData = data as {
    label?: string;
    target_task_id?: string;
    target_task_name?: string;
    execution_mode?: 'sync' | 'async';
    payload_template?: string;
    timeout?: number;
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
    selected    ? 'border-purple-400' : 'border-purple-600';

  return (
    <div
      className={`w-[240px] min-h-[100px] rounded-xl bg-purple-950/80 border-2 transition-colors relative ${borderClass} p-3`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#9333ea', width: 10, height: 10 }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Network className="w-4 h-4 text-purple-400 shrink-0" />
        <span className="text-sm font-semibold text-purple-100 truncate">
          {nodeData.label || t('nodes.multiagent')}
        </span>
      </div>

      {/* Target CatFlow name */}
      {nodeData.target_task_name && (
        <div className="text-xs text-zinc-400 truncate">{nodeData.target_task_name}</div>
      )}

      {/* Mode badge */}
      <span className="mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-purple-800/60 text-purple-300">
        {t(`nodes.multiagentMode.${nodeData.execution_mode || 'sync'}`)}
      </span>

      {/* output-response handle -- green */}
      <Handle
        type="source"
        position={Position.Right}
        id="output-response"
        style={{ top: '35%', background: '#16a34a', width: 10, height: 10 }}
      />
      <span
        className="absolute text-[9px] text-green-400 font-medium pointer-events-none select-none"
        style={{ right: -12, top: 'calc(35% - 7px)' }}
      >
        &#10003;
      </span>

      {/* output-error handle -- red */}
      <Handle
        type="source"
        position={Position.Right}
        id="output-error"
        style={{ top: '65%', background: '#dc2626', width: 10, height: 10 }}
      />
      <span
        className="absolute text-[9px] text-red-400 font-medium pointer-events-none select-none"
        style={{ right: -12, top: 'calc(65% - 7px)' }}
      >
        &#10007;
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
