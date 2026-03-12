"use client";

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Play } from 'lucide-react';

export function StartNode({ selected }: NodeProps) {
  return (
    <div
      className={`w-[100px] h-[100px] rounded-full flex flex-col items-center justify-center bg-emerald-950 border-2 transition-colors ${
        selected ? 'border-emerald-400' : 'border-emerald-600'
      }`}
    >
      <Play className="w-8 h-8 text-emerald-400 fill-emerald-400" />
      <span className="text-xs text-emerald-300 mt-1 font-medium">Inicio</span>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#059669', width: 10, height: 10 }}
      />
    </div>
  );
}
