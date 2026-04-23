---
phase: 23-modelo-datos-api-crud-lista-wizard
plan: 02
subsystem: canvas-utility-api
tags: [api, canvas, validation, dag, svg, thumbnail, templates]
dependency_graph:
  requires: [23-01]
  provides: [canvas-validate-endpoint, canvas-thumbnail-endpoint, canvas-templates-endpoint, canvas-from-template-endpoint]
  affects:
    - app/src/app/api/canvas/[id]/validate/route.ts
    - app/src/app/api/canvas/[id]/thumbnail/route.ts
    - app/src/app/api/canvas/templates/route.ts
    - app/src/app/api/canvas/from-template/route.ts
tech_stack:
  added: []
  patterns: [DFS cycle detection, SVG string generation, node/edge ID remapping with Map]
key_files:
  created:
    - app/src/app/api/canvas/[id]/validate/route.ts
    - app/src/app/api/canvas/[id]/thumbnail/route.ts
    - app/src/app/api/canvas/templates/route.ts
    - app/src/app/api/canvas/from-template/route.ts
  modified: []
decisions:
  - DFS cycle detection uses visited + inStack sets (standard iterative DFS per-component)
  - SVG thumbnail is pure string concatenation 200x120 with 20px padding, no external deps
  - Node colors by type: start/output=#10b981, agent=#8b5cf6, project=#3b82f6, connector=#f97316
  - from-template uses Map<string,string> idMap to remap source/target after node ID duplication
  - templates endpoint returns empty array gracefully (templates seeded in Phase 26)
metrics:
  duration: 191s
  completed: "2026-03-12T15:02:05Z"
  tasks_completed: 2
  files_modified: 4
---

# Phase 23 Plan 02: Canvas Utility API Summary

**One-liner:** DAG validation with DFS cycle detection, SVG thumbnail generation, and template CRUD endpoints completing the canvas API surface.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create validate and thumbnail API routes | 7440b46 | validate/route.ts, thumbnail/route.ts |
| 2 | Create templates and from-template API routes | 6c728c9 | templates/route.ts, from-template/route.ts |

## What Was Built

### POST /api/canvas/[id]/validate (DATA-09)
Validates the canvas DAG and returns `{ valid: boolean, errors: string[] }`. Runs 4 checks:
1. START node exists — error if missing
2. OUTPUT node exists — error if missing
3. No orphan nodes — non-start nodes without incoming edges listed by label/id
4. No cycles — DFS with visited + inStack sets, reports cycle if found

### POST /api/canvas/[id]/thumbnail (DATA-10)
Generates an SVG thumbnail (200x120) from node positions:
- Background: `#18181b` (zinc-950) with rx=4
- Each node rendered as 16x10 colored rect at normalized position
- Colors per node type (start/output=emerald, agent=violet, project=blue, connector=orange, etc.)
- Edge cases: 0 nodes = empty rect, 1 node = centered
- Saves SVG to `canvases.thumbnail` and returns `{ thumbnail: "<svg..." }`

### GET /api/canvas/templates (DATA-11)
Returns all canvas templates ordered by `times_used DESC, name ASC`. Returns empty array in Phase 23 (templates seeded in Phase 26).

### POST /api/canvas/from-template (DATA-12)
Creates a canvas from an existing template:
1. Validates templateId + name (400 if missing)
2. Loads template, returns 404 if not found
3. Duplicates nodes/edges with new UUIDs via `generateId()` and `Map<string,string>` ID remapping
4. Builds new flow_data with default viewport `{ x: 0, y: 0, zoom: 1 }`
5. Inserts canvas row, increments `times_used`, returns `{ id, redirectUrl: /canvas/{id} }` with 201

## Deviations from Plan

None - plan executed exactly as written.

(Note: build compiled successfully on second attempt; first run showed a pre-existing canvas page import which was already resolved by the existing `canvas-wizard.tsx` component from Plan 23-01.)

## Self-Check: PASSED

Files verified:
- app/src/app/api/canvas/[id]/validate/route.ts: EXISTS
- app/src/app/api/canvas/[id]/thumbnail/route.ts: EXISTS
- app/src/app/api/canvas/templates/route.ts: EXISTS
- app/src/app/api/canvas/from-template/route.ts: EXISTS

Commits verified:
- 7440b46: feat(23-02): add canvas validate and thumbnail API routes
- 6c728c9: feat(23-02): add canvas templates and from-template API routes

Build: Passed (all 4 routes appear as dynamic ƒ routes in Next.js build output)
