---
phase: 39-renombrado-y-migracion
plan: 01
subsystem: data-layer + api
tags: [migration, rename, database, api-routes, redirects]
dependency_graph:
  requires: []
  provides: [catbrains-table, catbrains-api, projects-redirects]
  affects: [db.ts, types.ts, api-routes]
tech_stack:
  added: []
  patterns: [table-migration-with-fallback, 301-redirect-aliases]
key_files:
  created:
    - app/src/app/api/catbrains/route.ts
    - app/src/app/api/catbrains/[id]/route.ts
    - app/src/app/api/catbrains/[id]/chat/route.ts
    - app/src/app/api/catbrains/[id]/sources/route.ts
    - app/src/app/api/catbrains/[id]/sources/[sid]/route.ts
    - app/src/app/api/catbrains/[id]/sources/reorder/route.ts
    - app/src/app/api/catbrains/[id]/rag/route.ts
    - app/src/app/api/catbrains/[id]/rag/create/route.ts
    - app/src/app/api/catbrains/[id]/rag/info/route.ts
    - app/src/app/api/catbrains/[id]/rag/query/route.ts
    - app/src/app/api/catbrains/[id]/rag/status/route.ts
    - app/src/app/api/catbrains/[id]/stats/route.ts
    - app/src/app/api/catbrains/[id]/bot/create/route.ts
    - app/src/app/api/catbrains/[id]/process/route.ts
    - app/src/app/api/catbrains/[id]/process/status/route.ts
    - app/src/app/api/catbrains/[id]/process/clean/route.ts
    - app/src/app/api/catbrains/[id]/process/history/route.ts
    - app/src/app/api/catbrains/[id]/process/callback/route.ts
    - app/src/app/api/catbrains/[id]/process/[vid]/route.ts
    - app/src/app/api/catbrains/[id]/process/[vid]/output/route.ts
  modified:
    - app/src/lib/db.ts
    - app/src/lib/types.ts
    - app/src/app/api/projects/route.ts
    - app/src/app/api/projects/[id]/route.ts
    - (18 more project route files converted to redirects)
decisions:
  - FK column names (project_id) kept in sources/processing_runs tables for backward compat
  - Data directory on disk (data/projects/) unchanged to avoid data loss
  - Canvas template seeds updated to use catbrain type and catbrains mode
  - New columns system_prompt, mcp_enabled, icon_color added via ALTER TABLE pattern
metrics:
  duration: 555s
  completed: "2026-03-14T12:36:40Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 20
  files_modified: 22
---

# Phase 39 Plan 01: DB Migration + API Routes Summary

Migrated database table from projects to catbrains with new columns (system_prompt, mcp_enabled, icon_color), created 20 catbrains API routes, converted 20 project routes to 301 redirects.

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Migrate DB table projects to catbrains and update types | 1f97135 | CREATE TABLE catbrains, migration block, new columns, FK updates, canvas template seeds |
| 2 | Create all /api/catbrains route files | 4dabd70 | 20 new route files mirroring /api/projects structure |
| 3 | Convert all /api/projects routes to 301 redirects | 977d4de | 20 route files replaced with 301 redirect handlers |

## Deviations from Plan

None - plan executed exactly as written.

## Implementation Details

### Task 1: Database Migration
- Renamed `CREATE TABLE IF NOT EXISTS projects` to `catbrains` in db.ts
- Added migration block: checks for existing `projects` table, copies data with `INSERT OR IGNORE`, then `DROP TABLE`
- Updated all FK references in `sources` and `processing_runs` tables
- Added 3 new columns: `system_prompt TEXT`, `mcp_enabled INTEGER DEFAULT 1`, `icon_color TEXT DEFAULT 'violet'`
- Updated canvas template seeds: `type: 'project'` -> `type: 'catbrain'`, `mode: 'projects'` -> `mode: 'catbrains'`
- Added comments to TypeScript interfaces marking legacy column names

### Task 2: CatBrains API Routes
- Created full mirror of /api/projects structure under /api/catbrains
- All SQL queries reference `catbrains` table
- All routes use `await params` pattern (Next.js 15)
- All routes include `export const dynamic = 'force-dynamic'`
- New [id] route supports system_prompt, mcp_enabled, icon_color in PATCH
- Notification links point to `/catbrains/{id}` instead of `/projects/{id}`

### Task 3: Project Route Redirects
- All 20 route files replaced with minimal redirect handlers
- Each file exports same HTTP methods as the original
- Uses `pathname.replace('/api/projects', '/api/catbrains')` to preserve path params
- 301 (permanent) redirects for proper HTTP client caching

## Verification

- TypeScript compilation: PASSED (no errors)
- Next.js build: PASSED (all routes compiled)
- All 20 catbrains route files verified present
- No residual `FROM projects` / `UPDATE projects` SQL in catbrains routes

## Self-Check: PASSED

- All key files exist on disk
- All 3 task commits found in git log
- 20/20 catbrains route files present
- 20/20 project redirect files present
