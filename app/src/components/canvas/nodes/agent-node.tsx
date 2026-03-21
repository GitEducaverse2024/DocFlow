"use client";

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Check, X, Clock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

export function AgentNode({ data, selected }: NodeProps) {
  const t = useTranslations('canvas');
  const nodeData = data as {
    label?: string;
    agentId?: string | null;
    agentName?: string | null;
    model?: string;
    mode?: string;
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
    selected    ? 'border-violet-400' : 'border-violet-600';

  return (
    <div
      className={`w-[240px] min-h-[80px] rounded-xl bg-violet-950/80 border-2 transition-colors relative ${borderClass} p-3`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#7c3aed', width: 10, height: 10 }}
      />
      <div className="flex items-center gap-2 mb-2">
        <Image src="/Images/icon/catpaw.png" alt="CatPaw" width={16} height={16} className="shrink-0" />
        <span className="text-sm font-semibold text-violet-100 truncate">
          {nodeData.label || t('nodes.agent')}
        </span>
      </div>
      <div className="text-xs text-zinc-400 truncate">
        {nodeData.agentName || (nodeData.agentId ? nodeData.agentId : t('nodes.noAgent'))}
      </div>
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        {nodeData.model && (
          <span className="inline-block text-[10px] bg-violet-800/60 text-violet-300 px-1.5 py-0.5 rounded-full">
            {nodeData.model}
          </span>
        )}
        {nodeData.mode && (
          <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full ${
            nodeData.mode === 'chat' ? 'bg-violet-800/60 text-violet-300' :
            nodeData.mode === 'processor' ? 'bg-teal-800/60 text-teal-300' :
            'bg-amber-800/60 text-amber-300'
          }`}>
            {nodeData.mode}
          </span>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#7c3aed', width: 10, height: 10 }}
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
