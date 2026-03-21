"use client";

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { UserCheck, Check, X, Clock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function CheckpointNode({ data, selected }: NodeProps) {
  const t = useTranslations('canvas');
  const nodeData = data as {
    label?: string;
    instructions?: string;
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
    selected    ? 'border-amber-400' : 'border-amber-600';

  return (
    <div
      className={`w-[220px] min-h-[90px] rounded-xl bg-amber-950/80 border-2 transition-colors relative ${borderClass} p-3`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#d97706', width: 10, height: 10 }}
      />
      <div className="flex items-center gap-2 mb-2">
        <UserCheck className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-sm font-semibold text-amber-100 truncate">
          {nodeData.label || t('nodes.checkpoint')}
        </span>
      </div>
      {nodeData.instructions && (
        <div className="text-xs text-zinc-400 line-clamp-2">
          {nodeData.instructions}
        </div>
      )}
      {isWaiting && (
        <div className="mt-1 text-xs text-amber-400 font-medium">
          {t('nodes.waitingApproval')}
        </div>
      )}

      {/* Approved source handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="approved"
        style={{ top: '35%', background: '#059669', width: 10, height: 10 }}
      />
      <span
        className="absolute text-[9px] text-emerald-400 font-medium pointer-events-none select-none"
        style={{ right: -58, top: 'calc(35% - 7px)' }}
      >
        {t('nodes.approved')}
      </span>

      {/* Rejected source handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="rejected"
        style={{ top: '65%', background: '#dc2626', width: 10, height: 10 }}
      />
      <span
        className="absolute text-[9px] text-red-400 font-medium pointer-events-none select-none"
        style={{ right: -60, top: 'calc(65% - 7px)' }}
      >
        {t('nodes.rejected')}
      </span>

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
