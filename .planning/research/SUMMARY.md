# Research Summary: DoCatFlow v5.0 — Canvas Visual Workflow Editor

**Synthesized:** 2026-03-12
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md
**Overall Confidence:** HIGH

---

## Executive Summary

DoCatFlow v5.0 adds a visual node-based canvas editor — a new vertical slice on top of an existing, mature Next.js 14 + SQLite application. The research unanimously converges on `@xyflow/react` (React Flow v12) as the only viable library choice: it is the industry standard for node-based UIs in React, actively maintained, and has first-class Next.js App Router documentation. The addition requires three new npm packages (`@xyflow/react`, `@dagrejs/dagre`, `html-to-image@1.11.11` pinned), two new SQLite tables, and a new execution engine (`canvas-executor.ts`) that mirrors the existing `task-executor.ts` pattern for DAG traversal. No new infrastructure is required.

The recommended architecture treats the canvas as a pure client-side React feature that delegates persistence to the existing SQLite database and execution to a fire-and-forget server function — exactly the pattern the task engine already uses. The key design principle is separation of concerns: `flow_data` (the canvas layout JSON) must never be mutated during execution; execution state lives in a dedicated `canvas_node_states` table and in React component state during the session. This discipline prevents the most common failure mode in canvas editors, where execution results corrupt the stored layout.

The primary risk vector is React Flow's SSR incompatibility with Next.js 14 App Router. Without the correct `"use client"` boundary and `next/dynamic({ ssr: false })` wrapper, the build fails with `ReferenceError: window is not defined`. This, combined with four other critical pitfalls (container height, CSS import order, `nodeTypes` inside component body, `ReactFlowProvider` scope), must be addressed in the first phase before any feature work proceeds. All five of these pitfalls have clear, documented preventions and are the kind that cause silent failures or produce confusing blank-screen symptoms rather than obvious errors.

---

## Key Findings

### From STACK.md: Technology Decisions

| Technology | Version | Decision |
|------------|---------|---------|
| `@xyflow/react` | `^12.10.1` | Only current package — `reactflow` is deprecated |
| `@dagrejs/dagre` | `^2.0.4` | Maintained fork of abandoned `dagre`; required by React Flow examples |
| `@types/dagre` | `^0.7.54` | Separate types package; `@dagrejs/dagre` does not bundle its own |
| `html-to-image` | `1.11.11` (pinned) | Version must be exact — later versions have a known export bug |

**Critical version constraint:** `html-to-image` must be installed as `html-to-image@1.11.11`, not `^1.11.11`. This is the only pinned version in the entire dependency set.

**No Zustand needed:** React Flow ships with its own Zustand-based store. `useNodesState`/`useEdgesState` are sufficient; adding Zustand as a project dependency is unnecessary and inconsistent with the existing codebase which uses React built-ins.

**No toposort library:** Kahn's algorithm is ~20 lines of standard code. A dedicated npm package adds a dependency with zero benefit given the existing `task-engine.ts` as a reference implementation.

### From FEATURES.md: Feature Scope

**Table Stakes (must have, v5.0):**
- Infinite canvas with pan/zoom, drag-drop from sidebar palette, handle-to-handle connections
- Delete/select/box-select nodes and edges with keyboard shortcuts
- Auto-layout via dagre (single "Tidy up" button)
- Fit-to-view, zoom controls panel, MiniMap, dot-grid background
- Node execution status indicators (running / success / error / waiting) + animated edges
- Undo/Redo (Ctrl+Z/Ctrl+Shift+Z), Copy/Paste (Ctrl+C/Ctrl+V)
- Canvas list page with thumbnails, full CRUD, 2-step creation wizard
- Auto-save (3s debounce), read-only mode during execution, empty state prompt

**Differentiators (adds real value):**
- 8 specialized node types mapping to DoCatFlow entities: START, AGENT, PROJECT, CONNECTOR, CHECKPOINT, MERGE, CONDITION, OUTPUT
- CHECKPOINT node with interactive pause/resume (reuses existing task-engine checkpoint logic)
- CONDITION node with true/false branch routing
- MERGE node for fan-in patterns
- 3 canvas modes (agent_flow, project_flow, mixed) with palette filtering
- 4 seed templates (Propuesta comercial, Doc técnica, Research+síntesis, Pipeline+conector)
- CatBot `create_canvas` tool integration
- Per-node execution log viewer
- Topological sort order badges as pre-run preview

**Deferred to v2+:**
- Parallel branch execution, loop detection at runtime, WebSocket updates
- Canvas collaboration, sticky notes, version history, n8n import, variable passing UI
- Scheduling/cron, marketplace/sharing

**Critical path:** DB schema → CRUD API → editor page → custom nodes → execution engine

### From ARCHITECTURE.md: Structure and Patterns

**New components (25 files total):**
- 3 pages: `/canvas`, `/canvas/new`, `/canvas/[id]`
- 14 React components: `canvas-editor.tsx`, 8 node type components, `canvas-toolbar.tsx`, `canvas-execution-panel.tsx`, `canvas-card.tsx`, `node-config-panel.tsx`
- 1 server service: `canvas-executor.ts`
- 7 API routes: CRUD + execute/status/cancel/approve/reject

**Modified files (minimal):** `db.ts` (2 new tables + seed templates), `sidebar.tsx` (1 nav item), `types.ts` (canvas types), `package.json`

**Key patterns to follow:**
1. **Separate execution state from canvas layout** — `flow_data` never mutates during execution; `canvas_node_states` is the execution store
2. **Fire-and-forget execution** — `executeCanvas()` called without `await`; client polls at 2s intervals (same as task execution view)
3. **Bracket notation for env vars** — `process['env']['VARIABLE']` throughout `canvas-executor.ts`
4. **`generateId()` for all IDs** — `crypto.randomUUID()` requires HTTPS; app runs on HTTP
5. **`dynamic = 'force-dynamic'`** on all canvas API routes that read env vars

**Data flow:** Context object pattern — `nodeOutputs: Record<nodeId, string>` passed forward through DAG execution. Single predecessor: pass that output. Multiple predecessors via MERGE: collect all. CONDITION: evaluate against predecessor output.

**Data model:**
- `canvases` table: stores `flow_data` (JSON TEXT), `thumbnail` (SVG string), `status`, metadata
- `canvas_node_states` table: one row per node per run, stores execution status + output + tokens

### From PITFALLS.md: Risk Inventory

**Critical pitfalls (build failures / full rewrites):**

| Pitfall | Prevention |
|---------|-----------|
| React Flow in Server Component → `ReferenceError: window` | `"use client"` + `next/dynamic({ ssr: false })` on canvas editor |
| `nodeTypes` defined inside component → node remount on every render | Define `NODE_TYPES` as module-level constant, never inline |
| `useReactFlow()` outside `ReactFlowProvider` context → runtime crash | Wrap entire canvas page shell (toolbar + sidebar + canvas) with `<ReactFlowProvider>` |
| Canvas container has no explicit height → blank canvas, no errors | `<div className="w-full h-[calc(100vh-64px)]">` as direct parent |
| Tailwind preflight overrides React Flow SVG edge styles → invisible edges | Import `@xyflow/react/dist/style.css` after Tailwind directives in `globals.css` |

**Moderate pitfalls (incorrect behavior):**

| Pitfall | Prevention |
|---------|-----------|
| Auto-save debounce recreated on each render → fires too often | `useRef` timer pattern with empty deps on `useCallback` |
| Disconnected nodes silently skipped in execution | Pre-execution validation: reject if non-START/OUTPUT nodes have no incoming edge |
| Cycles not blocked at draw time → runtime DAG violation | `isValidConnection` prop with DFS cycle check |
| Dagre node overlap with variable-height custom nodes | `NODE_DIMENSIONS` constant with declared dimensions per node type |
| SVG thumbnail captures only visible viewport | `fitView()` before capture, then restore viewport; or generate from JSON |
| Canvas JSON unbounded in SQLite TEXT column | SELECT only non-JSON columns for list page; separate `flow_json` and `thumbnail_svg` |
| In-memory execution state lost on server restart → stuck "running" status | Write all node state transitions to `canvas_node_states`; mark stale "running" canvases as "failed" on startup |

---

## Implications for Roadmap

### Suggested Phase Structure

The research from all four files converges on the same 4-phase build order driven by component dependencies and risk mitigation.

---

**Phase A — Data Model + CRUD API**

*Rationale:* Everything else depends on the database schema and API. Build and validate the data model first — discovering schema mistakes here is cheap; discovering them after building the editor is expensive.

*Delivers:* Canvas list page with thumbnails, creation wizard (2-step), rename, delete. Users can create and name canvases even without the editor.

*Key features:* DB tables (`canvases`, `canvas_node_states`), full CRUD API, list page with SVG thumbnail cards, creation wizard matching task wizard pattern.

*Pitfalls to prevent here:*
- Separate `flow_json` and `thumbnail_svg` columns to avoid slow list queries (Pitfall 11)
- `dynamic = 'force-dynamic'` on all API routes (Pitfall 15)
- Startup cleanup for stuck "running" canvases (Pitfall 12)

*Research flag:* No deep research needed — standard SQLite + Next.js CRUD pattern already well-established in this codebase.

---

**Phase B — Canvas Editor + Node Types**

*Rationale:* The visual editor is the most complex, highest-risk phase. It introduces React Flow and all 8 custom node types. Building this as the second phase means the API exists but execution logic is not yet written — a clean separation that allows the editor to be tested visually without execution complexity.

*Delivers:* Fully functional visual canvas editor. Users can draw pipeline graphs, auto-layout, undo/redo, copy/paste, and the canvas auto-saves. No execution yet.

*Key features:* `@xyflow/react` installation, CSS config, `"use client"` boundary + `next/dynamic`, `ReactFlowProvider` wrapping, all 8 custom node components, node palette sidebar, `isValidConnection` cycle detection, dagre auto-layout, auto-save (3s debounce with `useRef` timer), SVG thumbnail generation.

*Pitfalls to prevent here (all 5 critical pitfalls are in this phase):*
- `"use client"` + `next/dynamic({ ssr: false })` (Pitfall 1)
- `NODE_TYPES` as module-level constant (Pitfall 2)
- `ReactFlowProvider` wrapping full page shell (Pitfall 3)
- Explicit `h-[calc(100vh-64px)]` container height (Pitfall 4)
- CSS import order: React Flow stylesheet after Tailwind (Pitfall 5)
- `useRef` timer auto-save (Pitfall 6)
- `isValidConnection` cycle check (Pitfall 8)
- `NODE_DIMENSIONS` for dagre (Pitfall 9)
- `generateId()` for node IDs, not `crypto.randomUUID()` (Pitfall 17)
- Correct handles per node type: START=source only, OUTPUT=target only, rest=both (Pitfall 16)

*Research flag:* NEEDS RESEARCH — React Flow custom node component API and interaction patterns are the most complex part of this feature and depend on exact API shapes.

---

**Phase C — Execution Engine**

*Rationale:* The execution engine adapts the existing `task-executor.ts` pattern for DAG traversal. Building it after the editor means the node type system is defined and stable, so the executor knows exactly what node types to dispatch.

*Delivers:* Running canvases — DAG execution with per-node visual status, animated edges, checkpoint pause/resume, per-node log viewer, read-only mode during execution.

*Key features:* `canvas-executor.ts` with topological sort, node type handlers (8 types), fire-and-forget execution launch, 2s polling status endpoint, per-node status overlays, checkpoint approve/reject endpoints, cancellation.

*Pitfalls to prevent here:*
- Pre-execution validation for disconnected nodes (Pitfall 7)
- Persist all node state transitions to SQLite (Pitfall 12)
- Strip execution fields before auto-save (`executionStatus: undefined`) to avoid storing execution data in `flow_data`

*Research flag:* No deep research needed — mirrors existing `task-executor.ts` which is well-understood.

---

**Phase D — Templates + Polish**

*Rationale:* Seed templates and mode-based palette filtering are additive features that require all prior phases to be stable. Templates are JSON `flow_data` objects seeded in `db.ts` — zero new infrastructure.

*Delivers:* 4 seed templates, 3 canvas modes with palette filtering, topological sort order badges, CatBot `create_canvas` tool.

*Key features:* Template seed data in `db.ts`, mode filter on palette, badge overlay on nodes showing execution order, CatBot POST tool.

*Pitfalls to prevent here:* Template `flow_data` must not contain execution state fields (clean node data only).

*Research flag:* No deep research needed — CatBot tool pattern already established.

---

### Phase Summary

| Phase | Name | Phases Needed First | Research Flag |
|-------|------|---------------------|---------------|
| A | Data Model + CRUD API | None | Standard patterns — skip research |
| B | Canvas Editor + Node Types | Phase A | Needs research (React Flow custom nodes) |
| C | Execution Engine | Phases A + B | Standard patterns — skip research |
| D | Templates + Polish | Phases A + B + C | Standard patterns — skip research |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | React Flow official docs verified, npm packages confirmed, version constraints explicit |
| Features | HIGH | Table stakes derived from React Flow built-ins + n8n comparison; scope constraints from PROJECT.md |
| Architecture | HIGH | React Flow official docs + direct codebase read of `task-executor.ts`, `db.ts`, `usage-tracker.ts` |
| Pitfalls | HIGH | React Flow official troubleshooting docs + xyflow GitHub issues; all critical pitfalls have documented preventions |

**Overall: HIGH confidence.** The research is unusually strong because React Flow has comprehensive official documentation, the pitfalls are well-documented in the xyflow GitHub issue tracker, and the existing codebase provides clear patterns to follow.

### Gaps to Address

1. **Custom node API shapes:** The exact props, handle configuration, and internal state management for complex nodes (CONDITION, CHECKPOINT with approve/reject UI) warrant a dedicated research pass before Phase B implementation begins.

2. **CONDITION node expression evaluation:** The research identifies the CONDITION node as a differentiator but does not specify the expression evaluation approach (JSON Logic, simple template predicates, free-text JavaScript eval). This needs a design decision before Phase C.

3. **CatBot canvas schema:** The `create_canvas` CatBot tool needs a defined JSON input schema for specifying node types, connections, and mode. This is a Phase D consideration but should be decided when the canvas `flow_data` schema is finalized in Phase A.

---

## Sources (Aggregated)

**HIGH confidence:**
- React Flow official docs: https://reactflow.dev/learn
- React Flow troubleshooting: https://reactflow.dev/learn/troubleshooting
- React Flow SSR/SSG config: https://reactflow.dev/learn/advanced-use/ssr-ssg-configuration
- React Flow state management: https://reactflow.dev/learn/advanced-use/state-management
- @xyflow/react on npm: https://www.npmjs.com/package/@xyflow/react
- @dagrejs/dagre on npm: https://www.npmjs.com/package/@dagrejs/dagre
- Existing codebase: `task-executor.ts`, `db.ts`, `usage-tracker.ts` (read directly)

**MEDIUM confidence:**
- n8n canvas internals via DeepWiki: https://deepwiki.com/n8n-io/n8n/6.2-workflow-canvas-and-node-management
- xyflow GitHub issues: #4983 (re-rendering), #4800 (dagre edge overlap)
- xyflow Discussion #2717: Thumbnails of 100% of canvas
- Pinpoint Engineering React Flow auto-layout guide (Medium)
- Autosave with React Hooks patterns (Synthace blog)
