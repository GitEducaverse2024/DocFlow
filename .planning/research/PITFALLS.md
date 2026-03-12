# Domain Pitfalls: Visual Canvas Workflow Editor (React Flow + Next.js 14)

**Domain:** Visual node-based canvas editor added to existing Next.js 14 App Router application
**Project:** DocFlow / DoCatFlow v5.0 Canvas
**Researched:** 2026-03-12
**Confidence:** HIGH (React Flow official docs + xyflow GitHub issues + verified patterns)

---

## Critical Pitfalls

Mistakes that cause build failures, runtime crashes, or require full rewrites.

---

### Pitfall 1: React Flow Imported in a Server Component (SSR Crash)

**What goes wrong:** React Flow reads browser APIs (`window`, `ResizeObserver`, DOM measurements) at import time. Importing it in a Server Component — or any component that has not been marked `"use client"` — throws `ReferenceError: window is not defined` during Next.js build or at runtime during SSR.

**Why it happens:** Next.js 14 App Router renders every component on the server by default. React Flow is 100% client-only. Without an explicit boundary, Next.js attempts to server-render it.

**Consequences:** Build fails or produces hydration errors that break the entire `/canvas` route.

**Prevention:**
```tsx
// app/src/app/canvas/[id]/page.tsx  — Server Component wrapper is fine
// app/src/components/canvas/canvas-editor.tsx — MUST start with:
"use client";
import { ReactFlow, ... } from "@xyflow/react";
```
If the parent page is a Server Component, use `next/dynamic` with `ssr: false` as an additional safety net for the editor component:
```tsx
// In the page (Server Component):
import dynamic from "next/dynamic";
const CanvasEditor = dynamic(
  () => import("@/components/canvas/canvas-editor"),
  { ssr: false, loading: () => <CanvasSkeleton /> }
);
```

**Detection:** `ReferenceError: window is not defined` in Next.js build output or server logs.

**Phase:** Canvas data model and editor setup phase (first phase that introduces React Flow).

---

### Pitfall 2: `nodeTypes` / `edgeTypes` Defined Inside the Component Body

**What goes wrong:** Declaring `nodeTypes` as an object literal inside the React component renders a new object reference on every render. React Flow detects the changed reference and re-creates all wrapped node components from scratch, resetting internal state and producing a flash of remount.

**Why it happens:** JavaScript object identity — `{} !== {}` on every render. React Flow's internals use reference equality checks on `nodeTypes`.

**Consequences:** Every state change (dragging a node, typing in a sidebar field) causes every node to unmount and remount. At 20+ nodes this is visibly jarring. Can also cause infinite render loops if `onNodesChange` triggers another render.

**Prevention:** Define `nodeTypes` and `edgeTypes` as module-level constants, outside any component:
```tsx
// OUTSIDE the component — never inside
const NODE_TYPES = {
  start: StartNode,
  agent: AgentNode,
  project: ProjectNode,
  connector: ConnectorNode,
  checkpoint: CheckpointNode,
  merge: MergeNode,
  condition: ConditionNode,
  output: OutputNode,
};

export function CanvasEditor() {
  return <ReactFlow nodeTypes={NODE_TYPES} ... />;
}
```

**Detection:** React Flow prints a console warning: "It looks like you have created a new `nodeTypes` or `edgeTypes` object." Also visible as node flicker on any interaction.

**Phase:** Canvas editor component phase (any phase that introduces custom node types).

---

### Pitfall 3: Accessing React Flow State Outside `ReactFlowProvider` Context

**What goes wrong:** Hooks like `useReactFlow()`, `useNodes()`, `useEdges()`, or `useViewport()` throw: "Seems like you have not used zustand provider as an ancestor." This appears when the hook is called in a component that is a sibling or ancestor of `<ReactFlow />`, not a descendant.

**Why it happens:** React Flow manages its state in a Zustand store bound to the React component tree via context. Anything outside that subtree has no access to the store.

**Consequences:** Runtime crash. Common when trying to implement a toolbar component that lives outside the `<ReactFlow>` wrapper but needs to call `fitView()` or `getNodes()`.

**Prevention:** Wrap the entire canvas page (including toolbar, sidebars, and the flow canvas) with `<ReactFlowProvider>`:
```tsx
// canvas-page-shell.tsx
"use client";
import { ReactFlowProvider } from "@xyflow/react";

export function CanvasPageShell({ children }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}
```
Then toolbar components can freely use `useReactFlow()` hooks.

**Detection:** "Seems like you have not used zustand provider as an ancestor" error in browser console.

**Phase:** Canvas editor phase / any phase that adds toolbar or sidebar panels that interact with the flow.

---

### Pitfall 4: React Flow Container Has No Explicit Height

**What goes wrong:** React Flow measures the dimensions of its parent DOM element to calculate the viewport. If the parent container has no explicit height (e.g., `height: auto` or no height at all), React Flow cannot render — the canvas appears empty or renders as a zero-height element.

**Why it happens:** React Flow uses `ResizeObserver` on the parent div to determine canvas bounds. In Next.js App Router layouts where `<main>` or wrapper divs default to `height: auto`, this measurement returns 0.

**Consequences:** Canvas renders blank. No error message. Very confusing to debug.

**Prevention:** Always give the direct parent of `<ReactFlow>` a fixed calculated height. The project constraint already captures this:
```tsx
// h-[calc(100vh-64px)] accounts for the 64px sidebar/header
<div className="w-full h-[calc(100vh-64px)]">
  <ReactFlow ... />
</div>
```
Verify this in the Next.js layout hierarchy — if the layout adds another wrapper div with `flex-1` but no explicit height, the chain breaks.

**Detection:** Canvas renders with no nodes visible, no console errors. Inspect element shows `<div class="react-flow" style="width: 0; height: 0">`.

**Phase:** Canvas editor layout phase. Must be verified before any other canvas work.

---

### Pitfall 5: Tailwind CSS Preflight Overrides React Flow's SVG Edge Styles

**What goes wrong:** Tailwind's `preflight` (CSS reset) sets `display: block` on SVG elements and resets inherited SVG properties. React Flow's edges are SVG `<path>` elements. When the global `globals.css` imports Tailwind before React Flow's stylesheet, the CSS reset can make edges invisible or completely unstyled.

**Why it happens:** DocFlow already uses Tailwind. React Flow's base styles define SVG stroke colors and widths that conflict with Tailwind's `*, *::before, *::after { box-sizing: border-box }` and SVG resets.

**Consequences:** Edges between nodes render as invisible lines. Connection handles may not appear. The canvas looks broken even when nodes work correctly.

**Prevention:** Import React Flow's stylesheet after Tailwind in `globals.css`:
```css
/* globals.css — ORDER MATTERS */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* React Flow styles must come AFTER Tailwind to avoid preflight overrides */
@import "@xyflow/react/dist/style.css";
```
Alternatively, override the specific conflicting SVG properties via `.react-flow__edge` selectors.

**Detection:** Nodes render but no edges are visible between them. Inspect element shows `<path>` elements with `stroke: none` or `display: block` applied by Tailwind.

**Phase:** Canvas editor setup phase (CSS configuration step).

---

## Moderate Pitfalls

Issues that cause incorrect behavior or degraded UX but do not crash the app.

---

### Pitfall 6: Auto-Save Debounce Recreated on Every Render (Debounce Does Not Work)

**What goes wrong:** Implementing auto-save as `useCallback(() => debounce(saveFn, 3000), [nodes, edges])` means every time `nodes` or `edges` changes, a new debounced function is created. The debounce timer resets on every node movement, so rapid node dragging triggers the save immediately after dragging stops regardless of the delay.

**Why it happens:** Debounce needs a stable function reference to accumulate calls. `useCallback` with changing dependencies destroys the accumulated state.

**Prevention:** Create the debounced save once with a ref, or use a `useRef` to hold the timer:
```tsx
const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

const scheduleAutoSave = useCallback((flow: ReactFlowJsonObject) => {
  if (saveTimer.current) clearTimeout(saveTimer.current);
  saveTimer.current = setTimeout(() => {
    saveCanvas(flow); // API call
  }, 3000);
}, []); // empty deps — stable reference

// Also clear on unmount
useEffect(() => () => {
  if (saveTimer.current) clearTimeout(saveTimer.current);
}, []);
```
Project constraints already specify 3s debounce with `useCallback + setTimeout`. Follow this pattern exactly.

**Detection:** Network tab shows API calls firing after every drag-end event instead of waiting 3 seconds.

**Phase:** Canvas CRUD and auto-save phase.

---

### Pitfall 7: Topological Sort Fails Silently With Disconnected Nodes

**What goes wrong:** A standard Kahn's algorithm or DFS-based topological sort only visits nodes reachable from the sort's starting point. If the canvas contains isolated nodes (nodes with no incoming or outgoing edges), they are omitted from the execution order. The execution engine runs without error but silently skips valid nodes.

**Why it happens:** DAG execution only processes the connected subgraph. Nodes the user placed but didn't connect yet are invisible to the sort.

**Consequences:** Users drag a PROJECT node onto the canvas, forget to connect it, and then are confused why it never ran.

**Prevention:** Before executing, validate that all non-START and non-OUTPUT nodes have at least one incoming edge. The execution API should return a warning/error listing unreachable nodes rather than silently skipping them:
```typescript
// Pre-execution validation
const unreachable = nodes.filter(n =>
  n.type !== 'start' && n.type !== 'output' &&
  !edges.some(e => e.target === n.id)
);
if (unreachable.length > 0) {
  return { error: `Nodos sin conexión de entrada: ${unreachable.map(n => n.data.label).join(', ')}` };
}
```

**Detection:** Execution completes successfully but some nodes show no "completed" status in the UI. Users report "some nodes did not run."

**Phase:** Canvas DAG execution phase.

---

### Pitfall 8: Cycle Detection Not Enforced at Edge-Creation Time

**What goes wrong:** The project spec explicitly states no loops allowed (DAG only). If cycle detection is only performed at execution time, users can draw cycles on the canvas freely. They get a confusing runtime error rather than immediate feedback when they try to connect a node in a way that creates a cycle.

**Why it happens:** React Flow allows any connection by default. Without an `isValidConnection` callback, the user can connect any handle to any handle.

**Prevention:** Use React Flow's `isValidConnection` prop to validate connections in real time using a DFS cycle check:
```tsx
const isValidConnection = useCallback((connection: Connection) => {
  // Check if adding this edge would create a cycle
  const tempEdges = [...edges, connection as Edge];
  return !hasCycle(nodes, tempEdges); // DFS implementation
}, [nodes, edges]);

<ReactFlow isValidConnection={isValidConnection} ... />
```

**Detection:** Execution engine enters an infinite loop or hangs. Topological sort returns an empty array (cycle detected by Kahn's — no nodes with in-degree 0 after the first pass).

**Phase:** Canvas editor interaction phase (when edge connections are implemented).

---

### Pitfall 9: Dagre Auto-Layout Does Not Account for Custom Node Dimensions

**What goes wrong:** Dagre needs explicit node width and height to calculate non-overlapping positions. By default, it uses minimal dimensions. If custom nodes have variable heights (e.g., AGENT nodes show a list of skills, CHECKPOINT nodes show a textarea), dagre will overlap them.

**Why it happens:** Dagre layout is computed before React has measured the DOM — it works with declared dimensions, not rendered dimensions.

**Prevention:** Pass explicit `width` and `height` to every node before running dagre, using the known minimum/maximum dimensions:
```typescript
const NODE_DIMENSIONS = {
  start: { width: 120, height: 60 },
  agent: { width: 240, height: 120 },
  project: { width: 240, height: 100 },
  connector: { width: 220, height: 100 },
  checkpoint: { width: 260, height: 140 },
  merge: { width: 180, height: 80 },
  condition: { width: 220, height: 100 },
  output: { width: 160, height: 60 },
};
```
For dynamic content, add padding to the declared height. After dagre calculates positions, call `fitView()` to ensure all nodes are visible.

**Detection:** After clicking "Auto-layout," nodes overlap. CHECKPOINT nodes with long descriptions cover adjacent nodes.

**Phase:** Canvas layout (dagre auto-layout feature phase).

---

### Pitfall 10: SVG Thumbnail Generated From Invisible or Off-Viewport Nodes

**What goes wrong:** When generating an SVG thumbnail for the canvas list cards, if the user has panned far from the origin, `html-to-image` captures only what is currently visible in the browser viewport (not the full graph). Thumbnails show partial or empty canvases.

**Why it happens:** `html-to-image` operates on the DOM element's visible portion. React Flow virtualizes (hides) nodes that are outside the viewport for performance.

**Prevention:** Use React Flow's `fitView()` to reset the viewport to show all nodes before capturing, capture the thumbnail, then restore the previous viewport:
```typescript
const generateThumbnail = async () => {
  const prevViewport = getViewport();
  await fitView({ padding: 0.1, duration: 0 });
  // short delay for React to apply fitView transform
  await new Promise(r => setTimeout(r, 50));
  const svg = await toSvg(flowElement);
  setViewport(prevViewport, { duration: 0 });
  return svg;
};
```
For an even simpler approach, generate SVG thumbnails from the node positions JSON (no DOM capture needed) — draw simple rectangles at scaled coordinates. This is reliable and works server-side.

**Detection:** Canvas list shows blank thumbnail images for canvases where the user panned before saving.

**Phase:** Canvas CRUD + thumbnails phase.

---

### Pitfall 11: Canvas JSON Grows Unbounded in SQLite TEXT Column

**What goes wrong:** Every node's `data` field stores rich metadata (agent config, project settings, connector details). With 8 node types and 20+ nodes, the serialized JSON from `toObject()` can reach hundreds of kilobytes. Storing in a TEXT column without size limits works, but loading all canvases for the list page (to generate thumbnails, show metadata) causes slow queries and memory pressure.

**Why it happens:** `toObject()` returns the full React Flow state including viewport, all node positions, all edge data, and all `data` objects. Over time this grows.

**Prevention:**
- Store the full `flow_json` (from `toObject()`) in one TEXT column for full restore.
- Store `thumbnail_svg` separately in a nullable TEXT column (only updated on explicit save / auto-save).
- For the list page API, SELECT only `id, name, mode, status, thumbnail_svg, updated_at` — never SELECT `flow_json` for list queries.
- Periodically clean `thumbnail_svg` for stale/deleted canvases.

**Detection:** Canvas list page becomes slow as the number of canvases grows. `SELECT *` from the canvases table returns megabytes of JSON.

**Phase:** Canvas data model phase (schema design).

---

### Pitfall 12: Execution State Stored Only In-Memory (Lost on Server Restart)

**What goes wrong:** The existing task execution engine uses in-memory flags (`runningTasks`, `cancelFlags`) in `task-engine.ts`. If the same pattern is adopted for canvas execution, a server restart mid-execution silently drops all running state. The canvas's `execution_status` in SQLite would remain as `running` forever with no way to resume.

**Why it happens:** Next.js API routes run in the same Node.js process. In-process state is ephemeral. On Docker restart or deploy, it evaporates.

**Prevention:**
- Persist execution state in SQLite: store `current_node_id`, `node_statuses` (JSON), `started_at`, `error` per execution.
- On API startup, check for any canvases in `running` state and mark them as `failed` (interrupted) so users know to re-run.
- Keep in-memory cancel flags for the active session, but always write node status transitions to the DB.

**Detection:** Server restart leaves canvases permanently stuck in `running` status. Users cannot re-execute a canvas that "says it's running."

**Phase:** Canvas execution engine phase.

---

## Minor Pitfalls

Issues that create friction but are easily fixed once noticed.

---

### Pitfall 13: `useReactFlow()` Called Before React Flow Is Mounted

**What goes wrong:** Calling `reactFlowInstance.fitView()` or `reactFlowInstance.getNodes()` in a `useEffect` without checking that the instance is ready returns stale data or throws. This is common when auto-fitting the viewport on initial canvas load.

**Prevention:** Check `reactFlowInstance` is non-null, or use React Flow's `onInit` callback to know when the instance is ready:
```tsx
<ReactFlow onInit={(instance) => {
  setFlowInstance(instance);
  instance.fitView({ padding: 0.1 });
}} />
```

---

### Pitfall 14: `updateNodeInternals()` Not Called After Programmatic Node Mutations

**What goes wrong:** When node data is updated programmatically (e.g., after selecting an agent from a dropdown inside the node), edge handles may render in incorrect positions because React Flow's internal layout is out of sync.

**Prevention:** Call `updateNodeInternals(nodeId)` (from `useUpdateNodeInternals()`) after any programmatic change that affects node layout or handle positions.

---

### Pitfall 15: `dynamic = 'force-dynamic'` Missing on Canvas API Routes

**What goes wrong:** Canvas API routes read `LITELLM_URL`, `SQLITE_PATH`, or other env vars. Without `export const dynamic = 'force-dynamic'`, Next.js prerender these routes as static during build. The routes work in dev but return stale/empty data in production Docker builds.

**Prevention:** Every canvas API route file must include:
```typescript
export const dynamic = 'force-dynamic';
```
This is already a DocFlow-wide constraint (from PROJECT.md) — apply it to all new canvas routes without exception.

---

### Pitfall 16: Connecting a Handle to the Wrong Side of a Custom Node

**What goes wrong:** Custom nodes require manually defining `<Handle type="source" position={Position.Bottom} />` and `<Handle type="target" position={Position.Top} />`. Forgetting a handle on a custom node type means users cannot draw edges to/from that node even though the visual node appears correct. React Flow silently ignores connection attempts to nodes without handles.

**Prevention:** Each of the 8 node types must define exactly the correct handles per the DAG's execution model:
- START: source only (no target)
- OUTPUT: target only (no source)
- All others: target + source

---

### Pitfall 17: `generateId()` Not Used for Node IDs

**What goes wrong:** The project uses `generateId()` instead of `crypto.randomUUID()` because `crypto.randomUUID()` requires HTTPS and DocFlow runs over HTTP. If canvas node IDs are generated using `crypto.randomUUID()` (or `Math.random().toString()` which has collision risk), it will either throw in HTTP context or generate non-unique IDs.

**Prevention:** Use the existing `generateId()` helper (already established in project) for all node and edge IDs when creating new canvas nodes programmatically.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Canvas data model (SQLite schema) | Unbounded JSON in TEXT column; stale `running` status on restart | Separate `flow_json` and `thumbnail_svg` columns; add cleanup on startup |
| Canvas editor setup (React Flow install) | SSR crash, Tailwind CSS edge conflict, container height zero | `"use client"` + `dynamic({ ssr: false })`, import order in globals.css, explicit `h-[calc(100vh-64px)]` |
| Custom node components | `nodeTypes` inside component body, missing handles, `updateNodeInternals` | Define `NODE_TYPES` as module-level constant, verify all 8 types have correct handles |
| State management / ReactFlowProvider | `useReactFlow()` crashes outside context | Wrap entire canvas page shell with `<ReactFlowProvider>` |
| Auto-save implementation | Debounce recreated on every render | Use `useRef` timer pattern, not `useCallback` with node/edge deps |
| Dagre auto-layout | Node overlap with variable-height custom nodes | Pre-declare all node dimensions in `NODE_DIMENSIONS` constant |
| Edge connections (isValidConnection) | Users draw cycles; DAG assumption violated | Implement real-time cycle check via `isValidConnection` prop |
| DAG execution engine | Disconnected nodes silently skipped; in-memory state lost on restart | Pre-execution validation + persist `node_statuses` to SQLite |
| SVG thumbnail generation | Captures only viewport, not full graph | `fitView()` before capture, then restore viewport; or generate from JSON |
| Canvas API routes | Static prerender in Docker build | `export const dynamic = 'force-dynamic'` on every route |

---

## Sources

- [React Flow Common Errors](https://reactflow.dev/learn/troubleshooting/common-errors) — Official, HIGH confidence
- [React Flow Performance Guide](https://reactflow.dev/learn/advanced-use/performance) — Official, HIGH confidence
- [React Flow State Management](https://reactflow.dev/learn/advanced-use/state-management) — Official, HIGH confidence
- [React Flow Dagre Layout Example](https://reactflow.dev/examples/layout/dagre) — Official, HIGH confidence
- [React Flow Troubleshooting](https://reactflow.dev/learn/troubleshooting) — Official, HIGH confidence
- [ReactFlowJsonObject API](https://reactflow.dev/api-reference/types/react-flow-json-object) — Official, HIGH confidence
- [xyflow Issue #4983: Re-rendering non-changed nodes despite React.memo](https://github.com/xyflow/xyflow/issues/4983) — GitHub, HIGH confidence
- [xyflow Issue #4800: Edges overlap on nodes using Dagre](https://github.com/xyflow/xyflow/issues/4800) — GitHub, MEDIUM confidence
- [xyflow Discussion #2717: Thumbnails of 100% of canvas](https://github.com/wbkd/react-flow/discussions/2717) — GitHub, MEDIUM confidence
- [Next.js SSR false trap in App Router](https://medium.com/@joshisagarm3/the-ssr-false-trap-in-next-js-app-router-and-how-i-escaped-it-74816bc7a778) — MEDIUM confidence
- [The Ultimate Guide to Optimize React Flow Performance](https://medium.com/@lukasz.jazwa_32493/the-ultimate-guide-to-optimize-react-flow-project-performance-42f4297b2b7b) — MEDIUM confidence
- [Autosave with React Hooks (debounce patterns)](https://www.synthace.com/blog/autosave-with-react-hooks) — MEDIUM confidence
- [Building a Durable Execution Engine with SQLite](https://www.morling.dev/blog/building-durable-execution-engine-with-sqlite/) — MEDIUM confidence
