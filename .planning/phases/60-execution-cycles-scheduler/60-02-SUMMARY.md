---
phase: 60-execution-cycles-scheduler
plan: "02"
subsystem: task-scheduler
tags: [scheduler, instrumentation, cron, execution]
dependency_graph:
  requires: [60-01]
  provides: [task-scheduler-service, instrumentation-hook]
  affects: [tasks-api, task-schedules]
tech_stack:
  added: [instrumentation.ts]
  patterns: [singleton-scheduler, fire-and-forget, setInterval-polling]
key_files:
  created:
    - app/src/lib/services/task-scheduler.ts
    - app/src/lib/services/task-scheduler.test.ts
    - app/src/instrumentation.ts
  modified:
    - app/src/app/api/tasks/route.ts
    - app/src/app/api/tasks/[id]/route.ts
    - app/src/lib/logger.ts
decisions:
  - "updateNextRun made non-private for testability (called via public method in tests)"
  - "PATCH handler also recalculates next_run_at when only schedule_config changes (no execution_mode sent)"
  - "No experimental flag needed for instrumentation.ts — Next.js 14.2 supports it natively"
metrics:
  duration: "3m 50s"
  completed: "2026-03-21"
  tasks: 4
  files: 6
---

# Phase 60 Plan 02: Task Scheduler Service Summary

TaskScheduler singleton with 60s polling, instrumentation.ts boot hook, and next_run_at seeding in task CRUD APIs.

## What Was Built

### TaskScheduler Service (`task-scheduler.ts`)
- `TaskScheduler` class with `start()`, `stop()`, `tick()`, `updateNextRun()` methods
- Polls every 60 seconds via `setInterval`
- `tick()` queries active schedules where `next_run_at <= now` and task not running/paused
- Resets task steps to pending before re-execution
- Sets task status to 'ready' before firing `executeTaskWithCycles()` (fire-and-forget)
- After execution completes (or fails), calls `updateNextRun()` to recalculate next slot
- Deactivates schedule (`is_active = 0`, `next_run_at = NULL`) when `calculateNextExecutionFromDate` returns null
- Overlapping tick prevention via `running` guard flag
- Exported as singleton `taskScheduler` and class `TaskScheduler`

### Instrumentation Hook (`instrumentation.ts`)
- `register()` function starts scheduler when `NEXT_RUNTIME === 'nodejs'`
- Uses bracket notation for `process['env']` per project convention
- Dynamic import avoids loading scheduler in edge runtime

### Task API Updates
- **POST `/api/tasks`**: Seeds `next_run_at` on both `task_schedules` and `tasks` tables when creating scheduled tasks
- **PATCH `/api/tasks/[id]`**: Recalculates `next_run_at` when `execution_mode` changes to scheduled, or when `schedule_config` changes on an already-scheduled task. Clears `next_run_at` when switching away from scheduled mode.

### Logger Extension
- Added `'scheduler'` to `LogSource` union type

## Tests

12 Vitest tests in `task-scheduler.test.ts`:
- start/stop: idempotent start, clears interval, safe double-stop
- tick: finds due schedules, triggers execution, no-op when empty, skips running/future tasks, handles execution errors gracefully
- updateNextRun: calculates and stores next run, deactivates when no valid runs, no-op for missing config/task

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] PATCH handler: schedule_config-only updates**
- **Found during:** Task 3
- **Issue:** If a user updates only `schedule_config` without sending `execution_mode`, `next_run_at` would not be recalculated
- **Fix:** Added else-if branch to detect schedule_config changes on already-scheduled tasks
- **Files modified:** `app/src/app/api/tasks/[id]/route.ts`

**2. [Rule 2 - Missing functionality] PATCH handler: clear next_run_at on mode change**
- **Found during:** Task 3
- **Issue:** Switching away from scheduled mode deleted the task_schedules row but left stale `next_run_at` on the tasks table
- **Fix:** Added `UPDATE tasks SET next_run_at = NULL` in the else branch
- **Files modified:** `app/src/app/api/tasks/[id]/route.ts`

**3. [Rule 1 - Bug] updateNextRun visibility for testing**
- **Found during:** Task 4
- **Issue:** `updateNextRun` was private, making it impossible to unit test directly
- **Fix:** Changed to non-private (no access modifier) — it is only used internally and via `.then()` callbacks
- **Files modified:** `app/src/lib/services/task-scheduler.ts`

## Verification

- `npx vitest run task-scheduler`: 12/12 tests pass
- `npm run build`: Clean build, no TypeScript errors
