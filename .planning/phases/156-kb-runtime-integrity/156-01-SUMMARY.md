---
phase: 156-kb-runtime-integrity
plan: 01
subsystem: knowledge-base
tags: [kb-sync, canvas, sudo-tools, soft-delete, hooks, markStale, tdd]

# Dependency graph
requires:
  - phase: 153-kb-creation-tool-hooks
    provides: syncResource / hookCtx / hookSlug / markStale / invalidateKbIndex (frozen contract); /api/cat-paws gold-standard hook pattern
  - phase: 149-kb-foundation-bootstrap
    provides: knowledge-sync.ts service + ENTITY_SUBDIR['canvas'] slot
provides:
  - POST /api/canvas fires syncResource('canvas','create') + invalidateKbIndex; markStale on failure
  - PATCH /api/canvas/[id] fires syncResource('canvas','update') after the updates.length===1 short-circuit
  - DELETE /api/canvas/[id] fires syncResource('canvas','delete',{id}) with soft-delete semantics (markDeprecated — no fs.unlink)
  - delete_catflow sudo tool migrated from hard-DELETE to async soft-delete; purge:true opt-in for hard-delete with no KB sync
  - 10 integration tests (5 canvas routes + 5 sudo) pinning the KB-40/KB-41 contract
affects: [156-02-link-tools-resync, 156-03-orphan-cleanup, v29.1 milestone, CatBot oracle prompts "crea canvas" + "borra canvas"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mirror byte-identical of /api/cat-paws/* KB hook block for a 6th entity (canvas)"
    - "Sudo tool async conversion: sync function → async + `await` at dispatcher + optional purge opt-in flag"
    - "Inline ensureTables() test fixture with ALTER TABLE guards to work around db.ts bootstrap ordering quirk (ALTER pre-CREATE for canvases on fresh DB)"

key-files:
  created:
    - app/src/lib/__tests__/canvas-api-kb-sync.test.ts
    - app/src/lib/__tests__/catbot-sudo-delete-catflow.test.ts
  modified:
    - app/src/app/api/canvas/route.ts
    - app/src/app/api/canvas/[id]/route.ts
    - app/src/lib/services/catbot-sudo-tools.ts

key-decisions:
  - "Mirror /api/cat-paws/* byte-for-byte (Phase 153 gold standard) rather than redesign hook pattern"
  - "Keep {params: {id: string}} sync form for /api/canvas/[id] (project-wide inconsistency; minimize diff)"
  - "PATCH hook placed AFTER the updates.length === 1 short-circuit so empty PATCH bodies do not fire syncResource (saves version bump noise)"
  - "DELETE pre-SELECT extended from SELECT id → SELECT id, name so markStale path has the real slug on failure"
  - "delete_catflow purge:true flag documented on the tool schema — operator opt-in; default is soft-delete"
  - "Inline ensureTables() guards canvas schema with ALTER TABLE ADD COLUMN (listen_mode/external_input/next_run_at/node_count) because db.ts runs ALTER at L215 before CREATE at L978 on a fresh DB — the 4 columns end up missing"

patterns-established:
  - "KB write-path hook on 6th entity (canvas): syncResource('canvas', op, row|{id}, hookCtx('api:canvas.<METHOD>')) + invalidateKbIndex / markStale catch"
  - "Sudo tool async opt-in flag: a destructive sudo tool gets `purge:true` to skip KB sync, default path is soft-delete"

requirements-completed: [KB-40, KB-41]

# Metrics
duration: 7min
completed: 2026-04-20
---

# Phase 156 Plan 01: Canvas Sync Hooks Summary

**Canvas API (POST/PATCH/DELETE) and delete_catflow sudo tool now mirror the Phase 153 KB syncResource hook pattern byte-identically, closing gaps KB-40 and KB-41.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-20T19:58:02Z
- **Completed:** 2026-04-20T20:05:07Z
- **Tasks:** 3 / 3
- **Files modified:** 5 (3 productive + 2 new tests)

## Accomplishments

- Closed KB-40: canvas write-path (POST/PATCH/DELETE) now produces the same DB→KB sync lifecycle that CatPaws/connectors/catbrains/skills/email-templates already had since Phase 153.
- Closed KB-41: `delete_catflow` sudo tool soft-deletes the KB mirror by default (status: deprecated + deprecated_by: catbot-sudo:delete_catflow), with `purge:true` opt-in for hard-delete.
- Pinned both contracts with 10 integration tests (5 canvas + 5 sudo) covering happy paths, failure paths (markStale + logger.error + no invalidateKbIndex), and guards (CONFIRM_REQUIRED, AMBIGUOUS, noop PATCH short-circuit).
- Phase 153 regression suite (kb-hooks-api-routes.test.ts + kb-hooks-tools.test.ts + kb-index-cache.test.ts) stays 44/44 green.

## Task Commits

Each task was committed atomically:

1. **Task 1 (Wave 0 RED): canvas-api-kb-sync + catbot-sudo-delete-catflow tests** - `06a2b04` (test)
2. **Task 2 (Wave 1): Canvas API POST/PATCH/DELETE hooks** - `f857f56` (feat)
3. **Task 3 (Wave 1): delete_catflow soft-delete migration** - `0d11705` (feat)

## Files Created/Modified

- `app/src/app/api/canvas/route.ts` — POST hook wired (imports + post-INSERT SELECT-back + try/catch syncResource + markStale('create-sync-failed')).
- `app/src/app/api/canvas/[id]/route.ts` — PATCH hook wired (after UPDATE, after noop short-circuit); DELETE hook wired (pre-SELECT extended to SELECT id, name; post-DELETE try/catch + markStale('delete-sync-failed') with hookCtx reason).
- `app/src/lib/services/catbot-sudo-tools.ts` — `deleteCatFlow` converted `function → async function`; dispatcher uses `await`; `purge:true` param added to SUDO_TOOLS schema; default branch calls `syncResource('canvas','delete',{id}, hookCtx('catbot-sudo:delete_catflow', {reason:...}))` + `invalidateKbIndex()`; purge branch only logs; failure branch writes markStale('delete-sync-failed') with `details.entity === 'canvases'`.
- `app/src/lib/__tests__/canvas-api-kb-sync.test.ts` (new, 330 LOC) — T1 POST hook, T2 PATCH hook + version bump, T3 DELETE soft-delete, T4 failure path invariants, T5 PATCH noop short-circuit.
- `app/src/lib/__tests__/catbot-sudo-delete-catflow.test.ts` (new, 350 LOC) — T1 soft-delete happy path, T2 CONFIRM_REQUIRED, T3 AMBIGUOUS, T4 purge:true, T5 failure path.

## Decisions Made

- **Byte-identical mirror of `/api/cat-paws/*`** — no redesign. All four helpers (syncResource, hookCtx, hookSlug, markStale, invalidateKbIndex) have frozen signatures; author strings follow the `api:canvas.<METHOD>` convention from Phase 153.
- **Synchronous params form `{ params: { id: string } }` preserved** for `/api/canvas/[id]` — project-wide inconsistency exists (`/api/connectors/[id]`, `/api/skills/[id]` are also sync), changing it would balloon the diff. `/api/cat-paws/[id]` uses the Promise-based form but that's an outlier.
- **PATCH hook placed AFTER the short-circuit** at `updates.length === 1` so empty PATCH bodies (only `updated_at` added) do not fire `syncResource` — verified by T5 (`syncSpy not called`).
- **DELETE pre-SELECT extended to `SELECT id, name FROM canvases`** so `markStale` has the real slug on the failure path (mirror of `/api/cat-paws/[id]` DELETE which does the same).
- **`purge:true` explicit opt-in flag** added to `delete_catflow` SUDO_TOOLS schema + tool description. Default behavior is soft-delete; operator must pass `purge:true` to hard-delete without KB sync. Orphan is swept by next `--audit-stale` cycle.
- **Test fixture `ensureTables()` patches canvases schema inline** with ALTER TABLE guards for `listen_mode` / `external_input` / `next_run_at` / `node_count`. Root cause: `db.ts:215` runs `ALTER TABLE canvases ADD COLUMN listen_mode` BEFORE `db.ts:978` runs `CREATE TABLE IF NOT EXISTS canvases`. On a fresh test DB, the ALTER silently fails (no table yet), then CREATE creates the table WITHOUT those columns. Production DBs have the columns because they were created long ago. Not worth refactoring db.ts for Phase 156 — inline patch in tests is the pragmatic fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `logger.info('catbot-sudo', ...)` rejected by TypeScript LogSource union**
- **Found during:** Task 3 (delete_catflow migration)
- **Issue:** `src/lib/services/catbot-sudo-tools.ts(772,19): error TS2345: Argument of type '"catbot-sudo"' is not assignable to parameter of type 'LogSource'.` The plan recommended `logger.info('catbot-sudo', ...)` in the purge branch but `'catbot-sudo'` is not a declared LogSource in `logger.ts:6-22`.
- **Fix:** Replaced source with existing `'catbot'` LogSource (matches the existing `logger.info('catbot', 'CatFlow eliminado via sudo tool', ...)` call on the same code path).
- **Files modified:** `app/src/lib/services/catbot-sudo-tools.ts`
- **Verification:** `npx tsc --noEmit` scoped to `catbot-sudo|canvas|knowledge-sync|kb-*` is clean (remaining 3 errors are pre-existing in unrelated test files).
- **Committed in:** `0d11705` (Task 3 commit)

**2. [Rule 3 - Blocking] Test fixture `ensureTables` schema mismatch with real canvases table (listen_mode missing)**
- **Found during:** Task 1 (Wave 0 RED — sudo tests failed with `SqliteError: no such column: listen_mode`)
- **Issue:** `delete_catflow` prepares `SELECT id, name, status, mode, listen_mode, is_template, created_at, updated_at FROM canvases`. On a fresh test DB, `db.ts` runs `ALTER TABLE canvases ADD COLUMN listen_mode` (L215) BEFORE `CREATE TABLE canvases` (L978), so the ALTER silently fails in its try/catch and the resulting table lacks `listen_mode`, `external_input`, `next_run_at`, `node_count`.
- **Fix:** `ensureTables()` in both new test files runs the CREATE then idempotent ALTER TABLE ADD COLUMN guards for each missing column. Matches production schema without modifying `db.ts`.
- **Files modified:** `app/src/lib/__tests__/canvas-api-kb-sync.test.ts`, `app/src/lib/__tests__/catbot-sudo-delete-catflow.test.ts`
- **Verification:** 10/10 tests green after the patch.
- **Committed in:** `06a2b04` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 3 - Blocking)
**Impact on plan:** Both auto-fixes were pure compile/runtime unblocks, not scope changes. No new design, no new APIs, no scope creep.

## Issues Encountered

None beyond the 2 deviations above. TDD RED gate fired on the hook assertions exactly as intended (not on setup/import errors), allowing GREEN implementation to proceed directly.

## User Setup Required

None — no external service configuration required. All changes are internal to DocFlow + KB filesystem.

## Next Phase Readiness

- **Plan 156-02 (link-tools-resync)** can proceed — touches `catbot-tools.ts` (different file) and `knowledge-sync.ts` (buildBody extension). Disjoint from this plan's files.
- **Plan 156-03 (orphan cleanup)** can proceed independently.
- **CatBot oracle prompts deferred to `/gsd:verify-phase`:** "Crea un canvas llamado Test156" (Prompt 1) and "Borra el canvas Test156" (Prompt 2) — both hooks now in place, but full end-to-end verification requires Docker rebuild (not done in this plan, scoped to phase close per VALIDATION.md §Manual-Only).
- **No blockers.**

---
*Phase: 156-kb-runtime-integrity*
*Completed: 2026-04-20*

## Self-Check: PASSED

- FOUND: `app/src/app/api/canvas/route.ts`
- FOUND: `app/src/app/api/canvas/[id]/route.ts`
- FOUND: `app/src/lib/services/catbot-sudo-tools.ts`
- FOUND: `app/src/lib/__tests__/canvas-api-kb-sync.test.ts`
- FOUND: `app/src/lib/__tests__/catbot-sudo-delete-catflow.test.ts`
- FOUND: `.planning/phases/156-kb-runtime-integrity/156-01-SUMMARY.md`
- FOUND commit: `06a2b04` (test)
- FOUND commit: `f857f56` (feat — canvas routes)
- FOUND commit: `0d11705` (feat — delete_catflow)

