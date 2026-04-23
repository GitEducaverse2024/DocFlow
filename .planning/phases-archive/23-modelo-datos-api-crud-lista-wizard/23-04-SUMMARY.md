---
phase: 23-modelo-datos-api-crud-lista-wizard
plan: 04
subsystem: ui
tags: [sqlite, nextjs, react, canvas, workflow]

# Dependency graph
requires:
  - phase: 23-modelo-datos-api-crud-lista-wizard
    provides: canvases table, canvas API CRUD, canvas list page, canvas wizard

provides:
  - node_count column in canvases table (ALTER TABLE migration)
  - node_count in GET /api/canvas SELECT and POST INSERT
  - Auto-calculated node_count from flow_data.nodes.length on PATCH /api/canvas/[id]
  - Canvas cards display "{N} nodos" next to mode badge
  - Plantillas tab count from canvas_templates table (templates.length)
  - Usar button wires to wizard at step 2 in template mode with pre-selected template

affects: [24-editor-visual, 25-motor-ejecucion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ALTER TABLE try-catch for adding columns to existing tables"
    - "fetchTemplates accepts preSelectId to auto-select after async load"
    - "node_count auto-calculated from flow_data.nodes.length in PATCH handler"

key-files:
  created: []
  modified:
    - app/src/lib/db.ts
    - app/src/app/api/canvas/route.ts
    - app/src/app/api/canvas/[id]/route.ts
    - app/src/components/canvas/canvas-card.tsx
    - app/src/app/canvas/page.tsx
    - app/src/components/canvas/canvas-wizard.tsx

key-decisions:
  - "node_count DEFAULT 1 — every canvas starts with one START node"
  - "node_count auto-updates on every PATCH with flow_data — no separate sync needed"
  - "fetchTemplates(preSelectId) pattern handles async load + pre-selection in one pass"

patterns-established:
  - "fetchTemplates(preSelectId): pass pre-selection id to async fetch, set in setState callback after load"
  - "initialTemplateId prop on wizard: set both selectedTemplateId state AND trigger fetchTemplates with id"

requirements-completed: [LIST-01, LIST-02, LIST-03]

# Metrics
duration: 3min
completed: 2026-03-12
---

# Phase 23 Plan 04: Gap Closure (LIST-01, LIST-02, LIST-03) Summary

**node_count column added to canvases table, canvas cards display "{N} nodos", Plantillas tab uses canvas_templates count, and Usar button pre-configures wizard at step 2 with selected template**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-12T15:22:29Z
- **Completed:** 2026-03-12T15:25:17Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Closed LIST-01: canvas cards now show node count badge (`{N} nodos`) alongside mode badge and timestamp
- Closed LIST-02: Plantillas tab count now reflects `canvas_templates` table via `templates.length`, not `canvases.is_template`
- Closed LIST-03: Clicking "Usar" on a template card opens wizard pre-configured at step 2 in template mode with that template auto-selected and name pre-filled

## Task Commits

1. **Task 1: Add node_count column and display in canvas cards (LIST-01)** - `227ca90` (feat)
2. **Task 2: Fix Plantillas tab count and wire Usar button to wizard (LIST-02, LIST-03)** - `fdf511f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `app/src/lib/db.ts` - Added ALTER TABLE to add node_count INTEGER DEFAULT 1 column
- `app/src/app/api/canvas/route.ts` - Added node_count to GET SELECT; added node_count=1 to POST INSERT
- `app/src/app/api/canvas/[id]/route.ts` - Auto-calculate node_count from flow_data.nodes.length on PATCH
- `app/src/components/canvas/canvas-card.tsx` - Added node_count to CanvasListItem interface, display "{N} nodos"
- `app/src/app/canvas/page.tsx` - Added node_count to CanvasListItem, fixed templates count, added selectedTemplateForWizard state, wired Usar button
- `app/src/components/canvas/canvas-wizard.tsx` - Added initialTemplateId prop, updated auto-advance useEffect, updated fetchTemplates to accept preSelectId

## Decisions Made

- `node_count DEFAULT 1` because every new canvas starts with one START node — accurate from creation
- node_count auto-calculated on every PATCH with flow_data — no separate sync mechanism needed, keeps data consistent
- `fetchTemplates(preSelectId)` pattern: the pre-select ID is passed into the fetch function and applied in the setState callback after the templates array is available, solving the async timing issue

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- All 3 gap requirements (LIST-01, LIST-02, LIST-03) fully satisfied
- Phase 23 now has all 6 success criteria verified
- Ready to proceed to Phase 24: Editor Visual + 8 Tipos de Nodo

---
*Phase: 23-modelo-datos-api-crud-lista-wizard*
*Completed: 2026-03-12*
