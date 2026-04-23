---
phase: 24-editor-visual-8-tipos-de-nodo
plan: 03
subsystem: canvas-editor
tags: [canvas, auto-save, undo-redo, dagre, layout, react-flow]
dependency_graph:
  requires: [24-01]
  provides: [auto-save-debounce, undo-redo-history, dagre-auto-layout, save-status-indicator]
  affects: [canvas-editor.tsx, canvas-toolbar.tsx]
tech_stack:
  added: []
  patterns: [useRef-debounce-timer, snapshot-history-array, dagre-graphlib-layout, keyboard-event-listener]
key_files:
  created:
    - app/src/components/canvas/node-config-panel.tsx
  modified:
    - app/src/components/canvas/canvas-editor.tsx
    - app/src/components/canvas/canvas-toolbar.tsx
decisions:
  - "scheduleAutoSave uses empty deps array + refs (canvasIdRef, saveTimer, toObject) to maintain stable callback reference without re-creating on state changes"
  - "Undo/redo implemented with past/future snapshot arrays (max 30) — takeSnapshot called before structural changes, not on position moves"
  - "onNodesDelete/onEdgesDelete take snapshots BEFORE deletion for correct undo behavior"
  - "Dagre NODE_DIMENSIONS declared at module level with per-type width/height to prevent node overlap in LR layout"
  - "node-config-panel.tsx stub created (Rule 3 auto-fix) — Plan 02 added import but not the file; stub unblocks build"
metrics:
  duration: ~420s
  completed: "2026-03-12T16:15:00Z"
  tasks: 2
  files_modified: 3
  files_created: 1
---

# Phase 24 Plan 03: Auto-save, Undo/Redo, Dagre Layout Summary

**One-liner:** 3s debounced auto-save with status indicator, 30-snapshot undo/redo via Ctrl+Z, and dagre LR layout with 200px/100px spacing wired to "Auto-organizar" button.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Auto-save with 3s debounce and save status indicator | c5d9717 | canvas-editor.tsx, canvas-toolbar.tsx |
| 2 | Undo/redo snapshots and dagre auto-layout | 00d63c0 | canvas-editor.tsx, node-config-panel.tsx (stub) |

## What Was Built

### Auto-save (EDIT-08)

- `scheduleAutoSave` callback with stable reference (empty deps, refs for fresh values)
- `saveTimer` useRef for debounce — 3000ms delay
- `canvasIdRef` keeps canvasId fresh inside stable callback
- `handleNodesChange` wrapper filters: `changes.some(c => c.type !== 'select')` — selecting nodes does NOT trigger save
- `handleEdgesChange` wrapper triggers save on all edge changes
- `onConnect` triggers save after adding edge
- Strips `executionStatus` and `executionOutput` from node data before saving
- Cleanup effect clears timer on unmount
- Status indicator: amber dot "Sin guardar" → violet pulse "Guardando..." → green "Guardado"

### Undo/Redo (EDIT-09)

- `past` and `future` state arrays, max 30 snapshots in past
- `takeSnapshot`: appends `{ nodes, edges }` snapshot to past, clears future
- `undo`: saves current to future, pops from past, restores
- `redo`: saves current to past, shifts from future, restores
- Snapshots captured before: node drop (onDrop), connect (onConnect), node delete (onNodesDelete), edge delete (onEdgesDelete)
- Keyboard: `Ctrl+Z` undo, `Ctrl+Shift+Z` redo, `Ctrl+Y` redo (alt)
- Toolbar: Undo2/Redo2 buttons from lucide-react, disabled when history empty

### Dagre Auto-Layout (EDIT-10)

- `applyDagreLayout(nodes, edges)` at module level
- `dagre.graphlib.Graph` with `rankdir: 'LR'`, `ranksep: 200`, `nodesep: 100`
- `NODE_DIMENSIONS` per type to prevent overlap (e.g., agent 260x130, start 120x100)
- Fallback: `{ width: 240, height: 120 }` for unknown types
- `handleAutoLayout`: takeSnapshot → dagre → setNodes → fitView after 50ms → scheduleAutoSave
- "Auto-organizar" button in toolbar wired to `onAutoLayout`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing node-config-panel.tsx unblocked build**
- **Found during:** Task 1 verification (npm run build)
- **Issue:** Plan 02 ran in parallel and added `import { NodeConfigPanel } from './node-config-panel'` to canvas-editor.tsx, but the file did not exist
- **Fix:** Created minimal stub at `app/src/components/canvas/node-config-panel.tsx` with correct prop interface (`selectedNode`, `onNodeDataUpdate`) matching what canvas-editor.tsx passes
- **Files modified:** app/src/components/canvas/node-config-panel.tsx (created)
- **Commit:** 00d63c0

**2. [Rule 1 - Bug] Unused parameter names in onNodesDelete/onEdgesDelete**
- **Found during:** Task 1 verification (npm run build)
- **Issue:** TypeScript lint error `'_deletedNodes' is defined but never used`
- **Fix:** Removed parameter names from callbacks (functions still match expected ReactFlow signature)
- **Files modified:** canvas-editor.tsx

## Self-Check

Files exist:
- [x] app/src/components/canvas/canvas-editor.tsx — FOUND
- [x] app/src/components/canvas/canvas-toolbar.tsx — FOUND
- [x] app/src/components/canvas/node-config-panel.tsx — FOUND
- [x] .planning/phases/24-editor-visual-8-tipos-de-nodo/24-03-SUMMARY.md — FOUND

Commits exist:
- [x] c5d9717 — feat(24-03): add auto-save with 3s debounce and save status indicator — FOUND
- [x] 00d63c0 — feat(24-03): add undo/redo snapshots, dagre auto-layout, and node-config-panel stub — FOUND

## Self-Check: PASSED
