---
phase: 23-modelo-datos-api-crud-lista-wizard
plan: 01
subsystem: canvas-data-model
tags: [sqlite, api, crud, canvas, data-model]
dependency_graph:
  requires: []
  provides: [canvases-table, canvas-runs-table, canvas-templates-table, canvas-crud-api, generateId-utility]
  affects: [app/src/lib/db.ts, app/src/lib/utils.ts, app/src/app/api/canvas/route.ts, app/src/app/api/canvas/[id]/route.ts]
tech_stack:
  added: []
  patterns: [better-sqlite3 CREATE TABLE IF NOT EXISTS, Next.js force-dynamic API routes, UUID v4 Math.random helper]
key_files:
  created:
    - app/src/app/api/canvas/route.ts
    - app/src/app/api/canvas/[id]/route.ts
  modified:
    - app/src/lib/db.ts
    - app/src/lib/utils.ts
decisions:
  - generateId() uses Math.random not crypto.randomUUID (HTTP context, no secure context available)
  - GET /api/canvas excludes flow_data from list response (large JSON not needed for cards)
  - POST /api/canvas seeds default START node in flow_data on creation
  - canvas_runs startup cleanup runs at db.ts init time (same pattern as task engine)
  - PATCH uses dynamic UPDATE building (only update provided fields)
metrics:
  duration: 121s
  completed: "2026-03-12T14:55:51Z"
  tasks_completed: 2
  files_modified: 4
---

# Phase 23 Plan 01: Canvas Data Model + CRUD API Summary

SQLite canvas data model (3 tables) + 5 REST endpoints covering full CRUD with startup recovery for stuck runs.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Canvas tables in db.ts + generateId in utils.ts | eddd648 | app/src/lib/db.ts, app/src/lib/utils.ts |
| 2 | Canvas CRUD API routes | 62ee6c3 | app/src/app/api/canvas/route.ts, app/src/app/api/canvas/[id]/route.ts |

## What Was Built

### Task 1: Data Model

Three new SQLite tables added to `db.ts` after the existing connector tables:

- **canvases** (DATA-01): Core canvas entity with id, name, emoji, mode, status, flow_data (JSON), thumbnail (SVG), tags (JSON array), is_template flag, timestamps.
- **canvas_runs** (DATA-02): Execution run records with ON DELETE CASCADE FK to canvases, node_states (JSON), execution_order (JSON), token/duration accumulators, started_at/completed_at.
- **canvas_templates** (DATA-03): Template library with nodes/edges JSON, preview_svg, times_used counter.

Startup cleanup: `UPDATE canvas_runs SET status = 'failed' WHERE status = 'running'` runs at db init — recovers from server crashes during active executions.

`generateId()` UUID v4 helper exported from `utils.ts` using Math.random (not crypto.randomUUID which requires HTTPS/secure context).

### Task 2: API Routes

`app/src/app/api/canvas/route.ts`:
- **GET** — Returns list without flow_data (explicit column select). Optional ?mode= and ?status= filters. Ordered by updated_at DESC.
- **POST** — Validates name, generates UUID, creates default flow_data with a single START node at (250, 200), returns `{ id, redirectUrl: /canvas/{id} }` with 201.

`app/src/app/api/canvas/[id]/route.ts`:
- **GET** — Returns full canvas row including flow_data. 404 if not found.
- **PATCH** — Dynamic UPDATE, only patches provided fields (name, description, emoji, flow_data, thumbnail, status, tags). Always updates updated_at.
- **DELETE** — Removes canvas row; canvas_runs cascade automatically.

All routes: `export const dynamic = 'force-dynamic'`, Spanish error messages, try/catch with 500 fallback.

## Verification

- TypeScript: `npx tsc --noEmit` — passed, no errors
- Build: `npm run build` — passed, both routes appear as `ƒ` (dynamic) at `/api/canvas` and `/api/canvas/[id]`

## Deviations from Plan

None — plan executed exactly as written.
