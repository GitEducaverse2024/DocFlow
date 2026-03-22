"use client";

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Timer, Check, X, Clock, Loader2, Hash, Radio } from 'lucide-react';
import { useTranslations } from 'next-intl';

function computeSchedulerLabel(
  nodeData: { schedule_type?: string; delay_value?: number; delay_unit?: string; count_value?: number; label?: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: any) => string
): string {
  const type = nodeData.schedule_type || 'delay';
  switch (type) {
    case 'delay': {
      const val = nodeData.delay_value || 5;
      const unit = nodeData.delay_unit || 'minutes';
      const unitLabel = t(`nodes.schedulerUnits.${unit}`);
      return `${t('nodes.schedulerDelay')} ${val} ${unitLabel}`;
    }
    case 'count': {
      const count = nodeData.count_value || 3;
      return `${t('nodes.schedulerCount')} x${count}`;
    }
    case 'listen':
      return t('nodes.schedulerListen');
    default:
      return nodeData.label || t('nodes.scheduler');
  }
}

export function SchedulerNode({ data, selected }: NodeProps) {
  const t = useTranslations('canvas');
  const nodeData = data as {
    label?: string;
    schedule_type?: 'delay' | 'count' | 'listen';
    delay_value?: number;
    delay_unit?: string;
    count_value?: number;
    listen_timeout?: number;
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

  const displayLabel = computeSchedulerLabel(nodeData, t);
  const isListen = nodeData.schedule_type === 'listen';
  const isCount = nodeData.schedule_type === 'count';

  // Mode icon
  const ModeIcon = isListen ? Radio : isCount ? Hash : Timer;

  return (
    <div
      className={`w-[240px] min-h-[100px] rounded-xl bg-amber-950/80 border-2 transition-colors relative ${borderClass} p-3`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#d97706', width: 10, height: 10 }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <ModeIcon className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-sm font-semibold text-amber-100 truncate">
          {displayLabel}
        </span>
      </div>

      {/* Mode subtitle */}
      <div className="text-xs text-zinc-400">
        {t(`nodes.schedulerModeLabel.${nodeData.schedule_type || 'delay'}`)}
      </div>

      {/* Output handles */}
      {/* TRUE handle -- green */}
      <Handle
        type="source"
        position={Position.Right}
        id="output-true"
        style={{ top: isListen ? '25%' : '35%', background: '#16a34a', width: 10, height: 10 }}
      />
      <span
        className="absolute text-[9px] text-green-400 font-medium pointer-events-none select-none"
        style={{ right: -12, top: isListen ? 'calc(25% - 7px)' : 'calc(35% - 7px)' }}
      >
        ✓
      </span>

      {/* COMPLETED handle -- blue */}
      <Handle
        type="source"
        position={Position.Right}
        id="output-completed"
        style={{ top: isListen ? '50%' : '65%', background: '#2563eb', width: 10, height: 10 }}
      />
      <span
        className="absolute text-[9px] text-blue-400 font-medium pointer-events-none select-none"
        style={{ right: -12, top: isListen ? 'calc(50% - 7px)' : 'calc(65% - 7px)' }}
      >
        ✓✓
      </span>

      {/* FALSE handle -- red, only visible in listen mode (SCHED-03) */}
      {isListen && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="output-false"
            style={{ top: '75%', background: '#dc2626', width: 10, height: 10 }}
          />
          <span
            className="absolute text-[9px] text-red-400 font-medium pointer-events-none select-none"
            style={{ right: -12, top: 'calc(75% - 7px)' }}
          >
            ✗
          </span>
        </>
      )}

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
