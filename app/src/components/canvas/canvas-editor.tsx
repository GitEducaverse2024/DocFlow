"use client";

import { useCallback, useEffect, useState } from 'react';
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
} from '@xyflow/react';
import { generateId } from '@/lib/utils';
import { CanvasToolbar } from './canvas-toolbar';
import { NodePalette } from './node-palette';

// Module-level constant — NEVER inside component body (prevents remount storm)
const NODE_TYPES = {} as const;

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

  const { fitView, screenToFlowPosition } = useReactFlow();

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

  const onConnect = useCallback(
    (connection: Connection) => setEdges(eds => addEdge(connection, eds)),
    [setEdges]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/reactflow');
      if (!nodeType) return;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const newNode: Node = {
        id: generateId(),
        type: nodeType,
        position,
        data: getDefaultNodeData(nodeType),
      };
      setNodes(prev => [...prev, newNode]);
    },
    [screenToFlowPosition, setNodes]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      <CanvasToolbar
        canvasId={canvasId}
        canvasName={canvasName}
        onNameChange={setCanvasName}
        saveStatus={saveStatus}
        onSaveStatusChange={setSaveStatus}
      />
      <div className="flex flex-1 overflow-hidden">
        <NodePalette />
        <div className="flex-1 h-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
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
      </div>
    </div>
  );
}
