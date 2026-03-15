---
phase: 45-ui-pagina-agentes-rediseñada
plan: 03
subsystem: ui
tags: [canvas, catpaw, agent-selector, process-panel, task-wizard]
dependency_graph:
  requires: [cat-paws-api, catpaw-types, 45-01]
  provides: [canvas-catpaw-node, task-wizard-catpaw-selector, process-panel-catpaw-processor]
  affects: [canvas, tasks/new, process-panel]
tech_stack:
  added: []
  patterns: [catpaw-icon-in-canvas, mode-badge-colors, processor-mode-selector]
key_files:
  created: []
  modified:
    - app/src/components/canvas/node-palette.tsx
    - app/src/components/canvas/nodes/agent-node.tsx
    - app/src/components/canvas/node-config-panel.tsx
    - app/src/app/tasks/new/page.tsx
    - app/src/components/process/process-panel.tsx
decisions:
  - Keep worker_id field in ProcessingRun state for backward compat, send processor_paw_id in API request body
  - Mode badge colors consistent across app -- violet=chat, teal=processor, amber=hybrid
  - Process panel fetches from /api/cat-paws?mode=processor to get both processor and hybrid CatPaws
metrics:
  duration: 583s
  completed: "2026-03-15T13:45:24Z"
---

# Phase 45 Plan 03: Agent Selectors Migration to CatPaw Summary

Canvas agent nodes, task wizard agent selector, and CatBrain pipeline process-panel all migrated from old agents/workers APIs to unified /api/cat-paws endpoints with PawPrint icons and mode badges.

## Tasks Completed

### Task 1: Canvas node palette + agent-node + config panel
- **Commit:** f11a053
- **node-palette.tsx:** Replaced Bot icon with catpaw.png for agent entry in palette
- **agent-node.tsx:** Replaced Bot icon with Image catpaw.png, added mode badge (violet=chat, teal=processor, amber=hybrid)
- **node-config-panel.tsx:** Fetch from /api/cat-paws instead of /api/agents, show avatar_emoji + mode in dropdowns, updated NODE_TYPE_META agent icon to catpaw.png

### Task 2: Task wizard agent selector + CatBrain pipeline processor selector
- **Commit:** 76cb2d7
- **tasks/new/page.tsx:** Fetch agents from /api/cat-paws, updated Agent interface (avatar_emoji, mode), connector fetch via /api/cat-paws/{id}/relations
- **process-panel.tsx:** Full migration from DocsWorker to CatPaw processor:
  - State renamed: workers -> processorPaws (CatPawWithCounts[]), selectedWorkerId -> selectedProcessorId, processMode 'worker' -> 'catpaw-processor'
  - Fetch from /api/cat-paws?mode=processor instead of /api/workers
  - Mode selector button shows catpaw.png icon and "CatPaw Procesador" label
  - Processor list displays avatar_emoji, name, mode badge (teal/amber)
  - Empty state links to /agents instead of /workers
  - All Spanish UI text preserved

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ProcessingRun type compatibility**
- **Found during:** Task 2
- **Issue:** ProcessingRun type defines `worker_id` field; replacing with `processor_paw_id` in setActiveRun caused type error
- **Fix:** Kept `worker_id` in ProcessingRun state objects for backward compat, used `processor_paw_id` only in API request bodies sent to server
- **Files modified:** app/src/components/process/process-panel.tsx
- **Commit:** 76cb2d7

## Verification

- Build passes without errors (warnings are pre-existing, unrelated)
- Canvas palette shows catpaw.png for Agent node type
- Canvas agent node config panel fetches CatPaws from /api/cat-paws
- Task wizard agent selector fetches from /api/cat-paws with avatar_emoji display
- CatBrain pipeline process-panel shows CatPaw processor selector

## Self-Check: PASSED

- FOUND: app/src/components/canvas/node-palette.tsx
- FOUND: app/src/components/canvas/nodes/agent-node.tsx
- FOUND: app/src/components/canvas/node-config-panel.tsx
- FOUND: app/src/app/tasks/new/page.tsx
- FOUND: app/src/components/process/process-panel.tsx
- FOUND: commit f11a053 (Task 1)
- FOUND: commit 76cb2d7 (Task 2)
