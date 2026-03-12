"use client";

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { GitBranch } from 'lucide-react';

export function ConditionNode({ data, selected }: NodeProps) {
  const nodeData = data as {
    label?: string;
    condition?: string;
  };

  return (
    <div
      className={`w-[220px] min-h-[80px] rounded-xl bg-yellow-950/80 border-2 transition-colors ${
        selected ? 'border-yellow-400' : 'border-yellow-600'
      } p-3 relative`}
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
    </div>
  );
}
