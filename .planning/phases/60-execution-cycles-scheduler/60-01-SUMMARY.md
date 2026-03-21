---
phase: 60-execution-cycles-scheduler
plan: 01
subsystem: task-execution
tags: [variable-cycles, schedule-utils, tdd]
dependency_graph:
  requires: [57-01, 58-01, 58-02]
  provides: [executeTaskWithCycles, calculateNextExecutionFromDate, resetTaskSteps]
  affects: [execute-route, task-executor]
tech_stack:
  added: []
  patterns: [tdd-red-green, thin-wrapper-refactor, sequential-cycle-loop]
key_files:
  created: []
  modified:
    - app/src/lib/schedule-utils.ts
    - app/src/lib/schedule-utils.test.ts
    - app/src/lib/services/task-executor.ts
    - app/src/app/api/tasks/[id]/execute/route.ts
decisions:
  - "Checkpoint steps rejected at execution time (not creation time) to avoid wizard complexity"
  - "run_count on tasks table is single source of truth for all execution modes"
  - "Variable cycle loop starts from current run_count, enabling resume from last successful cycle"
metrics:
  duration: ~3min
  completed: 2026-03-21
---

# Phase 60 Plan 01: Variable Execution Cycles + Schedule Utils Summary

Sequential N-times variable execution with cycle loop, step reset, checkpoint validation, and base-date schedule utility via TDD

## What Was Built

### calculateNextExecutionFromDate (schedule-utils.ts)
- New function accepting arbitrary base date instead of always using `new Date()`
- Existing `calculateNextExecution` refactored to thin wrapper: `return calculateNextExecutionFromDate(config, new Date())`
- 4 new tests added (17 total passing): past base date, past end_date, exact time match, weekday filter

### executeTaskWithCycles (task-executor.ts)
- Wraps existing `executeTask()` with variable-mode cycle loop
- For `execution_mode === 'variable'`: runs N sequential cycles, each waiting for previous completion
- `resetTaskSteps()` helper clears all step state (status, output, tokens, timestamps, feedback) between cycles
- Checkpoint validation: rejects variable-mode tasks containing checkpoint steps with clear error
- On failure: stops cycling immediately (CYCL-03)
- `run_count` incremented after each successful cycle
- For single/scheduled mode: runs once, increments run_count

### Execute API Route
- Replaced `executeTask(params.id)` with `executeTaskWithCycles(params.id)` in fire-and-forget call
- Same error handling pattern preserved

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| cdd679a | feat(60-01): add variable execution cycles and base-date schedule utils |

## Verification

- 17/17 schedule-utils tests passing (13 existing + 4 new)
- npm run build succeeds with no TypeScript errors
