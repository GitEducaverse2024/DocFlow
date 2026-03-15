---
phase: 43-api-rest-catpaws
plan: 02
subsystem: api
tags: [api, relations, openclaw-sync, redirects, catpaw]
dependency_graph:
  requires: [cat-paws-crud-api, cat_paw_catbrains-table, cat_paw_connectors-table, cat_paw_agents-table]
  provides: [cat-paws-relations-api, cat-paws-openclaw-sync, agents-redirect, workers-redirect]
  affects: [executor-phase-44, ui-phase-45]
tech_stack:
  added: []
  patterns: [LEFT-JOIN-relation-names, UNIQUE-constraint-409, 301-GET-redirect, 308-POST-redirect, openclaw-workspace-sync]
key_files:
  created:
    - app/src/app/api/cat-paws/[id]/relations/route.ts
    - app/src/app/api/cat-paws/[id]/catbrains/route.ts
    - app/src/app/api/cat-paws/[id]/catbrains/[catbrainId]/route.ts
    - app/src/app/api/cat-paws/[id]/connectors/route.ts
    - app/src/app/api/cat-paws/[id]/connectors/[connectorId]/route.ts
    - app/src/app/api/cat-paws/[id]/agents/route.ts
    - app/src/app/api/cat-paws/[id]/agents/[targetPawId]/route.ts
    - app/src/app/api/cat-paws/[id]/openclaw-sync/route.ts
  modified:
    - app/src/app/api/agents/route.ts
    - app/src/app/api/agents/[id]/route.ts
    - app/src/app/api/workers/route.ts
    - app/src/app/api/workers/[id]/route.ts
decisions:
  - "308 for POST/PATCH/DELETE redirects to preserve HTTP method (301 may change POST to GET)"
  - "OpenClaw sync reuses same workspace layout as agents/create but adapted for CatPaw fields"
  - "Processor mode CatPaws blocked from OpenClaw sync (only chat/hybrid)"
key_decisions:
  - "308 status for method-preserving redirects"
  - "Processor mode excluded from OpenClaw sync"
metrics:
  duration: 177s
  completed: "2026-03-15T12:54:38Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 43 Plan 02: CatPaw Relations API + OpenClaw Sync + Backward Compat Summary

7 relation endpoints (catbrains/connectors/agents link-unlink + combined GET), OpenClaw workspace sync with gateway reload, and 301/308 redirects replacing old /api/agents and /api/workers CRUD routes.

## Tasks Completed

### Task 1: Relation endpoints (catbrains, connectors, agents link/unlink) + relations GET
- **Commit:** 570b114
- **Files:** 7 new route files under `/api/cat-paws/[id]/`
- GET /relations returns { catbrains, connectors, agents } with LEFT JOINed names/types
- POST catbrains validates catbrain_id exists, defaults query_mode='rag', priority=0
- POST connectors validates connector_id exists, defaults is_active=1
- POST agents validates target_paw_id exists, prevents self-link, validates relationship enum
- All POST endpoints handle UNIQUE constraint with 409 "Ya vinculado"
- All DELETE endpoints check changes===0 for 404 "Vinculo no encontrado"
- All routes use Next.js 15 async params pattern

### Task 2: OpenClaw sync endpoint + backward compat redirects
- **Commit:** 12e9131
- **Files:** 1 new + 4 replaced route files
- POST /openclaw-sync creates workspace directory with SOUL.md, AGENTS.md, IDENTITY.md, USER.md, TOOLS.md
- Registers agent in openclaw.json if not exists, creates agent/sessions dirs
- Attempts gateway reload via /rpc/config.reload then /rpc/gateway.reload (non-blocking)
- Updates cat_paws.openclaw_id and openclaw_synced_at on success
- Blocks processor mode with 400 error
- GET /api/agents redirects 301 to /api/cat-paws (preserves query params)
- GET /api/workers redirects 301 to /api/cat-paws?mode=processor
- POST/PATCH/DELETE use 308 to preserve HTTP method across redirect

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npm run build` passes clean
- 9 total route files under /api/cat-paws/ (2 from plan 01 + 7 new relation + 1 openclaw-sync = 10... actual count 9 because openclaw-sync is under [id]/)
- agents/route.ts and workers/route.ts contain redirect logic (no old CRUD)
- openclaw-sync checks mode !== 'processor' before syncing
- All route files export `dynamic = 'force-dynamic'`

## Self-Check: PASSED

All 8 created files verified on disk. Commits 570b114 and 12e9131 verified in git log.
