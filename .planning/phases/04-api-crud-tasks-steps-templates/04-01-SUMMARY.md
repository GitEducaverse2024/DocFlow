---
phase: 04-api-crud-tasks-steps-templates
plan: 01
subsystem: tasks-api
tags: [api, crud, tasks, steps, templates]
dependency_graph:
  requires: [03-01]
  provides: [tasks-api, steps-api, templates-api]
  affects: [phase-05-execution, phase-06-ui]
tech_stack:
  added: []
  patterns: [next-api-routes, force-dynamic, uuid-primary-keys, dynamic-sql-updates, sqlite-transactions]
key_files:
  created:
    - app/src/app/api/tasks/route.ts
    - app/src/app/api/tasks/[id]/route.ts
    - app/src/app/api/tasks/[id]/steps/route.ts
    - app/src/app/api/tasks/[id]/steps/[stepId]/route.ts
    - app/src/app/api/tasks/[id]/steps/reorder/route.ts
    - app/src/app/api/tasks/templates/route.ts
    - app/src/app/api/tasks/from-template/route.ts
  modified: []
decisions:
  - Used dynamic SQL SET construction for PATCH endpoints to only update provided fields
  - Transaction-based reorder for atomicity of step ordering
  - Max 10 steps per task enforced at API level
metrics:
  duration: 105s
  completed: 2026-03-11T14:36:34Z
  tasks_completed: 8
  tasks_total: 8
  files_created: 7
  files_modified: 0
---

# Phase 4 Plan 1: Tasks API CRUD Summary

Full REST API for tasks, steps, and templates: 7 route files with 12 endpoint operations covering all CRUD for the task system.

## Completed Tasks

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | GET/POST /api/tasks | 7de515e | app/src/app/api/tasks/route.ts |
| 2 | GET/PATCH/DELETE /api/tasks/{id} | e78c8bb | app/src/app/api/tasks/[id]/route.ts |
| 3 | GET/POST /api/tasks/{id}/steps | e559f95 | app/src/app/api/tasks/[id]/steps/route.ts |
| 4 | PATCH/DELETE /api/tasks/{id}/steps/{stepId} | 89b834c | app/src/app/api/tasks/[id]/steps/[stepId]/route.ts |
| 5 | POST /api/tasks/{id}/steps/reorder | 39e0cc9 | app/src/app/api/tasks/[id]/steps/reorder/route.ts |
| 6 | GET /api/tasks/templates | 502e55c | app/src/app/api/tasks/templates/route.ts |
| 7 | POST /api/tasks/from-template | ac1545b | app/src/app/api/tasks/from-template/route.ts |
| 8 | Build verification | - | npm run build passed |

## Endpoint Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/tasks | List tasks with status filter, enriched with steps_count, agents, project_names |
| POST | /api/tasks | Create task with draft status |
| GET | /api/tasks/{id} | Task detail with steps array |
| PATCH | /api/tasks/{id} | Update task fields dynamically |
| DELETE | /api/tasks/{id} | Delete task (cascade to steps) |
| GET | /api/tasks/{id}/steps | List steps ordered by order_index |
| POST | /api/tasks/{id}/steps | Create step (max 10 validation, auto-reorder) |
| PATCH | /api/tasks/{id}/steps/{stepId} | Update step fields dynamically |
| DELETE | /api/tasks/{id}/steps/{stepId} | Delete step with auto-reorder remaining |
| POST | /api/tasks/{id}/steps/reorder | Atomic transaction reorder |
| GET | /api/tasks/templates | List templates by popularity |
| POST | /api/tasks/from-template | Create task with pre-configured steps from template |

## Decisions Made

1. **Dynamic SQL SET for PATCH**: Build UPDATE queries with only the fields provided in the request body, avoiding overwrites of unspecified fields.
2. **Transaction-based reorder**: Used `db.transaction()` for atomic step reordering to prevent inconsistent order_index values.
3. **Max 10 steps enforced at API**: Validation at the POST step endpoint prevents exceeding the limit.
4. **Spanish error messages**: All user-facing error messages in Spanish per project convention.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- All 7 route files created and contain force-dynamic export
- npm run build passes with all routes listed in build output
- 12 endpoint operations functional across 7 files

## Self-Check: PASSED

- All 7 route files: FOUND
- All 7 task commits: FOUND
