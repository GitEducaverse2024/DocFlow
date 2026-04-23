# Phase 25: Motor de Ejecucion Visual — Research

**Researched:** 2026-03-12
**Domain:** DAG execution engine (canvas-executor.ts), React Flow node visual state, polling UI, checkpoint dialog, usage tracking
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXEC-01 | POST /api/canvas/{id}/execute — crear canvas_run, ejecutar DAG con topological sort, fire-and-forget | Mirrors POST /api/tasks/{id}/execute pattern; canvas_runs table exists in db.ts |
| EXEC-02 | GET /api/canvas/{id}/run/{runId}/status — estado: node_states, current_node_id, elapsed, tokens | Mirrors GET /api/tasks/{id}/status; node_states is JSON column in canvas_runs |
| EXEC-03 | canvas-executor.ts: ejecutor DAG con dispatch por tipo (AGENT->LLM, PROJECT->RAG, CONNECTOR->fetch, MERGE->combinar, CONDITION->evaluar) | task-executor.ts provides full implementation template; Kahn topological sort ~20 lines |
| EXEC-04 | Nodos cambian color segun estado: pendiente(zinc), ejecutando(violet+pulse), completado(emerald+check), fallido(red+x), esperando(amber+reloj) | React Flow updateNode() injects executionStatus into node.data; each custom node reads it |
| EXEC-05 | Edges animados durante ejecucion (animated=true, stroke violet) | React Flow setEdges with animated:true property; CSS var --xy-edge-stroke |
| EXEC-06 | Barra de progreso en toolbar: "Ejecutando paso X/Y · tiempo" | CanvasToolbar already accepts props; add runState prop with stepX/stepY/elapsed |
| EXEC-07 | POST /api/canvas/{id}/run/{runId}/checkpoint/{nodeId}/approve — aprobar y continuar | Mirrors /tasks/{id}/steps/{stepId}/approve; executor reads checkpoint decision from DB |
| EXEC-08 | POST /api/canvas/{id}/run/{runId}/checkpoint/{nodeId}/reject — rechazar con feedback | Mirrors /tasks/{id}/steps/{stepId}/reject; re-executes predecessor node with feedback |
| EXEC-09 | Dialog checkpoint: output anterior renderizado, botones aprobar/rechazar con textarea | shadcn Dialog + ReactMarkdown (already installed); pause polling while dialog open |
| EXEC-10 | POST /api/canvas/{id}/run/{runId}/cancel — cancelar ejecucion | In-memory runningExecutors Map<runId, {cancelled:boolean}>; mirrors cancelTask() |
| EXEC-11 | Resultado final: nodos verdes, output expandible, stats toolbar (tiempo, tokens, costo), botones descargar/copiar/re-ejecutar | All data in canvas_runs row; cost from logUsage sum; toolbar expansion state |
| EXEC-12 | Modo read-only durante ejecucion (no mover/editar/eliminar nodos) | ReactFlow nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} props |
| EXEC-13 | Registrar uso en usage_logs con event_type 'canvas_execution' | logUsage() from usage-tracker.ts; needs new event_type 'canvas_execution' added to union |

</phase_requirements>

---

## Summary

Phase 25 builds the execution engine that brings the canvas to life. The foundation is complete: the `canvas_runs` table exists in `db.ts`, the canvas editor (Phase 24) already strips `executionStatus` from auto-save, and the `canvases` table has all required fields. The primary deliverable is `canvas-executor.ts` — a service that mirrors `task-executor.ts` but operates on a DAG (topological sort via Kahn's algorithm) instead of a linear step list.

The visual layer works by injecting `executionStatus` into `node.data` via React Flow's `updateNode()`. Each custom node component already reads `node.data` — they need a new branch to render execution-state styling when `executionStatus` is present. The toolbar already has the "Ejecutar" button (currently disabled) and accepts props for undo/redo state — it needs new props for `runState`. Polling at 2-second intervals (matching the task execution pattern) drives all UI updates.

The checkpoint interaction is the most complex UI piece: when `node_states` shows a CHECKPOINT node in `'waiting'` status, the editor shows a Dialog with the previous node's output rendered as Markdown, and two paths (approve / reject with feedback textarea). The canvas DAG complicates checkpoint reject: unlike linear task steps, the DAG executor must re-run the predecessor node(s) connected via the checkpoint's incoming edge, then pause at the checkpoint again.

**Primary recommendation:** Split into 3 plans: (1) `canvas-executor.ts` + all 7 API routes + `usage_logs` event type extension; (2) visual execution state overlay (node colors, animated edges, read-only mode, toolbar progress, checkpoint dialog); (3) final result display (expanded output, stats, re-run/download/copy buttons).

---

## Standard Stack

### Core — Already Installed (no new packages needed)

| Library | Version | Purpose | Already Used |
|---------|---------|---------|--------------|
| `@xyflow/react` | `^12.10.1` | Canvas visual state via updateNode() | canvas-editor.tsx |
| `better-sqlite3` | project version | Sync DB access in executor | db.ts, task-executor.ts |
| `react-markdown` | project version | Render checkpoint output in Dialog | tasks/[id]/page.tsx |
| `remark-gfm` | project version | GFM tables/strikethrough in Markdown | tasks/[id]/page.tsx |
| `sonner` | project version | Toast notifications | tasks/[id]/page.tsx |
| `uuid` (v4 as uuidv4) | project version | IDs for usage_logs rows | usage-tracker.ts |

No new npm packages required for Phase 25. All dependencies are already installed.

### Existing Services Available to canvas-executor.ts

| Service | Import Path | What It Provides |
|---------|-------------|-----------------|
| `db` | `@/lib/db` | Sync SQLite — same pattern as task-executor.ts |
| `logUsage` | `@/lib/services/usage-tracker` | Logs per-node LLM usage |
| LiteLLM fetch | inline (copy from task-executor.ts) | callLLM() helper |
| `getRagContext` | inline (copy from task-executor.ts) | RAG search for PROJECT nodes |
| `qdrant` | `@/lib/services/qdrant` | Vector search |
| `ollama` | `@/lib/services/ollama` | Embeddings for RAG |

---

## Architecture Patterns

### Recommended File Structure (new files for Phase 25)

```
app/src/
├── lib/services/
│   └── canvas-executor.ts           # NEW: DAG executor (mirrors task-executor.ts)
├── app/api/canvas/[id]/
│   ├── execute/
│   │   └── route.ts                 # NEW: POST — create run, fire-and-forget
│   └── run/
│       └── [runId]/
│           ├── status/
│           │   └── route.ts         # NEW: GET — node_states, current_node_id, elapsed, tokens
│           ├── checkpoint/
│           │   └── [nodeId]/
│           │       ├── approve/
│           │       │   └── route.ts # NEW: POST — approve checkpoint, resume
│           │       └── reject/
│           │           └── route.ts # NEW: POST — reject with feedback, re-run predecessor
│           └── cancel/
│               └── route.ts         # NEW: POST — set cancelled flag
└── components/canvas/
    ├── canvas-editor.tsx            # MODIFY: add execution state, polling, read-only mode
    ├── canvas-toolbar.tsx           # MODIFY: add run progress, cancel button, result stats
    └── execution-result.tsx         # NEW: expandable final output panel
```

### Pattern 1: DAG Executor (canvas-executor.ts)

**What:** Executes nodes in topological order (Kahn's algorithm), tracking state per node in `canvas_runs.node_states` JSON.

**Key difference from task-executor.ts:** Uses topological sort on a DAG (nodes + edges from `flow_data`) instead of linear `order_index`. The `execution_order` column stores the sorted node ID array.

**Node state structure (stored in canvas_runs.node_states):**
```typescript
// Per-node state object
interface NodeExecutionState {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'waiting';
  output?: string;
  tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  duration_ms?: number;
  error?: string;
  started_at?: string;
  completed_at?: string;
  feedback?: string;  // for checkpoint rejection
}

// The full node_states column value
type NodeStates = Record<string, NodeExecutionState>;
```

**'waiting' status** is specific to canvas execution — means a CHECKPOINT node is waiting for user decision. The task executor uses 'running' for waiting checkpoints; canvas executor uses the dedicated 'waiting' status for clarity.

**Kahn's algorithm (topological sort):**
```typescript
function topologicalSort(nodes: CanvasNode[], edges: CanvasEdge[]): string[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const n of nodes) { inDegree.set(n.id, 0); adj.set(n.id, []); }
  for (const e of edges) {
    adj.get(e.source)!.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  }

  const queue = nodes.filter(n => inDegree.get(n.id) === 0).map(n => n.id);
  const order: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    order.push(nodeId);
    for (const neighbor of (adj.get(nodeId) || [])) {
      const deg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) queue.push(neighbor);
    }
  }
  return order;
}
```

**In-memory cancel map (same pattern as task-executor.ts):**
```typescript
const runningExecutors = new Map<string, { cancelled: boolean }>();
```

### Pattern 2: Node State Injection into React Flow (EXEC-04)

**What:** After each poll, inject `executionStatus` into node data using `setNodes`. Each node component reads this field to render execution styling.

**In canvas-editor.tsx (polling loop):**
```typescript
// After fetching /api/canvas/{id}/run/{runId}/status
function applyExecutionState(currentNodes: Node[], nodeStates: NodeStates): Node[] {
  return currentNodes.map(n => ({
    ...n,
    data: {
      ...n.data,
      executionStatus: nodeStates[n.id]?.status || 'pending',
      executionOutput: nodeStates[n.id]?.output,
    },
  }));
}
setNodes(prev => applyExecutionState(prev, data.node_states));
```

**CRITICAL:** The auto-save already strips `executionStatus` and `executionOutput` from node data before PATCH (already implemented in canvas-editor.tsx line 152-158). No extra work needed.

**In each node component (e.g., agent-node.tsx):**
```typescript
const execStatus = (data as { executionStatus?: string }).executionStatus;
const isRunning   = execStatus === 'running';
const isCompleted = execStatus === 'completed';
const isFailed    = execStatus === 'failed';
const isWaiting   = execStatus === 'waiting';

// Apply border/background class based on execStatus
const borderClass = isRunning   ? 'border-violet-400 animate-pulse' :
                    isCompleted ? 'border-emerald-400' :
                    isFailed    ? 'border-red-400' :
                    isWaiting   ? 'border-amber-400' :
                    selected    ? 'border-violet-400' : 'border-violet-600';
```

Each of the 8 existing node components needs this small addition. The visual change is purely a CSS class swap — no structural changes to the node component JSX.

### Pattern 3: Animated Edges During Execution (EXEC-05)

**What:** Set `animated: true` and a violet stroke on edges whose source node is in 'running' or 'completed' state.

```typescript
function applyEdgeAnimation(edges: Edge[], nodeStates: NodeStates): Edge[] {
  return edges.map(e => {
    const sourceState = nodeStates[e.source]?.status;
    const isActive = sourceState === 'running' || sourceState === 'completed';
    return {
      ...e,
      animated: isActive,
      style: isActive ? { stroke: '#7c3aed', strokeWidth: 2 } : {},
    };
  });
}
```

### Pattern 4: Read-Only Mode During Execution (EXEC-12)

**What:** ReactFlow accepts boolean props to disable interactions.

```tsx
// In CanvasShell — conditionally pass these props
<ReactFlow
  nodesDraggable={!isExecuting}
  nodesConnectable={!isExecuting}
  elementsSelectable={!isExecuting}
  deleteKeyCode={isExecuting ? null : ['Delete', 'Backspace']}
  // ...rest of props
/>
```

`isExecuting` is a boolean state that is set to `true` after clicking "Ejecutar" and `false` after completion or cancellation.

### Pattern 5: Toolbar Execution State (EXEC-06)

**What:** The existing `CanvasToolbar` needs new props for execution state.

New props to add to `CanvasToolbarProps`:
```typescript
interface ExecutionState {
  isExecuting: boolean;
  currentStep: number;     // 1-indexed current executing step
  totalSteps: number;
  elapsedSeconds: number;
  runId: string | null;
}

// Additional props:
executionState?: ExecutionState;
onExecute?: () => void;
onCancel?: () => void;
```

The toolbar already has the `Play` button (currently `disabled`). When `isExecuting` is false, it shows "Ejecutar" (enabled if canvas is valid). When executing, it shows "Ejecutando paso X/Y · Ns" in center area and "Cancelar" button (red/destructive variant).

### Pattern 6: Checkpoint Dialog (EXEC-09)

**What:** When polling detects a 'waiting' checkpoint node, show a shadcn `Dialog` with the previous node's output.

```typescript
// Detect checkpoint in polling loop
const waitingCheckpoint = Object.entries(nodeStates).find(
  ([nodeId, state]) => state.status === 'waiting'
);
if (waitingCheckpoint) {
  const [checkpointNodeId, checkpointState] = waitingCheckpoint;
  // Find the node that has an edge going INTO this checkpoint
  const predecessorEdge = edges.find(e => e.target === checkpointNodeId);
  const predecessorOutput = predecessorEdge ? nodeStates[predecessorEdge.source]?.output : null;
  setCheckpointDialog({ nodeId: checkpointNodeId, predecessorOutput });
}
```

The Dialog uses `ReactMarkdown` + `remarkGfm` (same as tasks/[id]/page.tsx) to render the predecessor output. The reject path requires non-empty feedback text.

### Pattern 7: CONDITION Node Evaluation

**What:** CONDITION nodes evaluate a natural-language condition against the predecessor's output using LLM. The executor follows the `yes` or `no` source handle edge.

```typescript
async function executeConditionNode(
  nodeData: { condition: string },
  predecessorOutput: string,
  model: string
): Promise<'yes' | 'no'> {
  const result = await callLLM(
    model,
    'Eres un evaluador de condiciones. Responde SOLO con "yes" o "no".',
    `Condicion: ${nodeData.condition}\n\nContexto:\n${predecessorOutput}\n\n¿Se cumple la condicion?`
  );
  return result.output.trim().toLowerCase().startsWith('yes') ? 'yes' : 'no';
}
```

After evaluation, the executor continues only along the matching `sourceHandle` edge (`'yes'` or `'no'`). Nodes reachable only via the non-matching branch remain in `'pending'` state (skipped).

**IMPORTANT:** For CONDITION and CHECKPOINT nodes with 2 source handles, topological sort must consider ONLY the chosen branch. The executor must dynamically trim the execution order after evaluation — nodes only reachable via the unchosen branch are skipped (never executed). This requires re-running topological sort from the chosen branch, not the pre-calculated full order.

### Pattern 8: MERGE Node Input Collection

**What:** MERGE nodes wait for all incoming edges to have completed predecessor nodes, then combine their outputs.

In the sequential topological sort, all predecessors of a MERGE node will already be completed by the time MERGE is reached (because Kahn's algorithm dequeues MERGE only when all its incoming edges have been processed). No special waiting logic needed — just collect outputs from all predecessor node IDs.

```typescript
async function executeMergeNode(
  nodeId: string,
  nodeData: { agentId?: string; instructions?: string },
  edges: CanvasEdge[],
  nodeStates: NodeStates,
  model: string
): Promise<string> {
  // Collect all incoming edges' source outputs
  const incomingEdges = edges.filter(e => e.target === nodeId);
  const inputs = incomingEdges
    .map((e, i) => `## Entrada ${i + 1}\n${nodeStates[e.source]?.output || ''}`)
    .join('\n\n---\n\n');

  const result = await callLLM(
    model,
    'Eres un sintetizador experto. Combina los siguientes aportes en un documento unificado. Responde en espanol.',
    `${nodeData.instructions || 'Combina los siguientes aportes.'}\n\n${inputs}`
  );
  return result.output;
}
```

### Pattern 9: Execution Context Passing (predecessor output)

**What:** Each node's input is the output of its single predecessor (for linear nodes). For AGENT and PROJECT nodes, `predecessorOutput` becomes the `userContent` alongside the node's own instructions.

For the sequential DAG (one active path at a time), finding the predecessor is straightforward:
```typescript
function getPredecessorOutput(nodeId: string, edges: CanvasEdge[], nodeStates: NodeStates): string {
  const inEdge = edges.find(e => e.target === nodeId);
  if (!inEdge) return '';
  return nodeStates[inEdge.source]?.output || '';
}
```

For CHECKPOINT nodes: the input to the checkpoint Dialog is the predecessor's output. When approved, execution continues from the CHECKPOINT's `approved` source handle edge. When rejected, the predecessor node is re-executed with feedback appended to its instructions.

### Anti-Patterns to Avoid

- **Storing executionStatus in flow_data:** The auto-save already strips it. Never persist execution state to `canvases.flow_data` — it lives only in `canvas_runs.node_states`.
- **Parallel topological execution:** Out of scope for v5.0 (FUTURE-01). Execute nodes one at a time in sorted order.
- **WebSocket for real-time updates:** Out of scope (FUTURE-03). Use 2s polling, same as task execution.
- **Loops in execution:** DAG only. The validate endpoint already blocks cycles. Executor can assert no cycles at start.
- **Polling when execution is complete/failed/cancelled:** Stop the polling interval when run status is terminal. Check `runStatus === 'completed' || runStatus === 'failed' || runStatus === 'cancelled'`.
- **Canvas run status 'cancelled' vs 'failed':** Use a distinct `'cancelled'` status for user-initiated cancellation so the UI can show "Cancelado" instead of "Fallido".
- **Blocking Node.js event loop:** The executor runs LLM calls that can take 30+ seconds. All LLM/fetch calls are already async — the fire-and-forget pattern with in-memory cancel flags prevents blocking. Do NOT use synchronous sleeps.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Topological sort | Custom recursive DFS | Kahn's algorithm (~20 lines, no library) | Already decided in STATE.md; simple iterative queue |
| Markdown rendering in checkpoint dialog | Custom HTML renderer | ReactMarkdown + remarkGfm (installed) | Already used in tasks/[id]/page.tsx |
| Cost calculation | Manual pricing lookup | logUsage() in usage-tracker.ts | Handles pricing lookup, calculates estimated_cost per call |
| LLM calls | Direct OpenAI SDK | callLLM() inline (copy from task-executor.ts) | LiteLLM proxy handles all providers |
| RAG search | Direct Qdrant client | getRagContext() inline (copy from task-executor.ts) | Already handles collection lookup, embedding, search |
| Polling interval | setInterval | useRef + setTimeout chain | Easier to stop on unmount; same pattern recommended for auto-save |

---

## Common Pitfalls

### Pitfall 1: canvas_runs.node_states Not Initialized on Creation

**What goes wrong:** GET /status returns null node_states, frontend crashes trying to parse it.

**Why it happens:** POST /execute creates the run and immediately returns; the executor may not have set initial states yet.

**How to avoid:** POST /execute must initialize `node_states` with all nodes in `'pending'` status synchronously before firing the executor. The executor then updates states as it progresses.

```typescript
// In POST /api/canvas/{id}/execute, before fire-and-forget:
const initialNodeStates: NodeStates = {};
for (const node of flowData.nodes) {
  initialNodeStates[node.id] = { status: 'pending' };
}
db.prepare('INSERT INTO canvas_runs (id, canvas_id, status, node_states, execution_order, started_at) VALUES (?, ?, ?, ?, ?, ?)')
  .run(runId, canvasId, 'running', JSON.stringify(initialNodeStates), JSON.stringify(executionOrder), new Date().toISOString());
```

### Pitfall 2: CHECKPOINT sourceHandle Determines Branch

**What goes wrong:** After a checkpoint approval, the executor follows the wrong branch (both approved and rejected paths may exist as edges in flow_data).

**Why it happens:** CHECKPOINT has two source handles (`id="approved"` and `id="rejected"`). Both edges exist in `flow_data.edges`. The executor must filter to only the `approved` edge.

**How to avoid:** After approve, continue from edges where `edge.source === checkpointNodeId && edge.sourceHandle === 'approved'`. After reject, find edges where `edge.sourceHandle === 'rejected'` — or more commonly, re-execute the node connected via the incoming edge, then pause at the checkpoint again.

### Pitfall 3: CONDITION Skipped Branches Must Be Marked

**What goes wrong:** After a CONDITION evaluation, nodes on the unchosen branch remain as 'pending' forever. The run never completes because the executor waits for them.

**Why it happens:** Topological sort pre-calculates all nodes. The executor needs to know which nodes to skip.

**How to avoid:** After CONDITION evaluation, find all nodes reachable only via the non-chosen branch (DFS from the non-chosen sourceHandle edge's target) and mark them as `'skipped'` in node_states. The executor skips nodes with `'skipped'` status.

### Pitfall 4: Polling Continues After Tab Navigation

**What goes wrong:** User navigates away from /canvas/[id] while execution is running. Polling interval keeps firing, causing memory leaks and stale state updates.

**How to avoid:** Store the interval/timeout ref in `useRef` and clear in the `useEffect` cleanup function:
```typescript
const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
useEffect(() => {
  return () => { if (pollRef.current) clearTimeout(pollRef.current); };
}, []);
```

### Pitfall 5: canvas_runs 'running' Status Stuck on Server Restart

**Already handled:** `db.ts` already has the startup cleanup:
```typescript
db.prepare("UPDATE canvas_runs SET status = 'failed' WHERE status = 'running'").run();
```
This mirrors the same pattern used for tasks. No action needed — just verify the logic also handles 'waiting' checkpoint state (it should mark as 'failed' too).

### Pitfall 6: usage_logs event_type TypeScript Enum Mismatch

**What goes wrong:** `logUsage({ event_type: 'canvas_execution', ... })` causes a TypeScript compile error because `'canvas_execution'` is not in the `UsageEvent.event_type` union in `usage-tracker.ts`.

**How to avoid:** Update the `UsageEvent` interface in `usage-tracker.ts` to add `'canvas_execution'` to the union. Also update the `UsageLog` interface in `types.ts`.

### Pitfall 7: Auto-save Fires During Execution (pollutes flow_data)

**Already handled:** The auto-save in canvas-editor.tsx (line 222-227) only triggers when `changes.some(c => c.type !== 'select')`. During execution, nodes are updated via `setNodes()` directly (not via `onNodesChange`), so auto-save does NOT fire. The strip logic for `executionStatus` is also in place. No action needed — just do not route execution state updates through `onNodesChange`.

### Pitfall 8: MODEL Resolution for Canvas Nodes

**What goes wrong:** AGENT node has `data.model` field (may be empty string), PROJECT node has no model field. Executor must resolve which model to use.

**How to avoid:**
- AGENT node: use `node.data.model || 'gemini-main'` (same as task-executor.ts `step.agent_model || 'gemini-main'`)
- MERGE node: use `node.data.model || 'gemini-main'`
- PROJECT node (RAG query): no LLM call, just Qdrant search — no model needed
- CONDITION node: use a fast model like `'gemini-main'` for condition evaluation
- CONNECTOR node: no LLM call, HTTP fetch only

---

## Code Examples

### canvas-executor.ts — Main Structure

```typescript
// Source: mirrors task-executor.ts pattern (app/src/lib/services/task-executor.ts)
// app/src/lib/services/canvas-executor.ts

import db from '@/lib/db';
import { logUsage } from '@/lib/services/usage-tracker';
import { v4 as uuidv4 } from 'uuid';

const runningExecutors = new Map<string, { cancelled: boolean }>();

interface CanvasNode { id: string; type?: string; data: Record<string, unknown>; }
interface CanvasEdge { id: string; source: string; target: string; sourceHandle?: string | null; }
type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting' | 'skipped';
interface NodeState {
  status: NodeStatus;
  output?: string;
  tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  duration_ms?: number;
  error?: string;
  started_at?: string;
  completed_at?: string;
}
type NodeStates = Record<string, NodeState>;

export async function executeCanvas(canvasId: string, runId: string): Promise<void> {
  const state = { cancelled: false };
  runningExecutors.set(runId, state);

  try {
    const run = db.prepare('SELECT * FROM canvas_runs WHERE id = ?').get(runId) as {
      node_states: string; execution_order: string;
    } | undefined;
    if (!run) throw new Error('Run no encontrado');

    const canvas = db.prepare('SELECT flow_data FROM canvases WHERE id = ?').get(canvasId) as {
      flow_data: string;
    } | undefined;
    if (!canvas) throw new Error('Canvas no encontrado');

    const flowData = JSON.parse(canvas.flow_data);
    const nodes: CanvasNode[] = flowData.nodes || [];
    const edges: CanvasEdge[] = flowData.edges || [];
    const nodeStates: NodeStates = JSON.parse(run.node_states);
    const executionOrder: string[] = JSON.parse(run.execution_order);

    const startTime = Date.now();
    let totalTokens = 0;

    for (const nodeId of executionOrder) {
      if (state.cancelled) break;

      const nodeState = nodeStates[nodeId];
      if (nodeState?.status === 'skipped') continue;

      const node = nodes.find(n => n.id === nodeId);
      if (!node) continue;

      // Mark as running
      nodeStates[nodeId] = { ...nodeStates[nodeId], status: 'running', started_at: new Date().toISOString() };
      saveNodeStates(runId, nodeId, nodeStates);

      try {
        const result = await dispatchNode(node, edges, nodeStates, canvasId, runId);

        if (node.type === 'checkpoint') {
          // Checkpoint: stay 'waiting', exit loop — resume later
          nodeStates[nodeId] = { ...nodeStates[nodeId], status: 'waiting' };
          saveNodeStates(runId, nodeId, nodeStates);
          db.prepare("UPDATE canvas_runs SET status = 'waiting', current_node_id = ? WHERE id = ?").run(nodeId, runId);
          runningExecutors.delete(runId);
          return;
        }

        if (node.type === 'condition') {
          // Mark skipped branch
          const chosen = result.output as 'yes' | 'no';
          const skipped = getSkippedNodes(nodeId, chosen, nodes, edges);
          for (const sid of skipped) { nodeStates[sid] = { status: 'skipped' }; }
        }

        const tokens = result.tokens || 0;
        totalTokens += tokens;
        nodeStates[nodeId] = {
          status: 'completed',
          output: typeof result.output === 'string' ? result.output : '',
          tokens,
          input_tokens: result.input_tokens,
          output_tokens: result.output_tokens,
          duration_ms: result.duration_ms,
          completed_at: new Date().toISOString(),
        };
        saveNodeStates(runId, nodeId, nodeStates);
        db.prepare("UPDATE canvas_runs SET current_node_id = ?, total_tokens = ? WHERE id = ?").run(nodeId, totalTokens, runId);

      } catch (err) {
        nodeStates[nodeId] = { status: 'failed', error: (err as Error).message, completed_at: new Date().toISOString() };
        saveNodeStates(runId, nodeId, nodeStates);
        db.prepare("UPDATE canvas_runs SET status = 'failed' WHERE id = ?").run(runId);
        return;
      }
    }

    if (!state.cancelled) {
      const totalDuration = Math.round((Date.now() - startTime) / 1000);
      db.prepare("UPDATE canvas_runs SET status = 'completed', total_duration = ?, completed_at = ? WHERE id = ?")
        .run(totalDuration, new Date().toISOString(), runId);

      // Log canvas_execution usage (EXEC-13)
      logUsage({
        event_type: 'canvas_execution' as 'task_step', // cast until type updated
        metadata: { canvas_id: canvasId, run_id: runId, total_tokens: totalTokens, total_duration: totalDuration }
      });
    }
  } catch (err) {
    console.error(`[CanvasExecutor] Error en run ${runId}:`, err);
    db.prepare("UPDATE canvas_runs SET status = 'failed' WHERE id = ?").run(runId);
  } finally {
    runningExecutors.delete(runId);
  }
}

function saveNodeStates(runId: string, currentNodeId: string, nodeStates: NodeStates) {
  db.prepare('UPDATE canvas_runs SET node_states = ?, current_node_id = ? WHERE id = ?')
    .run(JSON.stringify(nodeStates), currentNodeId, runId);
}

export function cancelExecution(runId: string): void {
  const state = runningExecutors.get(runId);
  if (state) state.cancelled = true;
  db.prepare("UPDATE canvas_runs SET status = 'cancelled' WHERE id = ?").run(runId);
}

export async function resumeAfterCheckpoint(runId: string, checkpointNodeId: string, approved: boolean, feedback?: string): Promise<void> {
  const run = db.prepare('SELECT * FROM canvas_runs WHERE id = ?').get(runId) as {
    canvas_id: string; node_states: string; execution_order: string;
  } | undefined;
  if (!run) return;

  const nodeStates: NodeStates = JSON.parse(run.node_states);

  if (approved) {
    nodeStates[checkpointNodeId] = { ...nodeStates[checkpointNodeId], status: 'completed', completed_at: new Date().toISOString() };
  } else {
    // Find predecessor and reset it with feedback
    const canvas = db.prepare('SELECT flow_data FROM canvases WHERE id = ?').get(run.canvas_id) as { flow_data: string } | undefined;
    if (canvas) {
      const fd = JSON.parse(canvas.flow_data);
      const edges: CanvasEdge[] = fd.edges || [];
      const inEdge = edges.find(e => e.target === checkpointNodeId);
      if (inEdge) {
        const predState = nodeStates[inEdge.source];
        nodeStates[inEdge.source] = { status: 'pending', ...(feedback ? { feedback } : {}) };
        void predState; // was completed, now reset
      }
    }
    nodeStates[checkpointNodeId] = { status: 'pending' };
  }

  db.prepare("UPDATE canvas_runs SET status = 'running', node_states = ? WHERE id = ?").run(JSON.stringify(nodeStates), runId);

  executeCanvas(run.canvas_id, runId).catch(err => {
    console.error(`[CanvasExecutor] Error resumiendo run ${runId}:`, err);
  });
}
```

### POST /api/canvas/{id}/execute — Route

```typescript
// Source: mirrors /api/tasks/{id}/execute/route.ts
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { executeCanvas } from '@/lib/services/canvas-executor';
import { generateId } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const canvas = db.prepare('SELECT id, flow_data FROM canvases WHERE id = ?').get(params.id) as
      { id: string; flow_data: string | null } | undefined;
    if (!canvas) return NextResponse.json({ error: 'Canvas no encontrado' }, { status: 404 });
    if (!canvas.flow_data) return NextResponse.json({ error: 'El canvas no tiene datos' }, { status: 400 });

    const flowData = JSON.parse(canvas.flow_data);
    const nodes = flowData.nodes || [];
    const edges = flowData.edges || [];

    // Topological sort
    const executionOrder = topologicalSort(nodes, edges);

    // Initialize all node states as 'pending'
    const initialNodeStates: Record<string, { status: string }> = {};
    for (const node of nodes) { initialNodeStates[node.id] = { status: 'pending' }; }

    const runId = generateId();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO canvas_runs (id, canvas_id, status, node_states, execution_order, started_at, created_at)
      VALUES (?, ?, 'running', ?, ?, ?, ?)`)
      .run(runId, params.id, JSON.stringify(initialNodeStates), JSON.stringify(executionOrder), now, now);

    // Fire and forget
    executeCanvas(params.id, runId).catch(err => {
      console.error('[Canvas] Error ejecutando canvas:', err);
    });

    return NextResponse.json({ runId, status: 'running' });
  } catch (error) {
    console.error('[Canvas] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
```

### GET /api/canvas/{id}/run/{runId}/status — Route

```typescript
// Returns: node_states (full), current_node_id, status, elapsed, total_tokens, execution_order
export async function GET(request: Request, { params }: { params: { id: string; runId: string } }) {
  const run = db.prepare('SELECT * FROM canvas_runs WHERE id = ? AND canvas_id = ?')
    .get(params.runId, params.id) as CanvasRun | undefined;
  if (!run) return NextResponse.json({ error: 'Run no encontrado' }, { status: 404 });

  const elapsed = run.started_at ? Math.round((Date.now() - new Date(run.started_at).getTime()) / 1000) : 0;
  const nodeStates: NodeStates = run.node_states ? JSON.parse(run.node_states) : {};
  const executionOrder: string[] = run.execution_order ? JSON.parse(run.execution_order) : [];

  const completedCount = Object.values(nodeStates).filter(s => s.status === 'completed' || s.status === 'skipped').length;

  return NextResponse.json({
    status: run.status,
    node_states: nodeStates,
    current_node_id: run.current_node_id,
    execution_order: executionOrder,
    total_steps: executionOrder.length,
    completed_steps: completedCount,
    elapsed_seconds: elapsed,
    total_tokens: run.total_tokens,
    total_duration: run.total_duration,
    completed_at: run.completed_at,
  });
}
```

### Canvas Editor — Polling Integration

```typescript
// In CanvasShell component (canvas-editor.tsx)
const [runId, setRunId] = useState<string | null>(null);
const [isExecuting, setIsExecuting] = useState(false);
const [runStatus, setRunStatus] = useState<string | null>(null);
const [runStats, setRunStats] = useState<{ completedSteps: number; totalSteps: number; elapsedSeconds: number; totalTokens: number } | null>(null);
const [checkpointDialog, setCheckpointDialog] = useState<{ nodeId: string; predecessorOutput: string | null } | null>(null);
const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// Cleanup polling on unmount
useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

async function handleExecute() {
  const res = await fetch(`/api/canvas/${canvasId}/execute`, { method: 'POST' });
  const data = await res.json();
  if (data.runId) {
    setRunId(data.runId);
    setIsExecuting(true);
    schedulePoll(data.runId);
  }
}

function schedulePoll(rid: string) {
  pollRef.current = setTimeout(() => pollStatus(rid), 2000);
}

async function pollStatus(rid: string) {
  const res = await fetch(`/api/canvas/${canvasId}/run/${rid}/status`);
  const data = await res.json();

  setRunStats({ completedSteps: data.completed_steps, totalSteps: data.total_steps, elapsedSeconds: data.elapsed_seconds, totalTokens: data.total_tokens });

  // Inject execution state into nodes
  if (data.node_states) {
    setNodes(prev => prev.map(n => ({
      ...n,
      data: { ...n.data, executionStatus: data.node_states[n.id]?.status || 'pending', executionOutput: data.node_states[n.id]?.output },
    })));
    setEdges(prev => applyEdgeAnimation(prev, data.node_states));
  }

  // Check for waiting checkpoint
  const waitingEntry = Object.entries(data.node_states || {}).find(([, s]) => (s as NodeState).status === 'waiting');
  if (waitingEntry) {
    const [checkpointNodeId] = waitingEntry;
    // Find predecessor output
    const inEdge = edges.find(e => e.target === checkpointNodeId);
    const predOutput = inEdge ? (data.node_states[inEdge.source] as NodeState)?.output || null : null;
    setCheckpointDialog({ nodeId: checkpointNodeId, predecessorOutput: predOutput });
  }

  const terminal = ['completed', 'failed', 'cancelled'];
  if (terminal.includes(data.status)) {
    setIsExecuting(false);
    setRunStatus(data.status);
  } else {
    schedulePoll(rid); // Continue polling
  }
}
```

---

## Execution State Machine

```
canvas_runs.status:
  'pending'   → initial, before executor starts
  'running'   → executor active
  'waiting'   → paused at CHECKPOINT, awaiting user decision
  'completed' → all nodes done
  'failed'    → any node failed
  'cancelled' → user cancelled

node_states[nodeId].status:
  'pending'   → not yet reached
  'running'   → currently executing
  'completed' → output stored
  'failed'    → error stored
  'waiting'   → CHECKPOINT waiting for user (only for CHECKPOINT nodes)
  'skipped'   → on non-chosen CONDITION branch
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Task executor (linear steps) | Canvas executor (DAG topological) | v5.0 (Phase 25) | Same fire-and-forget + polling pattern, different execution order calculation |
| In-memory cancel via Map | Same pattern | — | Proven in task-executor.ts; identical for canvas runs |
| WebSocket for real-time | 2s polling | v5.0 decision | Simpler; WebSocket deferred to FUTURE-03 |
| Parallel branch execution | Sequential topological | v5.0 decision | Parallel deferred to FUTURE-01 |

---

## Open Questions

1. **CONDITION rejected branch: full skip vs partial skip**
   - What we know: Nodes only reachable via the non-chosen branch should be skipped.
   - What's unclear: How to determine "reachable only via" — a node might be reachable from multiple paths (e.g., a MERGE after a CONDITION). That MERGE should not be skipped.
   - Recommendation: DFS from the non-chosen branch's target, but stop if a node also has an incoming edge from a non-skipped node. A MERGE reachable from both branches is NOT skipped; it just waits for its remaining inputs, which in sequential execution means it will be reached when the topological sort processes it after the chosen branch completes.

2. **canvas_runs.status 'waiting' on startup cleanup**
   - What we know: db.ts marks 'running' canvas_runs as 'failed' on startup.
   - What's unclear: Should 'waiting' runs (paused at checkpoint) also be marked 'failed' on restart?
   - Recommendation: Yes — a 'waiting' run cannot be resumed after server restart because the in-memory executor state is gone. Mark 'waiting' as 'failed' in the startup cleanup in db.ts.

3. **OUTPUT node: what constitutes the final output**
   - What we know: OUTPUT node is the terminal node. Its predecessor's output is "the result."
   - What's unclear: Does the OUTPUT node itself execute an LLM call, or just pass through its predecessor's output?
   - Recommendation: OUTPUT node is pass-through — its output in `node_states` is the predecessor's output. No LLM call. The EXEC-11 "output final expandible" in toolbar shows `nodeStates[outputNodeId].output`.

4. **Re-execute after reject: which predecessor?**
   - What we know: Reject checkpoint means re-run the predecessor and pause at checkpoint again.
   - What's unclear: For a CHECKPOINT with multiple paths merging into it (via MERGE upstream), which predecessor to re-run?
   - Recommendation: Re-run the direct predecessor (the node connected via the checkpoint's single incoming edge). If that predecessor is a MERGE, it will re-collect all its own inputs. Resume execution from that predecessor's position in the execution_order.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — TypeScript compile check + manual browser verification |
| Config file | None |
| Quick run command | `cd ~/docflow/app && npm run build` |
| Full suite command | `cd ~/docflow/app && npm run build` (then manual browser smoke test) |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXEC-01 | POST /execute creates run and returns runId | build check | `npm run build` | ❌ Wave 0 |
| EXEC-02 | GET /status returns node_states JSON | build check | `npm run build` | ❌ Wave 0 |
| EXEC-03 | canvas-executor.ts runs DAG nodes in topological order | manual browser | execute a test canvas | N/A — manual only |
| EXEC-04 | Node colors change during execution | visual | manual browser | N/A — manual only |
| EXEC-05 | Edges animate with violet stroke | visual | manual browser | N/A — manual only |
| EXEC-06 | Toolbar shows "Ejecutando paso X/Y" | visual | manual browser | N/A — manual only |
| EXEC-07 | Approve resumes execution | manual browser | approve checkpoint in UI | N/A — manual only |
| EXEC-08 | Reject re-runs predecessor with feedback | manual browser | reject checkpoint in UI | N/A — manual only |
| EXEC-09 | Checkpoint dialog shows output + textarea | visual | manual browser | N/A — manual only |
| EXEC-10 | Cancel stops execution, nodes stay pending | manual browser | cancel mid-execution | N/A — manual only |
| EXEC-11 | Final state: all green, expandible output, stats | visual | manual browser | N/A — manual only |
| EXEC-12 | Read-only mode: nodes not draggable during execution | visual | manual browser | N/A — manual only |
| EXEC-13 | usage_logs has canvas_execution row | manual DB check | SQLite query | N/A — manual only |

### Sampling Rate

- **Per task commit:** `cd ~/docflow/app && npm run build`
- **Per wave merge:** Full build + manual execution of a 3-node canvas (START → AGENT → OUTPUT)
- **Phase gate:** Full execution cycle (including checkpoint approve/reject and cancel) working before phase complete

### Wave 0 Gaps

- [ ] `usage-tracker.ts` — add `'canvas_execution'` to `UsageEvent.event_type` union
- [ ] `types.ts` — add `'canvas_execution'` to `UsageLog.event_type` union
- [ ] `db.ts` — update startup cleanup to also mark `'waiting'` canvas_runs as `'failed'`

*(No new test files needed — existing infrastructure (npm run build) covers all automated checks)*

---

## Sources

### Primary (HIGH confidence)

- Existing codebase: `app/src/lib/services/task-executor.ts` — direct implementation template for canvas-executor.ts
- Existing codebase: `app/src/app/api/tasks/[id]/execute/route.ts` — fire-and-forget pattern
- Existing codebase: `app/src/app/api/tasks/[id]/status/route.ts` — polling endpoint pattern
- Existing codebase: `app/src/app/api/tasks/[id]/cancel/route.ts` — cancel pattern
- Existing codebase: `app/src/app/api/tasks/[id]/steps/[stepId]/approve/route.ts` — checkpoint approve pattern
- Existing codebase: `app/src/app/api/tasks/[id]/steps/[stepId]/reject/route.ts` — checkpoint reject pattern
- Existing codebase: `app/src/lib/db.ts` (lines 903-942) — canvas_runs table schema
- Existing codebase: `app/src/components/canvas/canvas-editor.tsx` — current editor state, props, auto-save stripping
- Existing codebase: `app/src/components/canvas/canvas-toolbar.tsx` — current toolbar props interface
- Existing codebase: `app/src/components/canvas/nodes/checkpoint-node.tsx` — confirmed handle IDs "approved" / "rejected"
- Existing codebase: `app/src/lib/services/usage-tracker.ts` — logUsage interface
- STATE.md decisions: fire-and-forget + 2s polling, Kahn's algorithm, sequential execution, canvas-executor mirrors task-engine pattern
- REQUIREMENTS.md: All 13 EXEC requirements confirmed pending

### Secondary (MEDIUM confidence)

- React Flow docs: https://reactflow.dev/api-reference/react-flow — `nodesDraggable`, `nodesConnectable`, `elementsSelectable` props for read-only mode
- React Flow updateNode pattern: https://reactflow.dev/api-reference/hooks/use-react-flow — updateNode for injecting executionStatus into node.data
- React Flow animated edges: `animated: true` on Edge object

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages needed; all services are existing code verified by inspection
- Architecture: HIGH — canvas-executor.ts pattern is directly derived from task-executor.ts which works in production; DB schema confirmed in db.ts
- API routes: HIGH — all mirrors of existing task routes; patterns confirmed by reading source files
- React Flow visual state: HIGH — updateNode and nodesDraggable confirmed in official docs and in existing usage
- CONDITION branch skipping: MEDIUM — the exact DFS logic for partial skipping needs careful implementation but the concept is straightforward
- Checkpoint resume after reject: MEDIUM — edge case when predecessor is a MERGE needs consideration (see Open Questions)

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable codebase; valid until major React Flow or Next.js upgrade)
