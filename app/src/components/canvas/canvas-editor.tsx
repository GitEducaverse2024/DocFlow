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
import { Clock, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { generateId } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { CanvasToolbar } from './canvas-toolbar';
import { NodePalette } from './node-palette';
import { NodeConfigPanel } from './node-config-panel';
import { ExecutionResult } from './execution-result';
import { StartNode } from './nodes/start-node';
import { AgentNode } from './nodes/agent-node';
import { CatBrainNode } from './nodes/catbrain-node';
import { ConnectorNode } from './nodes/connector-node';
import { CheckpointNode } from './nodes/checkpoint-node';
import { MergeNode } from './nodes/merge-node';
import { ConditionNode } from './nodes/condition-node';
import { OutputNode } from './nodes/output-node';

// Module-level constant — NEVER inside component body (prevents remount storm)
const NODE_TYPES = {
  start: StartNode,
  agent: AgentNode,
  catbrain: CatBrainNode,
  project: CatBrainNode, // backward compat for old canvas data
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
  catbrain:   { width: 260, height: 120 },
  project:    { width: 260, height: 120 }, // backward compat
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
    case 'catbrain':   return { label: 'CatBrain', catbrainId: null, ragQuery: '', maxChunks: 5 };
    case 'project':    return { label: 'CatBrain', catbrainId: null, ragQuery: '', maxChunks: 5 }; // backward compat
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
    case 'catbrain':   return '#7c3aed'; // violet
    case 'project':    return '#7c3aed'; // violet (backward compat)
    case 'connector':  return '#ea580c'; // orange
    case 'checkpoint': return '#d97706'; // amber
    case 'merge':      return '#0891b2'; // cyan
    case 'condition':  return '#ca8a04'; // yellow
    default:           return '#6b7280'; // gray
  }
}

// Apply edge animation based on source node execution status
function applyEdgeAnimation(
  edges: Edge[],
  nodeStates: Record<string, { status: string }>
): Edge[] {
  return edges.map(edge => {
    const srcStatus = nodeStates[edge.source]?.status;
    if (srcStatus === 'running' || srcStatus === 'completed') {
      return {
        ...edge,
        animated: true,
        style: { stroke: '#7c3aed', strokeWidth: 2 },
      };
    }
    return { ...edge, animated: false, style: {} };
  });
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
  const [canvasMode, setCanvasMode] = useState<string>('mixed');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // Undo/redo history
  const [past, setPast] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [future, setFuture] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);

  // Execution state
  const [runId, setRunId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [executionStats, setExecutionStats] = useState<{
    completedSteps: number;
    totalSteps: number;
    elapsedSeconds: number;
    totalTokens: number;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Checkpoint dialog state
  const [checkpointDialog, setCheckpointDialog] = useState<{ nodeId: string; predecessorOutput: string | null } | null>(null);
  const [checkpointFeedback, setCheckpointFeedback] = useState('');

  // Last node states (preserved after execution completes for result panel)
  const [lastNodeStates, setLastNodeStates] = useState<Record<string, { status: string; output?: string; tokens?: number; duration_ms?: number }>>({});

  // Execution result panel state
  const [showResult, setShowResult] = useState(false);
  const [outputContent, setOutputContent] = useState('');

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

  // Cleanup save timer and poll timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  // Load canvas on mount
  useEffect(() => {
    fetch(`/api/canvas/${canvasId}`)
      .then(r => r.json())
      .then(canvas => {
        if (canvas.name) setCanvasName(canvas.name);
        if (canvas.mode) setCanvasMode(canvas.mode);
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

  // ---- Execution ----

  const schedulePoll = useCallback((rid: string) => {
    pollRef.current = setTimeout(() => pollStatus(rid), 2000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pollStatus = useCallback(async (rid: string) => {
    try {
      const res = await fetch(`/api/canvas/${canvasIdRef.current}/run/${rid}/status`);
      if (!res.ok) {
        schedulePoll(rid);
        return;
      }
      const data = await res.json();

      // Update execution stats
      setExecutionStats({
        completedSteps: data.completed_steps ?? 0,
        totalSteps: data.total_steps ?? 0,
        elapsedSeconds: data.elapsed_seconds ?? 0,
        totalTokens: data.total_tokens ?? 0,
      });

      const nodeStates: Record<string, { status: string; output?: string; tokens?: number; duration_ms?: number }> = data.node_states ?? {};

      // Store last node states for result panel
      setLastNodeStates(nodeStates);

      // Inject executionStatus into nodes
      setNodes(prev => prev.map(n => ({
        ...n,
        data: {
          ...n.data,
          executionStatus: nodeStates[n.id]?.status || 'pending',
          executionOutput: nodeStates[n.id]?.output,
        },
      })));

      // Animate edges based on source node status
      setEdges(prev => applyEdgeAnimation(prev, nodeStates));

      // Detect checkpoint 'waiting' status — open dialog, pause polling
      if (data.status === 'waiting') {
        // Find the node in 'waiting' status
        const waitingEntry = Object.entries(nodeStates).find(([, ns]) => ns.status === 'waiting');
        if (waitingEntry) {
          const [waitingNodeId] = waitingEntry;
          // Find predecessor output: look at edges to find source node of the waiting node
          // We don't have edges here — pass the output from nodeStates if available
          // The predecessor is the last 'completed' node feeding into waiting node
          const predecessorOutput = waitingEntry[1].output ?? null;
          setCheckpointDialog({ nodeId: waitingNodeId, predecessorOutput });
          // Do NOT schedule next poll — polling resumes after approve/reject
        } else {
          schedulePoll(rid);
        }
        return;
      }

      const terminalStatuses = ['completed', 'failed', 'cancelled'];
      if (terminalStatuses.includes(data.status)) {
        // Execution finished — clear execution styling and stop polling
        setIsExecuting(false);
        setRunStatus(data.status);
        // Strip executionStatus from nodes and find OUTPUT node's content
        setNodes(prev => {
          const outputNode = prev.find(n => n.type === 'output');
          if (outputNode) {
            const outputNodeOutput = nodeStates[outputNode.id]?.output || '';
            setOutputContent(outputNodeOutput);
          } else {
            // Fallback: last completed node's output
            const lastCompleted = Object.entries(nodeStates).reverse().find(([, ns]) => ns.status === 'completed');
            setOutputContent(lastCompleted ? (lastCompleted[1].output || '') : '');
          }
          return prev.map(n => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { executionStatus, executionOutput, ...cleanData } = n.data as Record<string, unknown>;
            void executionStatus; void executionOutput;
            return { ...n, data: cleanData };
          });
        });
        // Show result panel
        setShowResult(true);
        // Reset edge animation
        setEdges(prev => prev.map(e => ({ ...e, animated: false, style: {} })));
      } else {
        // Continue polling
        schedulePoll(rid);
      }
    } catch (err) {
      console.error('[canvas] poll error:', err);
      schedulePoll(rid);
    }
  }, [setNodes, setEdges, schedulePoll]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExecute = useCallback(async () => {
    try {
      const res = await fetch(`/api/canvas/${canvasIdRef.current}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        console.error('[canvas] execute failed:', res.status);
        return;
      }
      const data = await res.json();
      setRunId(data.runId);
      setIsExecuting(true);
      setRunStatus('running');
      setShowResult(false);
      setOutputContent('');
      setExecutionStats({ completedSteps: 0, totalSteps: 0, elapsedSeconds: 0, totalTokens: 0 });
      schedulePoll(data.runId);
    } catch (err) {
      console.error('[canvas] handleExecute error:', err);
    }
  }, [schedulePoll]);

  const handleCancel = useCallback(async () => {
    if (!runId) return;
    try {
      await fetch(`/api/canvas/${canvasIdRef.current}/run/${runId}/cancel`, {
        method: 'POST',
      });
    } catch {
      // ignore cancel errors
    }
    if (pollRef.current) clearTimeout(pollRef.current);
    setIsExecuting(false);
    setRunStatus('cancelled');
    // Strip executionStatus from nodes
    setNodes(prev => prev.map(n => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { executionStatus, executionOutput, ...cleanData } = n.data as Record<string, unknown>;
      void executionStatus; void executionOutput;
      return { ...n, data: cleanData };
    }));
    setEdges(prev => prev.map(e => ({ ...e, animated: false, style: {} })));
  }, [runId, setNodes, setEdges]);

  // ---- Checkpoint handlers ----

  const handleCheckpointApprove = useCallback(async () => {
    if (!checkpointDialog || !runId) return;
    try {
      await fetch(`/api/canvas/${canvasIdRef.current}/run/${runId}/checkpoint/${checkpointDialog.nodeId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('[canvas] checkpoint approve error:', err);
    }
    setCheckpointDialog(null);
    setCheckpointFeedback('');
    schedulePoll(runId);
  }, [checkpointDialog, runId, schedulePoll]);

  const handleCheckpointReject = useCallback(async () => {
    if (!checkpointDialog || !runId) return;
    if (!checkpointFeedback.trim()) {
      toast.error('Escribe feedback para rechazar');
      return;
    }
    try {
      await fetch(`/api/canvas/${canvasIdRef.current}/run/${runId}/checkpoint/${checkpointDialog.nodeId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: checkpointFeedback }),
      });
    } catch (err) {
      console.error('[canvas] checkpoint reject error:', err);
    }
    setCheckpointDialog(null);
    setCheckpointFeedback('');
    schedulePoll(runId);
  }, [checkpointDialog, runId, checkpointFeedback, schedulePoll]);

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
    <>
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
          executionState={{
            isExecuting,
            completedSteps: executionStats?.completedSteps ?? 0,
            totalSteps: executionStats?.totalSteps ?? 0,
            elapsedSeconds: executionStats?.elapsedSeconds ?? 0,
            runId,
          }}
          onExecute={handleExecute}
          onCancel={handleCancel}
        />
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Hide NodePalette during execution and result display */}
          {!isExecuting && !showResult && <NodePalette canvasMode={canvasMode} />}
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
                deleteKeyCode={isExecuting ? null : ['Delete', 'Backspace']}
                selectionOnDrag
                multiSelectionKeyCode="Shift"
                nodesDraggable={!isExecuting}
                nodesConnectable={!isExecuting}
                elementsSelectable={!isExecuting}
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
            {showResult && runStatus ? (
              <ExecutionResult
                status={runStatus as 'completed' | 'failed' | 'cancelled'}
                nodeStates={lastNodeStates}
                totalTokens={executionStats?.totalTokens ?? 0}
                totalDuration={executionStats?.elapsedSeconds ?? 0}
                outputContent={outputContent}
                onReExecute={() => {
                  setShowResult(false);
                  handleExecute();
                }}
                onClose={() => setShowResult(false)}
              />
            ) : (
              <NodeConfigPanel
                selectedNode={selectedNode}
                onNodeDataUpdate={handleNodeDataUpdate}
              />
            )}
          </div>
        </div>
      </div>

      {/* Checkpoint approval dialog — cannot be dismissed, must approve or reject */}
      <Dialog open={!!checkpointDialog} onOpenChange={() => { /* blocked: must approve or reject */ }}>
        <DialogContent
          className="max-w-2xl max-h-[80vh] overflow-y-auto bg-zinc-900 border border-zinc-700 text-zinc-100"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <Clock className="w-5 h-5" />
              Checkpoint: Revision requerida
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-zinc-400 mb-2">Resultado del paso anterior:</p>
              <div className="bg-zinc-950 rounded-lg p-4 max-h-[40vh] overflow-y-auto prose prose-invert prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {checkpointDialog?.predecessorOutput || 'Sin resultado previo'}
                </ReactMarkdown>
              </div>
            </div>

            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Feedback (requerido para rechazar):</label>
              <textarea
                value={checkpointFeedback}
                onChange={(e) => setCheckpointFeedback(e.target.value)}
                placeholder="Escribe instrucciones para mejorar el resultado..."
                className="w-full h-24 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-zinc-100 text-sm resize-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-zinc-700">
            <Button variant="destructive" onClick={handleCheckpointReject} className="gap-1.5">
              <X className="w-4 h-4" /> Rechazar
            </Button>
            <Button onClick={handleCheckpointApprove} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
              <Check className="w-4 h-4" /> Aprobar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

