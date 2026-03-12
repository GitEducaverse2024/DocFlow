"use client";

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Flag } from 'lucide-react';

export function OutputNode({ data, selected }: NodeProps) {
  const nodeData = data as {
    label?: string;
    outputName?: string;
    format?: 'markdown' | 'json' | 'plain';
  };

  const formatLabels: Record<string, string> = {
    markdown: 'Markdown',
    json: 'JSON',
    plain: 'Texto',
  };

  return (
    <div
      className={`w-[120px] h-[80px] rounded-full flex flex-col items-center justify-center bg-zinc-900 border-2 transition-colors ${
        selected ? 'border-emerald-400' : 'border-emerald-600'
      } relative px-3`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#059669', width: 10, height: 10 }}
      />
      <Flag className="w-4 h-4 text-emerald-400 mb-1" />
      <span className="text-xs text-zinc-300 font-medium text-center leading-tight truncate w-full text-center">
        {nodeData.outputName || nodeData.label || 'Resultado'}
      </span>
      {nodeData.format && (
        <span className="text-[9px] text-zinc-500 mt-0.5">
          {formatLabels[nodeData.format] || nodeData.format}
        </span>
      )}
    </div>
  );
}
