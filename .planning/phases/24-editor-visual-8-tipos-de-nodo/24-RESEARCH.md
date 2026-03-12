# Phase 24: Editor Visual + 8 Tipos de Nodo — Research

**Researched:** 2026-03-12
**Domain:** React Flow (@xyflow/react) visual canvas editor with 8 custom node types, Next.js 14 App Router
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EDIT-01 | Pagina /canvas/{id} con React Flow (@xyflow/react) — "use client" + dynamic({ ssr: false }), container h-[calc(100vh-64px)] | React Flow SSR pattern documented; container height requirement verified |
| EDIT-02 | Toolbar superior sticky: boton volver, nombre editable inline, boton guardar, boton ejecutar (validado), boton settings | Standard React pattern with useReactFlow() inside ReactFlowProvider |
| EDIT-03 | Panel lateral izquierdo (80px): paleta de nodos como iconos draggables con tooltip — 7 tipos (Agent, Project, Connector, Checkpoint, Merge, Condition, Output) | React Flow onDrop + onDragOver pattern for node palette |
| EDIT-04 | Canvas infinito con fondo zinc-950, grid de puntos (dots 20px gap), snap-to-grid | ReactFlow Background component with BackgroundVariant.Dots; snapToGrid + snapGrid props |
| EDIT-05 | Conexion de nodos: drag de handle output a handle input, validacion (no output-output, no ciclos via isValidConnection) | isValidConnection prop with DFS cycle check; Handle components on custom nodes |
| EDIT-06 | Panel inferior colapsable: configuracion del nodo seleccionado con formulario especifico por tipo | useOnSelectionChange or onSelectionChange; selectedNodes[0] drives form rendering |
| EDIT-07 | Minimap en esquina inferior derecha, controles de zoom (+/-/fit), indicador de zoom | ReactFlow MiniMap + Controls components; useViewport() for zoom indicator |
| EDIT-08 | Auto-save cada 3s con debounce (useRef timer), indicador "Guardado"/"Guardando..."/"Sin guardar" | useRef timer pattern (NOT useCallback with deps); toObject() from useReactFlow() |
| EDIT-09 | Undo/Redo con Ctrl+Z / Ctrl+Shift+Z (historial de snapshots) | Snapshot history in useState array; useKeyPress or global keydown listener |
| EDIT-10 | Auto-layout con dagre (@dagrejs/dagre) — boton "Auto-organizar", direccion LR, espaciado 200px H / 100px V | @dagrejs/dagre layout function; NODE_DIMENSIONS constant per type; fitView() after |
| EDIT-11 | Delete nodos/edges con tecla Delete/Backspace, multi-seleccion con Shift+click o box-select | onNodesDelete + onEdgesDelete callbacks; deleteKeyCode prop; selectionOnDrag for box-select |
| NODE-01 | Nodo START — circulo emerald con Play icon, 1 output handle, solo 1 por canvas, campo "Input inicial" opcional | Custom node component with Handle type="source"; validation in isValidConnection to block second START |
| NODE-02 | Nodo AGENT — rectangulo violet con avatar, selector de agente, modelo editable, textarea instrucciones, toggle RAG, selector skills. 1 input + 1 output | GET /api/agents for selector; GET /api/skills for skills; updateNode to persist data changes |
| NODE-03 | Nodo PROJECT — rectangulo blue con icono proyecto, selector de proyecto, query RAG, limite chunks. 1 input + 1 output | GET /api/projects for selector; updateNode pattern |
| NODE-04 | Nodo CONNECTOR — rectangulo orange con emoji conector, selector conector, modo before/after, payload template. 1 input + 1 output | GET /api/connectors for selector; updateNode pattern |
| NODE-05 | Nodo CHECKPOINT — rectangulo amber con icono usuario, texto instruccion revisor. 1 input + 2 outputs (Aprobado/Rechazado) | Two source handles with id="approved" and id="rejected"; sourceHandle on edges |
| NODE-06 | Nodo MERGE — rombo cyan con icono merge, agente sintetizador opcional, instrucciones. Multiples inputs (hasta 5) + 1 output | Multiple target Handles with unique ids (target-1..target-5); dynamic handle count |
| NODE-07 | Nodo CONDITION — diamante yellow con icono bifurcacion, condicion en lenguaje natural o programatica. 1 input + 2 outputs (Si/No) | Two source handles with id="yes" and id="no"; diamond CSS shape |
| NODE-08 | Nodo OUTPUT — circulo emerald/zinc con icono flag, nombre del output, formato (markdown/json/plain). 1 input, 0 outputs | Handle type="target" only; no source handle |

</phase_requirements>

---

## Summary

Phase 24 builds the visual canvas editor — the most technically complex phase in v5.0. The foundation (DB tables, CRUD API, canvas list page, creation wizard) was completed in Phase 23. Phase 24 installs @xyflow/react and builds everything from the editor page shell to all 8 custom node types, toolbar, node config panel, auto-save, undo/redo, and dagre auto-layout.

The key risk in this phase is React Flow integration with Next.js 14 App Router. Five specific pitfalls can cause invisible failures: SSR crash from missing "use client" + dynamic(ssr:false), blank canvas from missing container height, invisible edges from CSS import order, node remount storms from nodeTypes inside component body, and useReactFlow() crash from ReactFlowProvider scope. All five have exact, documented preventions that must be applied in the first task of this phase.

The 8 node types have different complexity levels. START and OUTPUT are trivial (circles with 1 handle). AGENT and PROJECT nodes are medium complexity (dropdowns populated from existing APIs). CHECKPOINT and CONDITION nodes have 2 output handles with named ids — the handle naming is critical for correct edge routing. MERGE has multiple named target handles. The node config panel is a single component that renders a different form per selected node type.

**Primary recommendation:** Install React Flow packages first, establish the editor shell with all 5 critical pitfall preventions in place, then implement all 8 node types, then add the interaction features (auto-save, undo/redo, auto-layout, delete, multi-select). This order front-loads the highest-risk items.

---

## Standard Stack

### Core — New Packages Required

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@xyflow/react` | `^12.10.1` | Visual node/edge canvas engine | Industry standard; `reactflow` package is deprecated, this is the current name |
| `@dagrejs/dagre` | `^2.0.4` | DAG auto-layout (LR direction) | Maintained fork of abandoned `dagre`; required by React Flow official dagre example |
| `@types/dagre` | `^0.7.54` | TypeScript types for dagre | `@dagrejs/dagre` does not bundle its own types |
| `html-to-image` | `1.11.11` (pinned) | Client-side SVG thumbnail generation | Official React Flow docs pin to this exact version — later versions have known export bug |

**These packages are NOT yet installed.** The first task in Phase 24 must install them.

### Already Available (Phase 23 Infrastructure)

| Component | Location | Used By |
|-----------|----------|---------|
| Canvas CRUD API | `/api/canvas/[id]` PATCH | Auto-save endpoint |
| `generateId()` | `lib/utils.ts` | New node/edge IDs |
| `canvases` table | `db.ts` | flow_data storage |
| `canvas_runs` table | `db.ts` | Execution state (Phase 25) |
| Agent list API | `GET /api/agents` | AGENT node selector |
| Project list API | `GET /api/projects` | PROJECT node selector |
| Connector list API | `GET /api/connectors` | CONNECTOR node selector |
| Skills list API | `GET /api/skills` | AGENT node skills selector |

### Installation

```bash
cd ~/docflow/app
npm install @xyflow/react @dagrejs/dagre html-to-image@1.11.11
npm install -D @types/dagre
```

---

## Architecture Patterns

### Recommended File Structure

```
app/src/
├── app/
│   └── canvas/
│       └── [id]/
│           └── page.tsx              # Server-compatible shell, imports dynamic CanvasEditor
├── components/
│   └── canvas/
│       ├── canvas-editor.tsx         # "use client"; ReactFlowProvider + core state
│       ├── canvas-toolbar.tsx        # "use client"; sticky toolbar using useReactFlow()
│       ├── node-config-panel.tsx     # "use client"; bottom collapsible panel
│       └── nodes/
│           ├── start-node.tsx        # NODE-01
│           ├── agent-node.tsx        # NODE-02
│           ├── project-node.tsx      # NODE-03
│           ├── connector-node.tsx    # NODE-04
│           ├── checkpoint-node.tsx   # NODE-05
│           ├── merge-node.tsx        # NODE-06
│           ├── condition-node.tsx    # NODE-07
│           └── output-node.tsx       # NODE-08
```

### Pattern 1: SSR Guard (CRITICAL — prevents build failure)

**What:** Canvas editor page must use dynamic import with ssr:false plus "use client" on the editor component.

**When to use:** Always. Required for React Flow + Next.js App Router.

```tsx
// app/canvas/[id]/page.tsx  (can be server component for initial data fetch)
import dynamic from 'next/dynamic'

const CanvasEditor = dynamic(
  () => import('@/components/canvas/canvas-editor'),
  { ssr: false, loading: () => <div className="h-full bg-zinc-950 animate-pulse" /> }
)

export default function CanvasPage({ params }: { params: { id: string } }) {
  return <CanvasEditor canvasId={params.id} />
}
```

```tsx
// components/canvas/canvas-editor.tsx
"use client"
import { ReactFlow, ReactFlowProvider, ... } from '@xyflow/react'
```

### Pattern 2: nodeTypes as Module-Level Constant (CRITICAL — prevents remount storm)

**What:** The nodeTypes map must live OUTSIDE the component body.

**When to use:** Always. Defining inside component causes every node to remount on every state change.

```tsx
// Module scope — NEVER inside a component
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

export function CanvasEditor({ canvasId }: { canvasId: string }) {
  // ...
  return <ReactFlow nodeTypes={NODE_TYPES} ... />;
}
```

### Pattern 3: ReactFlowProvider Wrapping Full Shell (CRITICAL — prevents useReactFlow crash)

**What:** ReactFlowProvider must wrap toolbar + palette + canvas together, not just the ReactFlow component.

**When to use:** Whenever toolbar or sidebar components need useReactFlow() hooks.

```tsx
// canvas-editor.tsx
export function CanvasEditor({ canvasId }) {
  return (
    <ReactFlowProvider>
      <CanvasShell canvasId={canvasId} />
    </ReactFlowProvider>
  );
}

// CanvasShell is an inner component that can freely use useReactFlow()
function CanvasShell({ canvasId }) {
  const { fitView, toObject } = useReactFlow(); // works because we're inside Provider
  return (
    <>
      <CanvasToolbar />
      <div className="w-full h-[calc(100vh-64px)]">
        <ReactFlow ... />
      </div>
      <NodeConfigPanel />
    </>
  );
}
```

### Pattern 4: Auto-Save with useRef Timer (prevents debounce recreation bug)

**What:** Use useRef for the timer, not useState or useCallback with deps.

```tsx
const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');

const scheduleAutoSave = useCallback((flowData: ReactFlowJsonObject) => {
  setSaveStatus('unsaved');
  if (saveTimer.current) clearTimeout(saveTimer.current);
  saveTimer.current = setTimeout(async () => {
    setSaveStatus('saving');
    // Strip execution fields before saving
    const cleanNodes = flowData.nodes.map(n => ({
      ...n,
      data: { ...n.data, executionStatus: undefined, executionOutput: undefined }
    }));
    await fetch(`/api/canvas/${canvasId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flow_data: JSON.stringify({ ...flowData, nodes: cleanNodes }) }),
    });
    setSaveStatus('saved');
  }, 3000);
}, []); // EMPTY DEPS — stable reference

// Cleanup on unmount
useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);
```

### Pattern 5: Cycle Detection at Connection Time (isValidConnection)

**What:** Prevent cycles at draw time using DFS. Must be passed as prop to ReactFlow.

```tsx
const isValidConnection = useCallback((connection: Connection) => {
  // Prevent output-to-output or input-to-input connections
  // (React Flow handles this via handle types, but belt+suspenders)

  // DFS cycle check: would adding this edge create a cycle?
  const visited = new Set<string>();
  function hasCycle(nodeId: string): boolean {
    if (nodeId === connection.source) return true;
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    return edges
      .filter(e => e.source === nodeId)
      .some(e => hasCycle(e.target));
  }
  return !hasCycle(connection.target);
}, [edges]);
```

### Pattern 6: Node Config Updates via updateNode

**What:** Node config panels update node data using the updateNode function from useReactFlow().

```tsx
// Inside NodeConfigPanel (inside ReactFlowProvider scope)
const { updateNode } = useReactFlow();

function handleAgentChange(agentId: string) {
  updateNode(selectedNodeId, { data: { ...selectedNode.data, agentId } });
}
```

### Pattern 7: Undo/Redo Snapshot History

**What:** Maintain arrays of past/future flow states. Capture snapshots on user actions.

```tsx
const [past, setPast] = useState<ReactFlowJsonObject[]>([]);
const [future, setFuture] = useState<ReactFlowJsonObject[]>([]);

const takeSnapshot = useCallback(() => {
  const snapshot = rfInstance.toObject();
  setPast(prev => [...prev.slice(-30), snapshot]); // keep last 30
  setFuture([]); // clear redo on new action
}, [rfInstance]);

const undo = useCallback(() => {
  if (past.length === 0) return;
  const prev = past[past.length - 1];
  setFuture(f => [rfInstance.toObject(), ...f]);
  setPast(p => p.slice(0, -1));
  rfInstance.setNodes(prev.nodes);
  rfInstance.setEdges(prev.edges);
}, [past, future, rfInstance]);
```

Attach to keydown: Ctrl+Z triggers undo, Ctrl+Shift+Z triggers redo.

### Pattern 8: Dagre Auto-Layout

**What:** Reposition nodes using dagre with LR direction and explicit node dimensions.

```tsx
import dagre from '@dagrejs/dagre';

// Declared dimensions per node type — dagre needs these before DOM renders
const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  start:      { width: 120, height: 60 },
  agent:      { width: 240, height: 130 },
  project:    { width: 240, height: 110 },
  connector:  { width: 220, height: 110 },
  checkpoint: { width: 260, height: 150 },
  merge:      { width: 200, height: 90 },
  condition:  { width: 220, height: 110 },
  output:     { width: 160, height: 70 },
};

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 200, nodesep: 100 }); // EDIT-10: 200px H, 100px V

  nodes.forEach(n => {
    const dims = NODE_DIMENSIONS[n.type || 'agent'] ?? { width: 240, height: 120 };
    g.setNode(n.id, dims);
  });
  edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return nodes.map(n => {
    const pos = g.node(n.id);
    const dims = NODE_DIMENSIONS[n.type || 'agent'] ?? { width: 240, height: 120 };
    return { ...n, position: { x: pos.x - dims.width / 2, y: pos.y - dims.height / 2 } };
  });
}
```

After calling setNodes(applyDagreLayout(...)), call fitView({ padding: 0.1 }).

### Pattern 9: Node Palette Drag-and-Drop

**What:** Drag from the 80px left palette onto the canvas to create new nodes.

```tsx
// In palette item:
function onDragStart(event: DragEvent, nodeType: string) {
  event.dataTransfer.setData('application/reactflow', nodeType);
  event.dataTransfer.effectAllowed = 'move';
}

// In canvas wrapper div:
function onDrop(event: DragEvent) {
  event.preventDefault();
  const nodeType = event.dataTransfer.getData('application/reactflow');
  if (!nodeType) return;

  const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
  const newNode: Node = {
    id: generateId(),
    type: nodeType,
    position,
    data: getDefaultNodeData(nodeType), // per-type defaults
  };
  setNodes(prev => [...prev, newNode]);
  takeSnapshot(); // capture for undo
}

function onDragOver(event: DragEvent) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}
```

### Anti-Patterns to Avoid

- **nodeTypes inside component body:** Causes every node to remount on every render. Console warning: "It looks like you have created a new nodeTypes object." Always module-level.
- **Auto-saving during execution:** Strip executionStatus/executionOutput from node data before PATCH to avoid polluting flow_data with execution state.
- **One file per panel sub-feature:** The node config panel should be ONE component with conditional rendering per node type, not separate files per type.
- **Using crypto.randomUUID() for node IDs:** Requires HTTPS; app runs HTTP. Always use generateId() from lib/utils.ts.
- **Zustand installation:** @xyflow/react ships its own Zustand store. Do not install Zustand as a project dependency.

---

## Node Type Specifications

### Handle Requirements (Critical for correct edge routing)

| Node Type | Target Handles | Source Handles | Notes |
|-----------|---------------|----------------|-------|
| START | 0 | 1 (default) | No incoming edges allowed |
| AGENT | 1 (default) | 1 (default) | Standard through-node |
| PROJECT | 1 (default) | 1 (default) | Standard through-node |
| CONNECTOR | 1 (default) | 1 (default) | Standard through-node |
| CHECKPOINT | 1 (default) | 2 (id="approved", id="rejected") | Named source handles |
| MERGE | up to 5 (id="target-1".."target-5") | 1 (default) | Named target handles |
| CONDITION | 1 (default) | 2 (id="yes", id="no") | Named source handles |
| OUTPUT | 1 (default) | 0 | Terminal node |

### Named Handle Pattern (for CHECKPOINT, CONDITION, MERGE)

```tsx
// CheckpointNode — two named output handles
import { Handle, Position, NodeProps } from '@xyflow/react';

export function CheckpointNode({ data, selected }: NodeProps) {
  return (
    <div className={`...`}>
      <Handle type="target" position={Position.Left} />

      {/* Node content */}

      <Handle type="source" position={Position.Right} id="approved"
        style={{ top: '35%' }} />
      <Handle type="source" position={Position.Right} id="rejected"
        style={{ top: '65%' }} />
      <div style={{ position: 'absolute', right: '-70px', top: '30%', fontSize: '10px', color: '#86efac' }}>
        Aprobado
      </div>
      <div style={{ position: 'absolute', right: '-70px', top: '60%', fontSize: '10px', color: '#fca5a5' }}>
        Rechazado
      </div>
    </div>
  );
}
```

### Default Node Data per Type

```typescript
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
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Canvas panning/zooming | Custom mouse event handler | ReactFlow built-in | Edge cases with touch, trackpad, wheel — 100+ lines of complex math |
| Node drag positioning | Custom drag-drop | ReactFlow onNodesChange | React Flow handles pointer events, snapping, viewport transforms |
| Edge path routing | Custom SVG paths | ReactFlow BezierEdge (default) | Handles all handle positions, routing around nodes |
| MiniMap | Custom overview | ReactFlow MiniMap component | Already renders interactive thumbnail |
| Zoom controls | Custom +/- buttons | ReactFlow Controls component | Includes fit-view, lock zoom, built-in accessibility |
| Connection validation type check | Manual type string compare | React Flow handle type="source"/"target" | React Flow blocks source-to-source connections natively |
| Node selection | Manual click tracking | ReactFlow multi-select via selectable prop | Shift+click, box-select built in |

---

## Common Pitfalls

### Pitfall 1: SSR Crash — `ReferenceError: window is not defined`

**What goes wrong:** Importing @xyflow/react in a Server Component crashes the Next.js build.

**Why it happens:** React Flow reads `window` and `ResizeObserver` at import time; these don't exist in Node.js SSR.

**How to avoid:** `"use client"` on canvas-editor.tsx PLUS `dynamic({ ssr: false })` in the page.tsx that imports it. Both are required.

**Warning signs:** Build fails with "ReferenceError: window is not defined" or hydration error on /canvas/[id] route.

### Pitfall 2: Blank Canvas — No Explicit Container Height

**What goes wrong:** Canvas renders as 0px height, nothing visible, no console errors.

**How to avoid:** Direct parent of `<ReactFlow>` must have `className="w-full h-[calc(100vh-64px)]"`. Verify no ancestor div collapses via flex-1 without its own fixed height.

**Warning signs:** Inspect element shows `<div class="react-flow" style="width:0; height:0">`.

### Pitfall 3: Invisible Edges — CSS Import Order

**What goes wrong:** Nodes render correctly but no edges visible between them. SVG paths have `stroke: none`.

**How to avoid:** Import `@xyflow/react/dist/style.css` AFTER Tailwind directives in globals.css:

```css
/* globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* After Tailwind — prevents preflight from overriding SVG edge styles */
@import '@xyflow/react/dist/style.css';
```

**Warning signs:** Edges disappear or render as invisible lines; inspect shows SVG path with no stroke.

### Pitfall 4: nodeTypes Inside Component Body — Node Remount Storm

**What goes wrong:** Every state change (dragging a node, typing in a form) causes all nodes to unmount and remount. Visible as node flicker.

**How to avoid:** Define NODE_TYPES constant at module scope, outside any component function.

**Warning signs:** React Flow console warning "It looks like you have created a new nodeTypes object." Node inputs lose focus immediately after typing.

### Pitfall 5: useReactFlow() Outside ReactFlowProvider — Runtime Crash

**What goes wrong:** Toolbar or sidebar components crash with "Seems like you have not used zustand provider as an ancestor."

**How to avoid:** Wrap the ENTIRE page shell (toolbar + palette sidebar + canvas + node config panel) inside `<ReactFlowProvider>`. The `<ReactFlow>` component alone is not enough — any sibling component that calls useReactFlow() also needs the provider.

### Pitfall 6: Missing named handles on CHECKPOINT/CONDITION nodes

**What goes wrong:** Edges connecting from CHECKPOINT "Aprobado" output cannot be identified by the executor — both outputs appear as the same handle, so execution always follows the same path regardless of approval status.

**How to avoid:** Each named handle MUST have an explicit `id` prop. Edges created by connecting to named handles automatically store `sourceHandle: "approved"` or `sourceHandle: "rejected"` on the edge object. The executor reads `edge.sourceHandle` to determine which branch to follow.

### Pitfall 7: Auto-save Debounce Recreated on Render

**What goes wrong:** Save fires after every single node drag instead of 3 seconds after the last change.

**How to avoid:** Use `useRef` timer, not debounce inside `useCallback` with node/edge deps. The `useCallback` must have empty dependency array so the timer reference is stable.

### Pitfall 8: Dagre Node Overlap with Variable-Height Nodes

**What goes wrong:** After auto-layout, AGENT nodes with long instructions or CHECKPOINT nodes with textarea overlap adjacent nodes.

**How to avoid:** Use `NODE_DIMENSIONS` constant with explicit per-type width/height. Add extra padding (30-40px) to declared heights since content renders after layout is calculated.

---

## CSS Configuration

### globals.css Addition

The `@import '@xyflow/react/dist/style.css'` must be added at the end of the globals.css Tailwind directives section. Current globals.css starts with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Add immediately after:
```css
@import '@xyflow/react/dist/style.css';
```

### React Flow CSS Variable Overrides

Override React Flow's default colors to match the project's zinc-950 dark theme. Add to globals.css or canvas-editor.tsx:

```css
.react-flow {
  --xy-background-color: theme(colors.zinc.950);
  --xy-node-background-color: theme(colors.zinc.900);
  --xy-edge-stroke: theme(colors.violet.500);
  --xy-edge-stroke-width: 2;
  --xy-attribution-background-color: transparent;
}
```

---

## Code Examples

### Canvas Editor Shell

```tsx
// Source: React Flow official SSR docs + project patterns
"use client"
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant,
         MiniMap, Controls, useNodesState, useEdgesState, useReactFlow,
         addEdge, type Connection, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

// MUST be module-level
const NODE_TYPES = { start: StartNode, agent: AgentNode, /* ... */ };

export function CanvasEditor({ canvasId }: { canvasId: string }) {
  return (
    <ReactFlowProvider>
      <CanvasShell canvasId={canvasId} />
    </ReactFlowProvider>
  );
}

function CanvasShell({ canvasId }: { canvasId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView, toObject, screenToFlowPosition } = useReactFlow();

  // Load canvas on mount
  useEffect(() => {
    fetch(`/api/canvas/${canvasId}`)
      .then(r => r.json())
      .then(canvas => {
        if (canvas.flow_data) {
          const fd = JSON.parse(canvas.flow_data);
          setNodes(fd.nodes || []);
          setEdges(fd.edges || []);
          setTimeout(() => fitView({ padding: 0.1 }), 50);
        }
      });
  }, [canvasId]);

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      <CanvasToolbar canvasId={canvasId} />
      <div className="flex flex-1 overflow-hidden">
        <NodePalette />
        <div className="flex-1 h-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={(conn) => setEdges(e => addEdge(conn, e))}
            nodeTypes={NODE_TYPES}
            snapToGrid
            snapGrid={[20, 20]}
            isValidConnection={isValidConnection}
            deleteKeyCode={['Delete', 'Backspace']}
            selectionOnDrag
            multiSelectionKeyCode="Shift"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#3f3f46" />
            <MiniMap className="!bg-zinc-900" nodeColor={getMiniMapNodeColor} />
            <Controls className="!bg-zinc-900 !border-zinc-700" />
          </ReactFlow>
        </div>
        <NodeConfigPanel />
      </div>
    </div>
  );
}
```

### Minimal Custom Node Example (START node)

```tsx
// Source: React Flow custom node docs
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Play } from 'lucide-react'

export function StartNode({ data, selected }: NodeProps) {
  return (
    <div className={`
      w-[100px] h-[100px] rounded-full
      bg-emerald-950 border-2
      ${selected ? 'border-emerald-400' : 'border-emerald-600'}
      flex flex-col items-center justify-center gap-1
      shadow-lg
    `}>
      <Play className="w-6 h-6 text-emerald-400 fill-emerald-400" />
      <span className="text-xs text-emerald-300 font-medium">Inicio</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
```

### SVG Thumbnail Generation (from JSON, no DOM capture)

```typescript
// Source: project pattern (avoid fitView/capture complexity)
function generateThumbnailSVG(nodes: Node[]): string {
  if (nodes.length === 0) return '';

  const padding = 20;
  const xs = nodes.map(n => n.position.x);
  const ys = nodes.map(n => n.position.y);
  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  const maxX = Math.max(...xs) + 80 + padding; // 80 = approx node width
  const maxY = Math.max(...ys) + 40 + padding; // 40 = approx node height

  const scaleX = 320 / (maxX - minX || 1);
  const scaleY = 120 / (maxY - minY || 1);
  const scale = Math.min(scaleX, scaleY, 1);

  const NODE_COLORS: Record<string, string> = {
    start: '#059669', agent: '#7c3aed', project: '#2563eb',
    connector: '#d97706', checkpoint: '#d97706', merge: '#0891b2',
    condition: '#ca8a04', output: '#059669',
  };

  const rects = nodes.map(n => {
    const x = (n.position.x - minX) * scale + padding;
    const y = (n.position.y - minY) * scale + padding;
    const color = NODE_COLORS[n.type || 'agent'] || '#6b7280';
    return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${(60 * scale).toFixed(0)}" height="${(28 * scale).toFixed(0)}" rx="4" fill="${color}" opacity="0.7"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120" viewBox="0 0 320 120"><rect width="320" height="120" fill="#09090b"/>${rects}</svg>`;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `reactflow` npm package | `@xyflow/react` | v12 (2024) | Package rename; old package deprecated |
| Separate `ReactFlowProvider` import from `reactflow` | Same import from `@xyflow/react` | v12 | No change in API, just package name |
| `getNode()`, `getEdge()` imperative helpers | `useNodes()`, `useEdges()` hooks + `updateNode()` | v11-12 | Prefer hook-based access; imperative API still exists |
| `onConnect` receives `Connection` | Same — no change | — | Connection has source/target/sourceHandle/targetHandle |
| `reactflow/dist/base.css` + `reactflow/dist/style.css` | `@xyflow/react/dist/style.css` | v12 | Single stylesheet import |

**Deprecated/outdated:**
- `reactflow` package: deprecated, redirects to @xyflow/react. Do NOT install.
- `dagre` package: unmaintained since 2018. Use `@dagrejs/dagre` instead.
- `@types/dagrejs__dagre`: wrong types package. Use `@types/dagre` instead.

---

## Open Questions

1. **Inline name editing in toolbar (EDIT-02)**
   - What we know: Toolbar needs editable canvas name. Standard pattern is contentEditable div or an input that looks like text.
   - What's unclear: Whether to use blur-to-save or Enter-to-save pattern.
   - Recommendation: Use input with transparent bg that looks like text; onBlur triggers PATCH /api/canvas/[id] with new name.

2. **Merge node: how many target handles to show (NODE-06)**
   - What we know: Spec says "multiple inputs (up to 5)". Static 5 handles or dynamic based on incoming edges?
   - What's unclear: Whether unused handles (no edge) should be hidden or always shown.
   - Recommendation: Show 3 target handles by default with a "+/-" button to add/remove up to 5. Simpler than dynamic detection.

3. **Node config panel collapse state (EDIT-06)**
   - What we know: Panel should be collapsible. Appears when a node is selected.
   - What's unclear: Auto-open on node select or stay collapsed until manually opened?
   - Recommendation: Auto-open when a node is selected (selectedNodes.length > 0), auto-close when selection is cleared.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — manual verification via browser + npm run build |
| Config file | None |
| Quick run command | `cd ~/docflow/app && npm run build` (TypeScript compile check) |
| Full suite command | `cd ~/docflow/app && npm run build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EDIT-01 | Canvas editor page loads without SSR error | build check | `npm run build` | ❌ Wave 0 |
| EDIT-04 | Background dots + snap-to-grid | visual | manual browser | N/A — manual only |
| EDIT-05 | Cycle prevention blocks edge creation | visual | manual browser | N/A — manual only |
| EDIT-08 | Auto-save fires after 3s of inactivity | visual | manual network tab | N/A — manual only |
| EDIT-09 | Ctrl+Z undoes last node add | visual | manual browser | N/A — manual only |
| EDIT-10 | Auto-layout repositions nodes (no overlap) | visual | manual browser | N/A — manual only |
| NODE-01..08 | All 8 node types render with correct handles | visual | manual browser | N/A — manual only |

### Sampling Rate
- **Per task commit:** `cd ~/docflow/app && npm run build` — TypeScript and Next.js compile check
- **Per wave merge:** Full build + manual browser verification of canvas page
- **Phase gate:** All 8 node types functional in browser + auto-save working before phase complete

### Wave 0 Gaps
- [ ] Install @xyflow/react, @dagrejs/dagre, html-to-image@1.11.11, @types/dagre — no test files needed, npm install is the action
- [ ] Add `@import '@xyflow/react/dist/style.css'` to globals.css

---

## Sources

### Primary (HIGH confidence)

- React Flow official docs: https://reactflow.dev/learn — custom nodes, handles, props API
- React Flow SSR/SSG config: https://reactflow.dev/learn/advanced-use/ssr-ssg-configuration
- React Flow troubleshooting: https://reactflow.dev/learn/troubleshooting/common-errors
- React Flow dagre layout example: https://reactflow.dev/examples/layout/dagre
- @xyflow/react on npm: https://www.npmjs.com/package/@xyflow/react (v12.10.1, 2026-02-19)
- html-to-image 1.11.11 pinning: React Flow download-image example docs
- Existing codebase: db.ts (canvas tables verified), /api/canvas/[id]/route.ts (PATCH endpoint), lib/utils.ts (generateId), globals.css (Tailwind order), canvas-card.tsx (Phase 23 output)
- PROJECT.md decisions: @xyflow/react v12, @dagrejs/dagre, html-to-image@1.11.11 pinned, generateId() not crypto.randomUUID()

### Secondary (MEDIUM confidence)

- xyflow GitHub issue #4983: nodeTypes reference equality and remount behavior
- xyflow GitHub issue #4800: dagre edge/node overlap
- React Flow state management docs: useNodesState + useEdgesState + updateNode pattern

### Tertiary (LOW confidence)

- undo/redo snapshot pattern: community examples; official React Flow undo/redo not documented as built-in feature

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — packages verified in npm, decisions locked in STATE.md
- Architecture: HIGH — all 5 critical pitfalls documented with prevention code; React Flow API shapes verified against official docs
- Node type specifications: HIGH — handle requirements derived directly from requirements spec; named handles are standard React Flow pattern
- Pitfalls: HIGH — all from official React Flow troubleshooting docs or verified STATE.md project decisions
- Undo/redo implementation: MEDIUM — snapshot approach verified as working pattern, not official React Flow built-in

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (React Flow releases ~monthly; core API stable)
