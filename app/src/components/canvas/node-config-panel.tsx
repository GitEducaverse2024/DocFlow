"use client";

import { type Node } from '@xyflow/react';

interface NodeConfigPanelProps {
  selectedNode: Node | null;
  onNodeDataUpdate?: (nodeId: string, data: Record<string, unknown>) => void;
}

/**
 * Node configuration panel — shows per-type config form for selected node.
 * Full implementation added by Plan 24-02.
 */
export function NodeConfigPanel({ selectedNode, onNodeDataUpdate }: NodeConfigPanelProps) {
  void onNodeDataUpdate;
  if (!selectedNode) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 bg-zinc-900 border-t border-zinc-800 p-4 h-40">
      <div className="text-xs text-zinc-500">
        Nodo seleccionado: <span className="text-zinc-300">{selectedNode.type}</span>
      </div>
    </div>
  );
}
