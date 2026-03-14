---
phase: 40-conectores-propios
plan: 01
subsystem: catbrain-connectors
tags: [data-model, api, crud, connectors, catbrains]
dependency_graph:
  requires: [catbrains table, connectors patterns from v3.0]
  provides: [catbrain_connectors table, CatBrainConnector type, CRUD API, test API]
  affects: [Phase 41 - config UI + execution integration]
tech_stack:
  added: []
  patterns: [CatBrain-scoped FK, connector test switch, async params]
key_files:
  created:
    - app/src/app/api/catbrains/[id]/connectors/route.ts
    - app/src/app/api/catbrains/[id]/connectors/[connId]/route.ts
    - app/src/app/api/catbrains/[id]/connectors/[connId]/test/route.ts
  modified:
    - app/src/lib/db.ts
    - app/src/lib/types.ts
decisions:
  - No emoji or times_used columns in catbrain_connectors (lean schema)
  - Test logic copied from global connectors test route for consistency
metrics:
  duration: 139s
  completed: "2026-03-14T14:17:39Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 2
---

# Phase 40 Plan 01: CatBrain Connectors Data Model + CRUD API Summary

CatBrain-scoped connectors table with FK CASCADE, full REST CRUD, and test endpoint for all 4 connector types (n8n_webhook, http_api, mcp_server, email).

## What Was Done

### Task 1: Create catbrain_connectors table and CatBrainConnector type
- Added `CREATE TABLE IF NOT EXISTS catbrain_connectors` in db.ts with FK to catbrains(id) ON DELETE CASCADE
- Columns: id, catbrain_id, name, type, config, description, is_active, test_status, last_tested, created_at, updated_at
- Added `CatBrainConnector` TypeScript interface in types.ts
- Commit: bf9ef31

### Task 2: Create CRUD + test API routes
- `GET/POST /api/catbrains/:id/connectors` -- list all connectors for a CatBrain + create new
- `GET/PATCH/DELETE /api/catbrains/:id/connectors/:connId` -- single connector operations
- `POST /api/catbrains/:id/connectors/:connId/test` -- test connector with 10s timeout, supports all 4 types
- All routes use force-dynamic, async params (Promise<>), generateId(), logger
- All routes validate catbrain existence before operating on connectors
- PATCH builds dynamic SET clause for partial updates
- Commit: ae8e787

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

1. TypeScript compilation: zero errors
2. Next.js build: all routes compile successfully
3. All 3 route files created and verified
4. catbrain_connectors DDL present in db.ts
5. CatBrainConnector interface exported from types.ts
