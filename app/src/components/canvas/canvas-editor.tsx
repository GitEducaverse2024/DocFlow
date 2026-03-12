"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import dagre from '@dagrejs/dagre';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  type IsValidConnection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import { generateId } from '@/lib/utils';
import { CanvasToolbar } from './canvas-toolbar';
import { NodePalette } from './node-palette';
import { NodeConfigPanel } from './node-config-panel';
import { StartNode } from './nodes/start-node';
import { AgentNode } from './nodes/agent-node';
import { ProjectNode } from './nodes/project-node';
import { ConnectorNode } from './nodes/connector-node';
import { CheckpointNode } from './nodes/checkpoint-node';
import { MergeNode } from './nodes/merge-node';
import { ConditionNode } from './nodes/condition-node';
import { OutputNode } from './nodes/output-node';

// Module-level constant — NEVER inside component body (prevents remount storm)
const NODE_TYPES = {
  start: StartNode,
  agent: AgentNode,
  project: ProjectNode,
  connector: ConnectorNode,
  checkpoint: CheckpointNode,
  merge: MergeNode,
  condition: ConditionNode,
  output: OutputNode,
} as const;

// Node dimensions for dagre layout per EDIT-10
const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  start:      { width: 120, height: 100 },
  agent:      { width: 260, height: 130 },
  project:    { width: 260, height: 110 },
  connector:  { width: 240, height: 110 },
  checkpoint: { width: 240, height: 120 },
  merge:      { width: 220, height: 90 },
  condition:  { width: 240, height: 110 },
  output:     { width: 140, height: 80 },
};

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 200, nodesep: 100 });

  for (const n of nodes) {
    const dims = NODE_DIMENSIONS[n.type || 'agent'] ?? { width: 240, height: 120 };
    g.setNode(n.id, dims);
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }
  dagre.layout(g);

  return nodes.map(n => {
    const pos = g.node(n.id);
    const dims = NODE_DIMENSIONS[n.type || 'agent'] ?? { width: 240, height: 120 };
    return {
      ...n,
      position: {
        x: pos.x - dims.width / 2,
        y: pos.y - dims.height / 2,
      },
    };
  });
}

function getDefaultNodeData(nodeType: string): Record<string, unknown> {
  switch (nodeType) {
    case 'start':      return { label: 'Inicio', initialInput: '' };
    case 'agent':      return { label: 'Agente', agentId: null, model: '', instructions: '', useRag: false, skills: [] };
    case 'project':    return { label: 'Proyecto', projectId: null, ragQuery: '', maxChunks: 5 };
    case 'connector':  return { label: 'Conector', connectorId: null, mode: 'after', payload: '' };
    case 'checkpoint': return { label: 'Checkpoint', instructions: 'Revisa y aprueba el resultado anterior' };
    case 'merge':      return { label: 'Merge', agentId: null, instructions: '' };
    case 'condition':  return { label: 'Condicion', condition: '' };
    case 'output':     return { label: 'Output', outputName: 'Resultado', format: 'markdown' };
    default:           return { label: nodeType };
  }
}

function getMiniMapNodeColor(node: Node): string {
  switch (node.type) {
    case 'start':      return '#059669'; // emerald
    case 'output':     return '#059669'; // emerald
    case 'agent':      return '#7c3aed'; // violet
    case 'project':    return '#2563eb'; // blue
    case 'connector':  return '#ea580c'; // orange
    case 'checkpoint': return '#d97706'; // amber
    case 'merge':      return '#0891b2'; // cyan
    case 'condition':  return '#ca8a04'; // yellow
    default:           return '#6b7280'; // gray
  }
}

export function CanvasEditor({ canvasId }: { canvasId: string }) {
  return (
    <ReactFlowProvider>
      <CanvasShell canvasId={canvasId} />
    </ReactFlowProvider>
  );
}

function CanvasShell({ canvasId }: { canvasId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [canvasName, setCanvasName] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // Undo/redo history
  const [past, setPast] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [future, setFuture] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);

  const { fitView, screenToFlowPosition, toObject } = useReactFlow();

  // canvasId ref to avoid stale closure in scheduleAutoSave
  const canvasIdRef = useRef(canvasId);
  useEffect(() => { canvasIdRef.current = canvasId; }, [canvasId]);

  // Save timer ref
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // scheduleAutoSave — stable reference via empty deps, uses refs for fresh values
  const scheduleAutoSave = useCallback(() => {
    setSaveStatus('unsaved');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const flowData = toObject();
        // Strip executionStatus and executionOutput from node data before saving
        const cleanedNodes = (flowData.nodes as Node[]).map(n => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { executionStatus, executionOutput, ...cleanData } = n.data as Record<string, unknown>;
          void executionStatus; void executionOutput;
          return { ...n, data: cleanData };
        });
        const cleanedFlowData = { ...flowData, nodes: cleanedNodes };
        const res = await fetch(`/api/canvas/${canvasIdRef.current}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flow_data: cleanedFlowData }),
        });
        if (!res.ok) throw new Error('Save failed');
        setSaveStatus('saved');
      } catch (err) {
        console.error('[canvas] auto-save error:', err);
        setSaveStatus('unsaved');
      }
    }, 3000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Load canvas on mount
  useEffect(() => {
    fetch(`/api/canvas/${canvasId}`)
      .then(r => r.json())
      .then(canvas => {
        if (canvas.name) setCanvasName(canvas.name);
        if (canvas.flow_data) {
          try {
            const fd = typeof canvas.flow_data === 'string'
              ? JSON.parse(canvas.flow_data)
              : canvas.flow_data;
            setNodes(fd.nodes || []);
            setEdges(fd.edges || []);
            setTimeout(() => fitView({ padding: 0.1 }), 50);
          } catch {
            // ignore parse errors — start with empty canvas
          }
        }
      })
      .catch(() => {
        // ignore fetch errors — start with empty canvas
      });
  }, [canvasId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cycle detection: DFS from target, check if source is reachable
  const isValidConnection: IsValidConnection = useCallback((connection: Connection | Edge) => {
    const visited = new Set<string>();
    function hasCycle(nodeId: string): boolean {
      if (nodeId === connection.source) return true;
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);
      return edges
        .filter(e => e.source === nodeId)
        .some(e => hasCycle(e.target));
    }
    if (!connection.target || !connection.source) return true;
    return !hasCycle(connection.target);
  }, [edges]);

  // Wrapped onNodesChange — triggers auto-save for meaningful changes (not selection)
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      if (changes.some(c => c.type !== 'select')) {
        scheduleAutoSave();
      }
    },
    [onNodesChange, scheduleAutoSave]
  );

  // Wrapped onEdgesChange — triggers auto-save for all edge changes
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
      scheduleAutoSave();
    },
    [onEdgesChange, scheduleAutoSave]
  );

  // ---- Undo/Redo ----

  const takeSnapshot = useCallback(() => {
    setPast(prev => [...prev.slice(-30), { nodes: [...nodes], edges: [...edges] }]);
    setFuture([]);
  }, [nodes, edges]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    setFuture(f => [{ nodes: [...nodes], edges: [...edges] }, ...f]);
    const prev = past[past.length - 1];
    setPast(p => p.slice(0, -1));
    setNodes(prev.nodes);
    setEdges(prev.edges);
  }, [past, future, nodes, edges, setNodes, setEdges]); // eslint-disable-line react-hooks/exhaustive-deps

  const redo = useCallback(() => {
    if (future.length === 0) return;
    setPast(p => [...p, { nodes: [...nodes], edges: [...edges] }]);
    const next = future[0];
    setFuture(f => f.slice(1));
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [past, future, nodes, edges, setNodes, setEdges]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      // Ctrl+Y as redo alternative
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const onConnect = useCallback(
    (connection: Connection) => {
      takeSnapshot();
      setEdges(eds => addEdge(connection, eds));
      scheduleAutoSave();
    },
    [setEdges, takeSnapshot, scheduleAutoSave]
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onNodesDelete = useCallback((_nodes: Node[]) => {
    takeSnapshot();
  }, [takeSnapshot]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onEdgesDelete = useCallback((_edges: Edge[]) => {
    takeSnapshot();
  }, [takeSnapshot]);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/reactflow');
      if (!nodeType) return;

      takeSnapshot();
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const newNode: Node = {
        id: generateId(),
        type: nodeType,
        position,
        data: getDefaultNodeData(nodeType),
      };
      setNodes(prev => [...prev, newNode]);
      scheduleAutoSave();
    },
    [screenToFlowPosition, setNodes, takeSnapshot, scheduleAutoSave]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Keep selectedNode in sync with nodes state (data changes from config panel)
  const handleNodeDataUpdate = useCallback((nodeId: string, newData: Record<string, unknown>) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n));
    setSelectedNode(prev => prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...newData } } : prev);
    scheduleAutoSave();
  }, [setNodes, scheduleAutoSave]);

  // ---- Dagre Auto-Layout ----

  const handleAutoLayout = useCallback(() => {
    takeSnapshot();
    const layoutedNodes = applyDagreLayout(nodes, edges);
    setNodes(layoutedNodes);
    setTimeout(() => fitView({ padding: 0.1 }), 50);
    scheduleAutoSave();
  }, [nodes, edges, setNodes, fitView, takeSnapshot, scheduleAutoSave]);

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      <CanvasToolbar
        canvasId={canvasId}
        canvasName={canvasName}
        onNameChange={setCanvasName}
        saveStatus={saveStatus}
        onSaveStatusChange={setSaveStatus}
        onUndo={undo}
        onRedo={redo}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onAutoLayout={handleAutoLayout}
      />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <NodePalette />
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              onNodesDelete={onNodesDelete}
              onEdgesDelete={onEdgesDelete}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={NODE_TYPES}
              snapToGrid
              snapGrid={[20, 20]}
              isValidConnection={isValidConnection}
              deleteKeyCode={['Delete', 'Backspace']}
              selectionOnDrag
              multiSelectionKeyCode="Shift"
              fitView
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1.5}
                color="#3f3f46"
              />
              <MiniMap className="!bg-zinc-900" nodeColor={getMiniMapNodeColor} />
              <Controls className="!bg-zinc-900 !border-zinc-700" />
            </ReactFlow>
          </div>
          <NodeConfigPanel
            selectedNode={selectedNode}
            onNodeDataUpdate={handleNodeDataUpdate}
          />
        </div>
      </div>
    </div>
  );
}
