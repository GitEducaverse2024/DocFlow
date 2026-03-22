# Phase 60 Research: Execution Cycles + Scheduler

## Current State

### Schema (Phase 57 — already in place)
- `tasks.execution_mode` — 'single' | 'variable' | 'scheduled' (default 'single')
- `tasks.execution_count` — number of times to run (variable mode)
- `tasks.run_count` — current execution counter
- `tasks.last_run_at`, `tasks.next_run_at` — timestamps
- `tasks.schedule_config` — JSON: {time, days, custom_days, start_date, end_date, is_active}
- `task_schedules` table — id, task_id (FK), next_run_at, is_active, run_count, last_run_at, created_at, updated_at

### Schedule Utility (Phase 59 — already in place)
- `app/src/lib/schedule-utils.ts`:
  - `calculateNextExecution(config: ScheduleConfig): Date | null` — 14-day lookahead
  - `formatNextExecution(date: Date | null, locale: string): string`
- `app/src/lib/schedule-utils.test.ts` — 13 tests with Vitest fake timers

### Task Executor (current)
- `app/src/lib/services/task-executor.ts` (~600 lines)
- `executeTask(taskId)` — sequential pipeline, handles agent/checkpoint/merge/canvas/fork/join
- Fire-and-forget from `/api/tasks/[id]/execute` route
- On completion: sets status='completed', result_output, total_tokens, total_duration
- On failure: sets status='failed', creates error notification, returns early
- In-memory `runningTasks` Map for cancel support

### Wizard (Phase 59)
- Ciclo section creates execution_mode + execution_count + schedule_config
- API POST/PATCH already persist these fields
- task_schedules row created on POST when mode='scheduled'

### Task Detail Page
- Does NOT yet reference execution_mode, schedule, or run_count
- Needs schedule activation/deactivation toggle

## Gap Analysis

### What's Missing for Phase 60

1. **Variable mode execution loop** — executeTask() currently runs pipeline once. Need wrapper that runs N times sequentially, incrementing run_count, stopping on failure.

2. **Scheduled mode execution** — No background scheduler exists. Need:
   - Internal setInterval (60s poll interval)
   - Query task_schedules WHERE is_active=1 AND next_run_at <= now
   - Execute due tasks
   - Calculate next_run_at using calculateNextExecution()
   - Deactivate on end_date exceeded

3. **Scheduler lifecycle** — Needs to start/stop with the app. Options:
   - Next.js instrumentation.ts (runs once on server start)
   - API route that self-starts on first request
   - Custom server entry point

4. **Schedule toggle API** — PATCH /api/tasks/[id] already handles execution_mode changes. Need explicit is_active toggle on task_schedules.

5. **Task detail UI** — Schedule section with is_active toggle, next execution preview, run count display.

6. **Step reset between runs** — Variable/scheduled re-runs need all steps reset to 'pending' before each execution.

## Architecture Decisions

### Scheduler Location
**Decision**: Use Next.js `instrumentation.ts` to start a singleton scheduler on server boot.
**Why**:
- Runs automatically when the app starts
- No external cron/service needed
- Clean lifecycle (starts once, runs in-process)
- Compatible with Docker deployment

### Variable Mode Implementation
**Decision**: Wrap executeTask() in a loop within a new `executeTaskWithCycles()` function.
**Why**:
- Keeps executeTask() unchanged (single pipeline run)
- Clean separation — cycle logic wraps pipeline logic
- Easy to test independently

### Step Reset Strategy
**Decision**: Reset all task_steps to 'pending' and clear output before each re-run.
**Why**:
- Each cycle starts fresh (no stale state from previous run)
- Matches user expectation: "run this 5 times" means 5 full executions
- Keep result_output from last successful run

### Scheduler Concurrency Guard
**Decision**: Skip tasks already in 'running' state.
**Why**: Prevents double-execution if a scheduled task is still running when the next tick fires.

## Key Files to Modify

| File | Changes |
|------|---------|
| `lib/services/task-executor.ts` | Add `executeTaskWithCycles()` wrapper |
| `lib/services/task-scheduler.ts` | **NEW** — Scheduler service (setInterval, poll, execute, next_run_at) |
| `instrumentation.ts` | **NEW** — Start scheduler on server boot |
| `app/api/tasks/[id]/execute/route.ts` | Route through executeTaskWithCycles() instead of executeTask() |
| `app/api/tasks/[id]/schedule/route.ts` | **NEW** — PATCH toggle is_active |
| `app/tasks/[id]/page.tsx` | Add schedule info section + toggle |
| `lib/schedule-utils.ts` | Add `calculateNextExecutionFromNow()` variant for scheduler (uses arbitrary base date, not just "now") |
| `lib/schedule-utils.test.ts` | Tests for new scheduler utility function |
| `lib/services/task-scheduler.test.ts` | **NEW** — Unit tests for scheduler logic |
