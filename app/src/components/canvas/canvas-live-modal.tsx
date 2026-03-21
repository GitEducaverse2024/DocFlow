"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
} from '@xyflow/react';
import { Workflow, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// --------------- Types ---------------

interface CanvasRunData {
  id: string;
  canvas_name: string;
  status: string;
  node_states: Record<string, { status: string; output?: string }>;
  current_node_id: string | null;
  execution_order: string[];
  flow_data: { nodes: Node[]; edges: Edge[] };
  total_tokens: number;
  total_duration: number;
}

// --------------- LiveNode ---------------

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-zinc-800 border-zinc-700 text-zinc-400',
  running: 'bg-violet-900/30 border-violet-500 text-violet-300 animate-pulse',
  completed: 'bg-emerald-900/20 border-emerald-500 text-emerald-300',
  failed: 'bg-red-900/20 border-red-500 text-red-300',
  waiting: 'bg-amber-900/20 border-amber-500 text-amber-300',
  skipped: 'bg-zinc-800 border-zinc-700 text-zinc-500 opacity-50',
};

function LiveNode({ data }: { data: Record<string, unknown> }) {
  const label = (data.label as string) || 'Node';
  const nodeType = (data.nodeType as string) || '';
  const status = (data.liveStatus as string) || 'pending';
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;

  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-zinc-600 !w-2 !h-2" />
      <div className={`px-4 py-2 rounded-lg border-2 ${style} min-w-[120px] text-center`}>
        {nodeType && (
          <div className="text-xs text-zinc-500 uppercase">{nodeType}</div>
        )}
        <div className="text-sm font-medium truncate">{label}</div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-zinc-600 !w-2 !h-2" />
    </>
  );
}

// Module-level constant to avoid React Flow remount storms
const NODE_TYPES = { liveNode: LiveNode } as const;

const STATUS_BADGE_CLASSES: Record<string, string> = {
  running: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  pending: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

// --------------- CanvasLiveModalInner ---------------

function CanvasLiveModalInner({
  canvasRunId,
  isOpen,
  onClose,
}: {
  canvasRunId: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('tasks');
  const [canvasRun, setCanvasRun] = useState<CanvasRunData | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRun = useCallback(async () => {
    try {
      const res = await fetch(`/api/canvas-runs/${canvasRunId}`);
      if (!res.ok) return;
      const data: CanvasRunData = await res.json();
      setCanvasRun(data);
      setLoading(false);
      return data;
    } catch {
      setLoading(false);
      return null;
    }
  }, [canvasRunId]);

  // Initial fetch + polling
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    async function poll() {
      const data = await fetchRun();
      if (cancelled) return;
      // Continue polling if still running
      if (data && (data.status === 'running' || data.status === 'pending' || data.status === 'waiting')) {
        pollRef.current = setTimeout(poll, 2000);
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isOpen, fetchRun]);

  // Map flow_data nodes to use LiveNode type with status coloring
  const coloredNodes: Node[] = canvasRun
    ? canvasRun.flow_data.nodes.map((node) => ({
        ...node,
        type: 'liveNode',
        data: {
          ...node.data,
          label: (node.data as Record<string, unknown>).label || node.id,
          nodeType: node.type || '',
          liveStatus: canvasRun.node_states[node.id]?.status || 'pending',
        },
      }))
    : [];

  const edges: Edge[] = canvasRun
    ? canvasRun.flow_data.edges.map((edge) => {
        const srcStatus = canvasRun.node_states[edge.source]?.status;
        if (srcStatus === 'running' || srcStatus === 'completed') {
          return {
            ...edge,
            animated: true,
            style: { stroke: '#7c3aed', strokeWidth: 2 },
          };
        }
        return edge;
      })
    : [];

  const statusClass = STATUS_BADGE_CLASSES[canvasRun?.status || 'pending'] || STATUS_BADGE_CLASSES.pending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl h-[70vh] bg-zinc-950 border-zinc-800 p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="w-5 h-5 text-violet-400" />
            {loading
              ? t('detail.canvasModalLoading')
              : canvasRun?.canvas_name || t('detail.canvasModalTitle')
            }
            {canvasRun && (
              <Badge variant="outline" className={`text-xs border ${statusClass}`}>
                {canvasRun.status}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            </div>
          ) : (
            <ReactFlowProvider>
              <ReactFlow
                nodes={coloredNodes}
                edges={edges}
                nodeTypes={NODE_TYPES}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                panOnDrag={true}
                zoomOnScroll={true}
                fitView
              >
                <Background />
                <Controls showInteractive={false} />
              </ReactFlow>
            </ReactFlowProvider>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --------------- Default Export ---------------

export default function CanvasLiveModal(props: {
  canvasRunId: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  return <CanvasLiveModalInner {...props} />;
}
