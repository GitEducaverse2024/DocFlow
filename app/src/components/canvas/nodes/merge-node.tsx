"use client";

import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import { GitMerge, Plus, Minus, Check, X, Clock, Loader2 } from 'lucide-react';

export function MergeNode({ data, selected, id }: NodeProps) {
  const nodeData = data as {
    label?: string;
    agentId?: string | null;
    instructions?: string;
    handleCount?: number;
  };
  const { updateNode } = useReactFlow();

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
    selected    ? 'border-cyan-400' : 'border-cyan-600';

  const handleCount = nodeData.handleCount ?? 3;

  // Evenly distribute target handles
  const getHandleTop = (index: number, total: number) => {
    const step = 80 / (total + 1);
    return `${step * (index + 1) + 10}%`;
  };

  const decrease = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (handleCount > 2 && !execStatus) {
      updateNode(id, { data: { ...nodeData, handleCount: handleCount - 1 } });
    }
  };

  const increase = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (handleCount < 5 && !execStatus) {
      updateNode(id, { data: { ...nodeData, handleCount: handleCount + 1 } });
    }
  };

  return (
    <div
      className={`w-[200px] min-h-[70px] rounded-xl bg-cyan-950/80 border-2 transition-colors relative ${borderClass} p-3`}
    >
      {/* Named target handles */}
      {Array.from({ length: handleCount }, (_, i) => (
        <Handle
          key={`target-${i + 1}`}
          type="target"
          position={Position.Left}
          id={`target-${i + 1}`}
          style={{ top: getHandleTop(i, handleCount), background: '#0891b2', width: 10, height: 10 }}
        />
      ))}

      <div className="flex items-center gap-2 mb-1">
        <GitMerge className="w-4 h-4 text-cyan-400 shrink-0" />
        <span className="text-sm font-semibold text-cyan-100 truncate">
          {nodeData.label || 'Merge'}
        </span>
      </div>
      <div className="flex items-center gap-1 mt-1">
        <span className="text-xs text-zinc-400">({handleCount} entradas)</span>
        <button
          onClick={decrease}
          disabled={handleCount <= 2 || !!execStatus}
          className="ml-auto p-0.5 rounded bg-cyan-900/50 hover:bg-cyan-800/60 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Quitar entrada"
        >
          <Minus className="w-3 h-3 text-cyan-300" />
        </button>
        <button
          onClick={increase}
          disabled={handleCount >= 5 || !!execStatus}
          className="p-0.5 rounded bg-cyan-900/50 hover:bg-cyan-800/60 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Agregar entrada"
        >
          <Plus className="w-3 h-3 text-cyan-300" />
        </button>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#0891b2', width: 10, height: 10 }}
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
