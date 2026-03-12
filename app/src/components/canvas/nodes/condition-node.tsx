"use client";

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { GitBranch, Check, X, Clock, Loader2 } from 'lucide-react';

export function ConditionNode({ data, selected }: NodeProps) {
  const nodeData = data as {
    label?: string;
    condition?: string;
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
    selected    ? 'border-yellow-400' : 'border-yellow-600';

  return (
    <div
      className={`w-[220px] min-h-[80px] rounded-xl bg-yellow-950/80 border-2 transition-colors relative ${borderClass} p-3`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#ca8a04', width: 10, height: 10 }}
      />
      <div className="flex items-center gap-2 mb-2">
        <GitBranch className="w-4 h-4 text-yellow-400 shrink-0" />
        <span className="text-sm font-semibold text-yellow-100 truncate">
          {nodeData.label || 'Condicion'}
        </span>
      </div>
      {nodeData.condition ? (
        <div className="text-xs text-zinc-400 line-clamp-2">{nodeData.condition}</div>
      ) : (
        <div className="text-xs text-zinc-500 italic">Sin condicion</div>
      )}

      {/* Yes source handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="yes"
        style={{ top: '35%', background: '#16a34a', width: 10, height: 10 }}
      />
      <span
        className="absolute text-[9px] text-green-400 font-medium pointer-events-none select-none"
        style={{ right: -20, top: 'calc(35% - 7px)' }}
      >
        Si
      </span>

      {/* No source handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="no"
        style={{ top: '65%', background: '#dc2626', width: 10, height: 10 }}
      />
      <span
        className="absolute text-[9px] text-red-400 font-medium pointer-events-none select-none"
        style={{ right: -20, top: 'calc(65% - 7px)' }}
      >
        No
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
