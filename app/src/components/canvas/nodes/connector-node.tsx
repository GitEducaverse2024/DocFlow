"use client";

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Plug } from 'lucide-react';

export function ConnectorNode({ data, selected }: NodeProps) {
  const nodeData = data as {
    label?: string;
    connectorId?: string | null;
    connectorName?: string | null;
    mode?: 'before' | 'after';
  };

  return (
    <div
      className={`w-[220px] min-h-[80px] rounded-xl bg-orange-950/80 border-2 transition-colors ${
        selected ? 'border-orange-400' : 'border-orange-600'
      } p-3`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#ea580c', width: 10, height: 10 }}
      />
      <div className="flex items-center gap-2 mb-2">
        <Plug className="w-4 h-4 text-orange-400 shrink-0" />
        <span className="text-sm font-semibold text-orange-100 truncate">
          {nodeData.label || 'Conector'}
        </span>
      </div>
      <div className="text-xs text-zinc-400 truncate">
        {nodeData.connectorName || (nodeData.connectorId ? nodeData.connectorId : 'Sin conector')}
      </div>
      {nodeData.mode && (
        <span className={`mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded-full ${
          nodeData.mode === 'before'
            ? 'bg-orange-800/60 text-orange-300'
            : 'bg-amber-800/60 text-amber-300'
        }`}>
          {nodeData.mode === 'before' ? 'Antes' : 'Después'}
        </span>
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#ea580c', width: 10, height: 10 }}
      />
    </div>
  );
}
