"use client";

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Bot } from 'lucide-react';

export function AgentNode({ data, selected }: NodeProps) {
  const nodeData = data as {
    label?: string;
    agentId?: string | null;
    agentName?: string | null;
    model?: string;
  };

  return (
    <div
      className={`w-[240px] min-h-[80px] rounded-xl bg-violet-950/80 border-2 transition-colors ${
        selected ? 'border-violet-400' : 'border-violet-600'
      } p-3`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#7c3aed', width: 10, height: 10 }}
      />
      <div className="flex items-center gap-2 mb-2">
        <Bot className="w-4 h-4 text-violet-400 shrink-0" />
        <span className="text-sm font-semibold text-violet-100 truncate">
          {nodeData.label || 'Agente'}
        </span>
      </div>
      <div className="text-xs text-zinc-400 truncate">
        {nodeData.agentName || (nodeData.agentId ? nodeData.agentId : 'Sin agente')}
      </div>
      {nodeData.model && (
        <span className="mt-1 inline-block text-[10px] bg-violet-800/60 text-violet-300 px-1.5 py-0.5 rounded-full">
          {nodeData.model}
        </span>
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#7c3aed', width: 10, height: 10 }}
      />
    </div>
  );
}
