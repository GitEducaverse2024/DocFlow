"use client";

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FolderKanban } from 'lucide-react';

export function ProjectNode({ data, selected }: NodeProps) {
  const nodeData = data as {
    label?: string;
    projectId?: string | null;
    projectName?: string | null;
  };

  return (
    <div
      className={`w-[240px] min-h-[80px] rounded-xl bg-blue-950/80 border-2 transition-colors ${
        selected ? 'border-blue-400' : 'border-blue-600'
      } p-3`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#2563eb', width: 10, height: 10 }}
      />
      <div className="flex items-center gap-2 mb-2">
        <FolderKanban className="w-4 h-4 text-blue-400 shrink-0" />
        <span className="text-sm font-semibold text-blue-100 truncate">
          {nodeData.label || 'Proyecto'}
        </span>
      </div>
      <div className="text-xs text-zinc-400 truncate">
        {nodeData.projectName || (nodeData.projectId ? nodeData.projectId : 'Sin proyecto')}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#2563eb', width: 10, height: 10 }}
      />
    </div>
  );
}
