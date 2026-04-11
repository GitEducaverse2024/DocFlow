---
phase: 133-foundation-tooling-found
plan: 03-job-reaper
subsystem: infra
tags: [intent-jobs, reaper, catflow-pipeline, setInterval, better-sqlite3, resilience]

requires:
  - phase: 133-02-resilience-llm
    provides: callLLM 90s AbortSignal timeout (first-line defense); this plan is the belt-and-braces layer above it
provides:
  - IntentJobExecutor.reapStaleJobs() — selects + kills intent_jobs rows stuck in non-terminal pipeline_phase > 10 min
  - IntentJobExecutor.startReaper() — idempotent setInterval(5min) wired from start()
  - IntentJobExecutor.stopReaperForTest() — test helper for timer-leak-free teardown
affects:
  - 133-04-intermediate-outputs-persistence (reaper guarantees jobs terminate → persistence layer has deterministic terminal events)
  - 136-validation-gate (no zombie jobs blocking the single executor slot during e2e runs)

tech-stack:
  added: []
  patterns:
    - belt-and-braces timeouts (fetch-level 90s AbortSignal + process-level 10min reaper)
    - idempotent service init via boolean guard (reaperStarted)
    - exclusion lists for legitimately long-lived phases (awaiting_user / awaiting_approval)

key-files:
  created: []
  modified:
    - app/src/lib/services/intent-job-executor.ts
    - app/src/lib/__tests__/intent-job-executor.test.ts

key-decisions:
  - Query uses pipeline_phase (not status) because 'strategist|decomposer|architect' are pipeline_phase values; status stays 'pending' during pipeline execution
  - Used catbotDb import instead of the default db import from @/lib/db — intent_jobs lives in catbot.db, not the main sources db
  - Reaper does NOT run immediately on start(); first fire is +5 min, which is still well inside the 10min stale threshold and avoids racing BOOT_DELAY cleanup
  - awaiting_user and awaiting_approval are hard-excluded — they can legitimately live for hours waiting on human input

patterns-established:
  - "Belt-and-braces defense: each async boundary should have a process-level watchdog even when the I/O layer already has a fetch timeout"
  - "Test helper pattern: stopXxxForTest() alongside startXxx() so test suites never leak timers"

requirements-completed: [FOUND-05]

duration: 6min
completed: 2026-04-11
---

# Phase 133 Plan 03: Job Reaper Summary

**Belt-and-braces reaper that kills intent_jobs stuck in strategist|decomposer|architect pipeline phases for >10min, notifying the user on the original channel before marking them failed.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-11T09:42:00Z
- **Completed:** 2026-04-11T09:48:00Z
- **Tasks:** 1 (TDD: RED → GREEN)
- **Files modified:** 2

## Accomplishments
- `reapStaleJobs()` scans every 5 min, kills rows older than 10 min in pipeline_phase IN (strategist, decomposer, architect) AND status NOT IN terminal set
- `startReaper()` wired from `IntentJobExecutor.start()` with idempotent double-init guard; `stop()` clears interval too
- Force-notifies user on original channel (telegram/web) with "⏱️ Pipeline timeout" before `markTerminal()` — users stop staring at phantom "processing" states
- Clears `currentJobId` if it pointed at a reaped row so the executor tick resumes picking up new jobs immediately
- awaiting_user / awaiting_approval hard-excluded — human-wait phases are allowed to live indefinitely

## Task Commits

1. **Task 1 RED** — `7cf7ec0` (test: failing tests for reapStaleJobs + startReaper)
2. **Task 1 GREEN** — `1f92685` (feat: implement reaper + wire into start/stop)

## Files Created/Modified

- `app/src/lib/services/intent-job-executor.ts` — added reaper fields (reaperStarted, reaperInterval, STALE_PHASES, STALE_THRESHOLD_SQL, REAPER_INTERVAL_MS), 3 new static methods (startReaper, reapStaleJobs, stopReaperForTest), imported `catbotDb`, wired `startReaper()` into `start()` and cleanup into `stop()`
- `app/src/lib/__tests__/intent-job-executor.test.ts` — new describe block "reapStaleJobs (Phase 133 FOUND-05)" with 4 tests covering happy path, no-op, exclusion list, double-init guard

## Decisions Made

- **catbotDb vs db:** The plan action used `db.prepare()` (from `@/lib/db`), but `intent_jobs` lives in `catbotDb`. Imported `catbotDb` directly from `@/lib/catbot-db` and used it for the reaper query. Plan deviation (Rule 3 — blocking wrong dependency) required to make the query hit the right table.
- **Filter on pipeline_phase, not status:** The plan's must_haves mentioned "status strategist|decomposer|architect" but those are `pipeline_phase` values. The SQL uses `pipeline_phase IN (...) AND status NOT IN ('failed','completed','cancelled')` to match the actual schema.
- **No immediate first-fire:** Unlike the plan's suggestion to run once right away, first reap fires at +5 min (the interval). Rationale: `start()` already has `BOOT_DELAY=60s`, and running the reaper before orphan cleanup completes could race. Stale threshold is 10 min, so +5 min first fire is still correct.
- **SQL datetime format in tests:** Used `YYYY-MM-DD HH:MM:SS` (sqlite's `datetime('now')` format) instead of ISO `T`/`Z`, because the reaper compares against `datetime('now', '-10 minutes')` which returns that exact format.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reaper query had to use catbotDb, not @/lib/db default**
- **Found during:** Task 1 GREEN implementation
- **Issue:** Plan's action snippet used `db.prepare(...)` (from `@/lib/db`), but `intent_jobs` is declared in `catbot-db.ts` on the separate `catbotDb` connection. Running the reaper query against the sources db would find no rows ever.
- **Fix:** Added `catbotDb` to the existing `@/lib/catbot-db` import and used `catbotDb.prepare(...).all(...)` for the reaper query. Left the existing `db` import in place for canvases/connectors inserts elsewhere in the file.
- **Files modified:** `app/src/lib/services/intent-job-executor.ts`
- **Verification:** Reaper test inserts rows directly into `catbotDbRef` (the real test DB) and the query now finds them.
- **Committed in:** `1f92685`

**2. [Rule 1 - Bug] Filter on pipeline_phase not status**
- **Found during:** Task 1 GREEN implementation
- **Issue:** Plan said "WHERE status IN ('strategist','decomposer','architect')" but in the real schema `status` is pending/failed/completed/cancelled and `pipeline_phase` holds the pipeline stage name.
- **Fix:** Query is `WHERE pipeline_phase IN ('strategist','decomposer','architect') AND status NOT IN ('failed','completed','cancelled') AND updated_at < datetime('now','-10 minutes')`.
- **Files modified:** `app/src/lib/services/intent-job-executor.ts`
- **Verification:** Exclusion test (awaiting_user/awaiting_approval) and happy path test both pass.
- **Committed in:** `1f92685`

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs — schema mismatch in the plan's SQL)
**Impact on plan:** Both fixes necessary for correctness — without them the reaper would never find anything. No scope creep.

## Issues Encountered
- None beyond the two auto-fixed schema mismatches above.

## User Setup Required
None.

## Verification

- **Unit tests:** `cd app && npm run test:unit -- intent-job-executor.test` → 31/31 pass (27 previous + 4 new reaper tests)
- **Build:** `cd app && npm run build` → compiles successfully
- **Grep:** `grep -n "reapStaleJobs\|startReaper" app/src/lib/services/intent-job-executor.ts` → 10 matches across definitions, invocations, log messages
- **Bootstrap wire:** `startReaper()` called inside `IntentJobExecutor.start()` at line 114, which itself is called from `src/instrumentation.ts`

## Next Phase Readiness

- Plan 133-04 (intermediate-outputs-persistence) can now rely on the reaper as the ultimate terminal-event generator: any job that disappears from active statuses will hit `markTerminal()` exactly once, either via happy path, callLLM timeout, or reaper.
- FOUND-05 closed. Remaining FOUND gaps for Phase 133: FOUND-06 (intermediate outputs persistence, Plan 04), FOUND-08/09 (test-pipeline.mjs, Plan 05).

---
*Phase: 133-foundation-tooling-found*
*Plan: 03-job-reaper*
*Completed: 2026-04-11*

## Self-Check: PASSED

- [x] `app/src/lib/services/intent-job-executor.ts` contains `reapStaleJobs`, `startReaper`, `stopReaperForTest`
- [x] `app/src/lib/__tests__/intent-job-executor.test.ts` contains `reapStaleJobs (Phase 133 FOUND-05)` describe block
- [x] Commit `7cf7ec0` exists (test RED)
- [x] Commit `1f92685` exists (feat GREEN)
- [x] 31/31 unit tests pass
- [x] `npm run build` compiles
