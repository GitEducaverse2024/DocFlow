"use client";

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { UserCheck } from 'lucide-react';

export function CheckpointNode({ data, selected }: NodeProps) {
  const nodeData = data as {
    label?: string;
    instructions?: string;
  };

  return (
    <div
      className={`w-[220px] min-h-[90px] rounded-xl bg-amber-950/80 border-2 transition-colors ${
        selected ? 'border-amber-400' : 'border-amber-600'
      } p-3 relative`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#d97706', width: 10, height: 10 }}
      />
      <div className="flex items-center gap-2 mb-2">
        <UserCheck className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-sm font-semibold text-amber-100 truncate">
          {nodeData.label || 'Checkpoint'}
        </span>
      </div>
      {nodeData.instructions && (
        <div className="text-xs text-zinc-400 line-clamp-2">
          {nodeData.instructions}
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
        Aprobado
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
        Rechazado
      </span>
    </div>
  );
}
