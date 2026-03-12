# Architecture Patterns: React Flow Canvas Integration

**Domain:** Visual node-based workflow canvas editor integrated into existing Next.js 14 App Router + SQLite application
**Researched:** 2026-03-12
**Overall confidence:** HIGH (React Flow official docs verified, existing codebase read directly)

---

## Recommended Architecture

The canvas system is a **new vertical slice** added alongside the existing task system. It reuses the execution engine pattern (adapted for DAG), shares the same SQLite database, and follows the same API route + polling conventions already established in v2.0/v3.0.

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Client Components — "use client")                  │
│                                                             │
│  /canvas          /canvas/new      /canvas/[id]            │
│  CanvasListPage   CanvasWizard     CanvasEditorPage         │
│       │                                  │                  │
│  CanvasCard                     ReactFlowProvider           │
│  (SVG thumb)                         │                      │
│                              CanvasEditor ("use client")    │
│                              ├── nodeTypes map              │
│                              ├── useNodesState/useEdgesState│
│                              ├── useAutoSave (debounce 3s)  │
│                              ├── useDAGExecution (polling)  │
│                              └── dagre auto-layout          │
└────────────────────────────────┬────────────────────────────┘
                                 │ fetch()
┌────────────────────────────────▼────────────────────────────┐
│  Next.js API Routes (Server — Node.js process)              │
│                                                             │
│  /api/canvas              CRUD (list, create, get, update)  │
│  /api/canvas/[id]/execute  Start DAG execution              │
│  /api/canvas/[id]/status   Polling endpoint (node states)   │
│  /api/canvas/[id]/node/[nid]/approve  Checkpoint approve    │
│  /api/canvas/[id]/node/[nid]/reject   Checkpoint reject     │
│  /api/canvas/[id]/cancel   Cancel running canvas            │
└────────────────────────────────┬────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────┐
│  canvas-executor.ts  (NEW — mirrors task-executor.ts)       │
│  ├── runningCanvases: Map<string, { cancelled: boolean }>   │
│  ├── topoSort(nodes, edges): string[]  (BFS in-degree)      │
│  ├── executeCanvasNode(nodeId, context)                     │
│  │   ├── AGENT   → callLLM() (same as task-executor)        │
│  │   ├── PROJECT → process/run endpoint or direct RAG       │
│  │   ├── CONNECTOR → executeConnectors() (reuse)            │
│  │   ├── MERGE   → executeMerge() (reuse)                   │
│  │   ├── CONDITION → evaluate condition, return next branch │
│  │   ├── CHECKPOINT → pause, update DB, return              │
│  │   ├── START   → no-op, begin traversal                   │
│  │   └── OUTPUT  → collect final result, write to canvas    │
│  └── resumeAfterCheckpoint / cancelCanvas / retryCanvas     │
└────────────────────────────────┬────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────┐
│  SQLite (better-sqlite3) — NEW TABLES                       │
│  ├── canvases         (CRUD, mode, flow_data JSON)          │
│  └── canvas_node_states  (execution state per node run)     │
│                                                             │
│  SHARED (existing, unchanged):                              │
│  ├── custom_agents, connectors, agent_connector_access      │
│  ├── projects (for PROJECT nodes)                           │
│  ├── skills                                                 │
│  └── usage_logs (canvas execution logged here)              │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `CanvasListPage` (server or client) | Show all canvases with filters, SVG thumbs | `/api/canvas` GET |
| `CanvasWizard` (client) | 2-step creation: mode selection + name/description | `/api/canvas` POST |
| `CanvasEditorPage` (client) | Full-page editor shell, toolbar, execution controls | `CanvasEditor`, API routes |
| `CanvasEditor` (client) | ReactFlowProvider + canvas state, auto-save, node/edge CRUD | `/api/canvas/[id]` PATCH |
| `AgentNode`, `ProjectNode`, etc. (client) | Custom node renderers with execution state styling | Zustand or useNodesState |
| `canvas-executor.ts` (server) | DAG traversal, step dispatch, state writes | SQLite, task-executor helpers |
| API routes under `/api/canvas/` | HTTP interface, fire-and-forget execution launch | `canvas-executor.ts`, SQLite |

---

## Data Model: New SQLite Tables

### `canvases` table

```sql
CREATE TABLE IF NOT EXISTS canvases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  mode TEXT NOT NULL DEFAULT 'mixed',  -- 'agent_flow' | 'project_flow' | 'mixed'
  flow_data TEXT,   -- JSON: { nodes: [...], edges: [...], viewport: {...} }
  thumbnail TEXT,   -- SVG string, generated client-side via minimap snapshot
  status TEXT DEFAULT 'idle',  -- 'idle' | 'running' | 'paused' | 'completed' | 'failed'
  last_run_at TEXT,
  result_output TEXT,
  total_tokens INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### `canvas_node_states` table

One row per node per execution run (truncated; only the latest run matters for UI).

```sql
CREATE TABLE IF NOT EXISTS canvas_node_states (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,     -- React Flow node id (string)
  node_type TEXT NOT NULL,   -- 'agent' | 'project' | 'connector' | 'checkpoint' | etc.
  status TEXT DEFAULT 'pending',  -- 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  output TEXT,
  tokens_used INTEGER DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0,
  error_message TEXT,
  human_feedback TEXT,       -- for checkpoint reject/retry cycle
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

**Design rationale:** Separating execution state from `flow_data` means the canvas JSON (stored in `canvases.flow_data`) never mutates during execution. Node positions, labels, and connections remain stable. Only `canvas_node_states` changes during a run. The polling endpoint reads from `canvas_node_states` and the React Flow canvas overlay updates node data without overwriting the stored layout.

---

## React Flow Integration with Next.js 14 App Router

### SSR Constraint (MEDIUM confidence — verified via official docs)

React Flow cannot measure node dimensions server-side. The `ReactFlow` component and all `useReactFlow` hooks must be inside a `"use client"` boundary with `ReactFlowProvider`. The entire canvas editor page must be a client component.

**Pattern to follow:**

```
app/canvas/[id]/page.tsx       — can be server component for data fetch
  └── <CanvasEditorClient />   — "use client" boundary starts here
        └── <ReactFlowProvider>
              └── <CanvasEditor />
```

The `page.tsx` fetches canvas data on the server (or passes a canvas ID), then hands off to the client component. Do NOT put `ReactFlow` in a server component.

### Fixed Height Requirement

React Flow container needs a fixed height — use `h-[calc(100vh-64px)]` (per PROJECT.md constraint). The parent must not have `overflow: hidden` outside the React Flow wrapper itself.

### nodeTypes Registration

Define the `nodeTypes` object **outside** the component render function (module scope or a stable `useMemo`) to prevent unnecessary re-mounts on every render:

```typescript
// Outside component:
const nodeTypes: NodeTypes = {
  start: StartNode,
  agent: AgentNode,
  project: ProjectNode,
  connector: ConnectorNode,
  checkpoint: CheckpointNode,
  merge: MergeNode,
  condition: ConditionNode,
  output: OutputNode,
};
```

---

## Data Flow Between Canvas Nodes

### The Context Object Pattern

During DAG execution, a shared `executionContext` object is passed forward through the DAG. It maps `nodeId → output string`. This replaces `task_steps.context_mode` from the linear task system.

```typescript
interface CanvasExecutionContext {
  canvasId: string;
  canvasName: string;
  nodeOutputs: Record<string, string>;  // nodeId → text output
  linkedProjects: string[];             // collected from PROJECT nodes
  startedAt: number;
}
```

Each node type reads its input from `nodeOutputs` of its predecessor nodes (those connected by incoming edges). This generalizes the `previous` / `all` / `manual` context modes:

- **Single predecessor:** use that predecessor's `nodeOutputs[predId]`
- **Multiple predecessors (MERGE node):** collect all predecessor outputs, pass all to LLM
- **CONDITION node:** evaluate condition expression against `nodeOutputs[predId]`

### How Edges Encode Context

The edges in `flow_data` define the data flow paths. During execution the executor resolves: "for node X, which nodes have edges pointing into X?" — those nodes' outputs are the inputs.

---

## DAG Execution: Topological Sort + Node State

### Algorithm (BFS in-degree — same as Kahn's algorithm)

Implemented purely in `canvas-executor.ts`, no external library needed. The existing codebase has no topological sort utility — this is new code.

```typescript
function topoSort(nodes: FlowNode[], edges: FlowEdge[]): string[] {
  // Build adjacency: inDegree map and adjacency list
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const n of nodes) { inDegree.set(n.id, 0); adj.set(n.id, []); }
  for (const e of edges) {
    adj.get(e.source)!.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  }

  const queue = nodes.filter(n => inDegree.get(n.id) === 0).map(n => n.id);
  const sorted: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    sorted.push(nodeId);
    for (const neighbor of adj.get(nodeId) || []) {
      const deg = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) queue.push(neighbor);
    }
  }

  if (sorted.length !== nodes.length) throw new Error('El canvas contiene ciclos — no es un DAG valido');
  return sorted;
}
```

### Execution Loop (mirrors `executeTask` in task-executor.ts)

```typescript
export async function executeCanvas(canvasId: string): Promise<void> {
  const state = { cancelled: false };
  runningCanvases.set(canvasId, state);

  // 1. Mark canvas as running
  // 2. Load flow_data JSON, parse nodes + edges
  // 3. Reset canvas_node_states rows for this run
  // 4. topoSort(nodes, edges) → ordered node IDs
  // 5. For each nodeId in sorted order:
  //    a. Check cancelled flag
  //    b. Mark node state as 'running'
  //    c. Dispatch to node-type handler
  //    d. On CHECKPOINT: mark canvas 'paused', remove from runningCanvases, return
  //    e. On error: mark node 'failed', mark canvas 'failed', return
  // 6. Mark canvas 'completed', write result_output from OUTPUT node
}
```

### Checkpoint Pause/Resume

Same pattern as `task-executor.ts`:
- On CHECKPOINT node: update `canvas_node_states` row to `status='running'` (waiting), set canvas `status='paused'`, exit `executeCanvas()`.
- Approve endpoint: mark node state `completed`, resume `executeCanvas()` fire-and-forget.
- Reject endpoint: mark node state `pending`, reset predecessor node state to `pending`, add `human_feedback`, resume.

This reuses `resumeAfterCheckpoint` / `rejectCheckpoint` patterns verbatim.

---

## Auto-Save: Canvas Flow Data

The canvas editor auto-saves the `flow_data` JSON (React Flow's `toObject()` output) to the server on a 3-second debounce. This is the React Flow serialization API:

```typescript
const { toObject } = useReactFlow();

const saveCanvas = useCallback(
  debounce(async () => {
    const flowData = toObject(); // { nodes, edges, viewport }
    await fetch(`/api/canvas/${canvasId}`, {
      method: 'PATCH',
      body: JSON.stringify({ flow_data: JSON.stringify(flowData) }),
    });
  }, 3000),
  [canvasId, toObject]
);
```

`toObject()` captures node positions, data payloads, edge connections, and viewport state. This is stored as TEXT in SQLite. On load, `JSON.parse(canvas.flow_data)` restores the complete layout.

---

## Execution Status Polling

The canvas execution view uses 2-second polling (same interval as task execution view in `app/src/app/tasks/[id]/page.tsx`).

### Status Endpoint Response Shape

```typescript
// GET /api/canvas/[id]/status
{
  canvasStatus: 'running' | 'paused' | 'completed' | 'failed' | 'idle',
  nodeStates: {
    [nodeId: string]: {
      status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped',
      output?: string,
      tokens_used?: number,
      duration_seconds?: number,
      error_message?: string,
    }
  },
  totalTokens: number,
  pausedAtNodeId?: string,   // set when status === 'paused'
}
```

### Updating React Flow Node Appearance

During polling, the client maps `nodeStates` onto node `data.executionStatus`. Custom node components read `data.executionStatus` to change their border color and show spinners:

```typescript
// In CanvasEditor polling loop:
setNodes(prev => prev.map(n => ({
  ...n,
  data: {
    ...n.data,
    executionStatus: nodeStates[n.id]?.status ?? 'pending',
  }
})));
```

This avoids mutating the stored `flow_data` — execution state lives only in React component state during the session, sourced from `canvas_node_states` via the API.

---

## Auto-Layout with Dagre

When a user clicks "Auto-layout" or after template load, call dagre to reposition nodes.

```typescript
import dagre from '@dagrejs/dagre';

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 40 });

  nodes.forEach(n => g.setNode(n.id, { width: 240, height: 80 }));
  edges.forEach(e => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map(n => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 120, y: pos.y - 40 } };
  });
}
```

Key: provide explicit `width`/`height` to dagre since custom nodes don't have measured dimensions at layout time. Use `LR` (left-to-right) direction — matches natural pipeline reading direction. Call `fitView()` after applying layout.

---

## SVG Thumbnails

SVG thumbnails for the canvas list cards are generated from the `MiniMap` React Flow component using `renderToStaticMarkup` server-side is NOT the path here. Instead:

1. When the canvas editor saves, also call `getViewportForBounds()` + `toObject()` and build a minimal SVG representation from node positions client-side.
2. Store the SVG string in `canvases.thumbnail`.
3. Render on the list page as `<img src={\`data:image/svg+xml,...\`} />` or inline.

The simplest approach: generate a fixed-size (320×180) SVG from node positions and colors in a `generateThumbnail(nodes: Node[]): string` utility function. No external library needed. Circles + lines are sufficient for thumbnails.

---

## New vs Modified Components

### New Files

| File | Type | Purpose |
|------|------|---------|
| `app/src/app/canvas/page.tsx` | Page | Canvas list with thumbnails, filters by mode |
| `app/src/app/canvas/new/page.tsx` | Page | 2-step creation wizard |
| `app/src/app/canvas/[id]/page.tsx` | Page | Canvas editor shell (hands off to client component) |
| `app/src/components/canvas/canvas-editor.tsx` | Client | ReactFlowProvider + core editor logic |
| `app/src/components/canvas/nodes/agent-node.tsx` | Client | AGENT node renderer |
| `app/src/components/canvas/nodes/project-node.tsx` | Client | PROJECT node renderer |
| `app/src/components/canvas/nodes/connector-node.tsx` | Client | CONNECTOR node renderer |
| `app/src/components/canvas/nodes/checkpoint-node.tsx` | Client | CHECKPOINT with approve/reject UI |
| `app/src/components/canvas/nodes/merge-node.tsx` | Client | MERGE node renderer |
| `app/src/components/canvas/nodes/condition-node.tsx` | Client | CONDITION with expression field |
| `app/src/components/canvas/nodes/start-node.tsx` | Client | START node renderer |
| `app/src/components/canvas/nodes/output-node.tsx` | Client | OUTPUT node renderer |
| `app/src/components/canvas/canvas-toolbar.tsx` | Client | Add node, auto-layout, execute, cancel buttons |
| `app/src/components/canvas/canvas-execution-panel.tsx` | Client | Execution status overlay, log feed, checkpoint UI |
| `app/src/components/canvas/canvas-card.tsx` | Client | List card with SVG thumbnail |
| `app/src/components/canvas/node-config-panel.tsx` | Client | Side panel for configuring selected node |
| `app/src/lib/services/canvas-executor.ts` | Server | DAG execution engine (mirrors task-executor.ts) |
| `app/src/lib/canvas-types.ts` | Shared | TypeScript types for canvas nodes/edges/state |
| `app/src/app/api/canvas/route.ts` | API | GET list, POST create |
| `app/src/app/api/canvas/[id]/route.ts` | API | GET, PATCH, DELETE |
| `app/src/app/api/canvas/[id]/execute/route.ts` | API | POST — launch execution |
| `app/src/app/api/canvas/[id]/status/route.ts` | API | GET — polling endpoint |
| `app/src/app/api/canvas/[id]/cancel/route.ts` | API | POST — cancel |
| `app/src/app/api/canvas/[id]/node/[nid]/approve/route.ts` | API | POST — checkpoint approve |
| `app/src/app/api/canvas/[id]/node/[nid]/reject/route.ts` | API | POST — checkpoint reject |

### Modified Files

| File | Change |
|------|--------|
| `app/src/lib/db.ts` | Add `canvases` and `canvas_node_states` table creation + canvas template seeds |
| `app/src/components/layout/sidebar.tsx` | Add Canvas nav item (between Tareas and Conectores) |
| `app/src/lib/services/task-executor.ts` | Extract shared helpers to `executor-helpers.ts` (optional refactor, not required for v5.0) |
| `app/src/lib/types.ts` | Add Canvas, CanvasNodeState types |
| `app/package.json` | Add `reactflow`, `@dagrejs/dagre`, `@types/dagre` |

---

## Patterns to Follow

### Pattern 1: Separate Execution State from Canvas Layout

**What:** Never write execution status back into `flow_data`. Keep `flow_data` as the pure design artifact; keep execution state in `canvas_node_states` and in React component state during the session.

**Why:** Mixing them would corrupt the canvas layout on every execution run.

**Implementation:** Poll `/api/canvas/[id]/status` and map results onto `node.data.executionStatus` using `setNodes()` in the polling callback. The `flow_data` PATCH endpoint only fires on user-driven canvas edits (auto-save), never during execution.

### Pattern 2: Fire-and-Forget Execution (same as task-executor)

**What:** The `/api/canvas/[id]/execute` route calls `executeCanvas(id)` without `await` and returns immediately. The client polls for status.

**Why:** Next.js API routes would time out on long-running multi-node DAGs. This is proven by the existing task system.

```typescript
// In execute/route.ts:
export async function POST(req, { params }) {
  executeCanvas(params.id).catch(console.error); // fire and forget
  return NextResponse.json({ started: true });
}
```

### Pattern 3: Bracket Notation for Env Vars

**What:** All `process['env']['VARIABLE']` notation in `canvas-executor.ts`.

**Why:** Existing constraint — prevents webpack inlining at build time. Already used throughout `task-executor.ts` and all API routes.

### Pattern 4: generateId() for Node IDs

**What:** Use the existing `generateId()` helper (UUID v4 via Math.random) in the canvas editor for creating new node IDs. Also use for canvas row IDs in API routes (not `crypto.randomUUID()`).

**Why:** `crypto.randomUUID()` requires HTTPS; app runs on HTTP. `uuidv4()` from the `uuid` package is fine in Node.js context (API routes) but `generateId()` is the established client-side pattern.

### Pattern 5: dynamic = 'force-dynamic' on Stateless API Routes

**What:** All canvas API routes that read env vars but have no path params need `export const dynamic = 'force-dynamic'`.

**Why:** Established constraint — prevents Next.js static prerendering.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Zustand for Canvas State

**What:** Using Zustand as recommended by React Flow docs for state management.

**Why bad:** The project does not have Zustand installed. Adding a new state library for one feature increases complexity. The project already uses React's built-in `useState`/`useCallback` pattern throughout. React Flow's built-in `useNodesState`/`useEdgesState` hooks are sufficient for this use case, and `setNodes()` is callable from within the polling callback.

**Instead:** Use `useNodesState` + `useEdgesState` from `reactflow`. Update node execution status by calling `setNodes(prev => prev.map(...))` inside the polling `useEffect`. This is the simpler, consistent approach.

### Anti-Pattern 2: Storing Execution Output in React Flow Node Data on Save

**What:** Auto-saving `toObject()` while execution is running, which would persist `executionStatus` and `output` fields into `flow_data`.

**Why bad:** `flow_data` would grow with every execution. Canvas templates would ship with stale execution data.

**Instead:** Before calling `toObject()` for auto-save, strip execution fields from node data:
```typescript
const cleanNodes = nodes.map(n => ({
  ...n,
  data: { ...n.data, executionStatus: undefined, executionOutput: undefined }
}));
```
Only save the clean version.

### Anti-Pattern 3: Cycle Detection at Runtime Inside Execution

**What:** Running cycle detection during `executeCanvas()` on every tick.

**Why bad:** Expensive, unnecessary after the initial topoSort validates the DAG.

**Instead:** Validate DAG (detect cycles) once at execution start via topoSort. If topoSort throws (cycle detected), abort immediately with a user-facing error before any node runs. Also add a client-side validation that prevents launching execution if cycle exists.

### Anti-Pattern 4: One API Route Per Node Type

**What:** Creating `/api/canvas/[id]/execute/agent`, `/api/canvas/[id]/execute/connector`, etc.

**Why bad:** Over-engineering. The execution engine dispatches internally by type.

**Instead:** Single `/api/canvas/[id]/execute` route that starts `canvas-executor.ts`. The executor handles all 8 node types internally.

---

## Build Order (Dependency-Ordered Phases)

Based on component and API dependencies, the recommended build sequence:

1. **Data model + API CRUD** — `canvases` + `canvas_node_states` tables, all CRUD routes, wizard, list page. No execution logic yet. Validates data model before building on top of it.

2. **Canvas Editor + Node Types** — React Flow installation, custom nodes (all 8 types), toolbar, node config panel, auto-save, dagre layout, SVG thumbnails. This is the core visual editor. Requires the API from phase 1.

3. **Execution Engine** — `canvas-executor.ts`, execute/status/cancel/approve/reject API routes, execution panel UI with polling. Requires the data model (phase 1) and the node type system (phase 2). Adapts `task-executor.ts` patterns for DAG traversal.

4. **Templates** — 4 seed canvas templates seeded in `db.ts`. Requires all prior phases. Templates are JSON `flow_data` objects, no new infrastructure.

---

## Scalability Considerations

| Concern | At current scale (single user, local) | If needed later |
|---------|---------------------------------------|-----------------|
| Concurrent executions | In-memory `runningCanvases` Map is fine | Could move to Redis for multi-instance |
| Canvas list performance | SQLite full scan with 10-50 canvases, fine | Add indexes on `mode`, `status`, `updated_at` |
| Large flow_data JSON | A 20-node canvas is ~10KB JSON, fine | Consider compressing if > 100 nodes |
| Polling overhead | 2s polling for one execution, fine | No change needed |
| Canvas node state history | No history — single execution state only | Add `run_id` to enable multi-run history |

---

## Integration Points with Existing System

| Existing System | How Canvas Uses It |
|-----------------|--------------------|
| `task-executor.ts` → `callLLM()` | Canvas executor duplicates this helper (or extracts to shared `executor-helpers.ts`) |
| `task-executor.ts` → `executeConnectors()` | Same function, usable from canvas executor via import |
| `task-executor.ts` → `getRagContext()` | Reused by AGENT nodes with `use_project_rag: true` |
| `usage-tracker.ts` → `logUsage()` | Canvas node executions log with `event_type: 'task_step'` (reuse existing type) or new `canvas_node` type |
| `connectors` table | CONNECTOR nodes read from this table |
| `custom_agents` + OpenClaw | AGENT nodes select from same agent list |
| `projects` table | PROJECT nodes reference projects by ID for RAG |
| `skills` table | AGENT nodes can attach skills (same as task pipeline steps) |
| Sidebar navigation | Canvas added as new nav item in existing `sidebar.tsx` |

---

## Sources

- [React Flow TypeScript Guide](https://reactflow.dev/learn/advanced-use/typescript) — HIGH confidence, official docs
- [React Flow SSR/SSG Configuration](https://reactflow.dev/learn/advanced-use/ssr-ssg-configuration) — HIGH confidence, official docs
- [React Flow State Management](https://reactflow.dev/learn/advanced-use/state-management) — HIGH confidence, official docs
- [React Flow Save and Restore](https://reactflow.dev/examples/interaction/save-and-restore) — HIGH confidence, official docs
- [Dagre Layout Example](https://reactflow.dev/examples/layout/dagre) — HIGH confidence, official docs
- [React Flow Auto-Layout Overview](https://reactflow.dev/learn/layouting/layouting) — HIGH confidence, official docs
- [ReactFlowJsonObject type](https://reactflow.dev/api-reference/types/react-flow-json-object) — HIGH confidence, official docs
- [xyflow/react-flow-example-apps (Next.js)](https://github.com/xyflow/react-flow-example-apps) — MEDIUM confidence, official examples
- Existing codebase: `task-executor.ts`, `db.ts`, `usage-tracker.ts` — HIGH confidence, read directly
