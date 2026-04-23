---
phase: 24-editor-visual-8-tipos-de-nodo
plan: 01
subsystem: canvas-editor
tags: [canvas, react-flow, xyflow, editor, drag-and-drop, node-palette]
dependency_graph:
  requires: [23-04]
  provides: [canvas-editor-shell, canvas-toolbar, node-palette, react-flow-foundation]
  affects: [canvas/[id]/page, globals.css]
tech_stack:
  added: ["@xyflow/react@^12.10.1", "@dagrejs/dagre@^2.0.4", "html-to-image@1.11.11", "@types/dagre@^0.7.54"]
  patterns: [dynamic-ssr-false, module-level-nodeTypes, ReactFlowProvider-wrapping, isValidConnection-cycle-check, drag-and-drop-dataTransfer]
key_files:
  created:
    - app/src/app/canvas/[id]/page.tsx
    - app/src/components/canvas/canvas-editor.tsx
    - app/src/components/canvas/canvas-toolbar.tsx
    - app/src/components/canvas/node-palette.tsx
  modified:
    - app/package.json
    - app/package-lock.json
    - app/src/app/globals.css
decisions:
  - "dynamic(ssr:false) + .then(m => m.CanvasEditor) needed for named export with Next.js 14 dynamic imports"
  - "IsValidConnection<Edge> type accepts Edge|Connection — not plain Connection — must use union type in callback signature"
  - "TooltipProvider from @base-ui/react uses delay prop (not delayDuration); TooltipTrigger renders as button natively (no asChild)"
  - "NODE_TYPES declared as empty const at module scope — Plan 02 will populate with actual node components"
metrics:
  duration: 268s
  completed: "2026-03-12T15:56:11Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 24 Plan 01: Canvas Editor Shell Summary

React Flow foundation with @xyflow/react installed, CSS import order correct, /canvas/[id] page with SSR guard, CanvasEditor component with ReactFlowProvider wrapping, cycle detection, toolbar with editable name, and 8-type draggable node palette.

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Install packages, CSS config, editor page shell | 7c34342 | @xyflow/react + dagre + html-to-image installed; globals.css import added; page.tsx + canvas-editor.tsx created |
| 2 | Toolbar and node palette components | 47b8f13 | canvas-toolbar.tsx with editable name + save status; node-palette.tsx with 8 draggable types + tooltips |

## Key Details

### Critical Pitfall Preventions Applied

| Pitfall | Prevention Applied |
|---------|-------------------|
| SSR crash (window undefined) | `dynamic(() => import(...).then(m => m.CanvasEditor), { ssr: false })` in page.tsx |
| Blank canvas (0px height) | `className="flex-1 h-full"` on direct ReactFlow parent |
| Invisible edges (CSS order) | `@import '@xyflow/react/dist/style.css'` after Tailwind directives in globals.css |
| Node remount storm | `NODE_TYPES` declared at module scope as empty `{}` |
| useReactFlow() crash | `ReactFlowProvider` wraps full shell including toolbar and palette |

### Canvas Editor (canvas-editor.tsx)
- `CanvasEditor` exports `ReactFlowProvider > CanvasShell` pattern
- `CanvasShell` uses `useNodesState`, `useEdgesState`, `useReactFlow`
- Mount effect fetches `/api/canvas/${canvasId}`, parses flow_data JSON, calls fitView after 50ms delay
- `isValidConnection`: DFS cycle check — walks outgoing edges from target, returns false if source is reachable
- `onDrop`: reads `application/reactflow` data, calls `screenToFlowPosition`, creates node with `generateId()` and `getDefaultNodeData()`
- `getDefaultNodeData()`: returns type-specific default data for all 8 node types
- `getMiniMapNodeColor()`: per-type color mapping for minimap node colors

### Canvas Toolbar (canvas-toolbar.tsx)
- Sticky `h-16` bar with `bg-zinc-900 border-b border-zinc-800`
- Left: ArrowLeft link to `/canvas`, transparent text input for name editing
- Center: colored dot + save status label ("Guardado" / "Sin guardar" / "Guardando...")
- Right: Auto-organizar (placeholder), Ejecutar (disabled, Phase 25), Settings buttons
- Name blur triggers PATCH `/api/canvas/${canvasId}` and calls `onNameChange`

### Node Palette (node-palette.tsx)
- 80px left panel with 8 draggable palette items
- Node types: start (emerald), agent (violet), project (blue), connector (orange), checkpoint (amber), merge (cyan), condition (yellow), output (emerald)
- Each item: `draggable`, `onDragStart` sets `application/reactflow` data transfer
- TooltipProvider wraps all items with Spanish descriptions
- `canvasMode` prop accepted for future Phase 26 mode filtering

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Named export requires .then() in dynamic import**
- **Found during:** Task 1
- **Issue:** `dynamic(() => import('@/components/canvas/canvas-editor'))` failed TypeScript check because the module exports a named `CanvasEditor`, not a default export
- **Fix:** Changed to `dynamic(() => import(...).then(m => m.CanvasEditor), { ssr: false })`
- **Files modified:** app/src/app/canvas/[id]/page.tsx
- **Commit:** 7c34342

**2. [Rule 1 - Bug] IsValidConnection type must accept Edge | Connection**
- **Found during:** Task 1 build
- **Issue:** TypeScript error — `isValidConnection` callback must accept `Edge | Connection` (the `IsValidConnection` type), not plain `Connection`
- **Fix:** Changed callback signature to `(connection: Connection | Edge)` with `IsValidConnection` type annotation; added null guard for source/target
- **Files modified:** app/src/components/canvas/canvas-editor.tsx
- **Commit:** 7c34342

**3. [Rule 1 - Bug] TooltipProvider delay prop mismatch**
- **Found during:** Task 2 build
- **Issue:** Project's tooltip.tsx uses `@base-ui/react` which uses `delay` prop, not `delayDuration` (Radix UI naming)
- **Fix:** Changed `delayDuration={300}` to `delay={300}` in TooltipProvider; removed `asChild` from TooltipTrigger (not supported by base-ui)
- **Files modified:** app/src/components/canvas/node-palette.tsx
- **Commit:** 47b8f13

## Verification Results
- `npm run build` passes cleanly (warnings are pre-existing, not new)
- `/canvas/[id]` route renders as dynamic (ƒ) in build output
- All 4 artifact files created per plan spec
- All 5 critical pitfall preventions in place

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| app/src/app/canvas/[id]/page.tsx | FOUND |
| app/src/components/canvas/canvas-editor.tsx | FOUND |
| app/src/components/canvas/canvas-toolbar.tsx | FOUND |
| app/src/components/canvas/node-palette.tsx | FOUND |
| Commit 7c34342 | FOUND |
| Commit 47b8f13 | FOUND |
