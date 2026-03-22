---
phase: "65"
plan: "03"
subsystem: canvas-executor
tags: [scheduler, executor, signal-api, multi-handle, cas]
dependency_graph:
  requires: []
  provides: [scheduler-execution, signal-api, multi-handle-skipping]
  affects: [canvas-executor, status-endpoint]
tech_stack:
  added: []
  patterns: [db-level-cas, recursive-cycle-execution, bfs-upstream-reset]
key_files:
  created:
    - app/src/app/api/canvas/[id]/run/[runId]/signal/route.ts
  modified:
    - app/src/lib/services/canvas-executor.ts
    - app/src/app/api/canvas/[id]/run/[runId]/status/route.ts
decisions:
  - Array.from() used for Set iteration to avoid downlevelIteration TS requirement (consistent with phase 62-03 pattern)
metrics:
  duration_seconds: 209
  completed: "2026-03-22T11:52:23Z"
---

# Phase 65 Plan 03: Executor Logic + Signal API + Multi-Handle Routing Summary

Scheduler dispatch with delay/count/listen modes, N-branch skip fix via edges.filter, signal API with CAS race prevention, and count-mode cycle re-execution via recursive executeCanvas calls.

## What Was Done

### Task 1: Canvas Executor Changes (6 sub-tasks)

**1a. getSkippedNodes fix (SCHED-08):** Replaced `edges.find()` with `edges.filter()` to collect ALL rejected edges from multi-handle nodes. Previously only the first rejected branch was skipped; now all non-chosen branches (e.g., scheduler's 3 handles) are correctly skipped. Parameter renamed from `conditionNodeId` to `branchNodeId` for clarity.

**1b. convertToMs helper:** Simple switch function converting seconds/minutes/hours to milliseconds for delay mode.

**1c. dispatchNode scheduler case:** Three modes:
- **delay**: Awaits setTimeout for configured duration, returns `output-true`
- **count**: Reads/writes cycle counter in `canvas_runs.metadata.scheduler_counts`, returns `output-true` (continue) or `output-completed` (done)
- **listen**: Returns predecessorOutput immediately; the executeCanvas loop handles the waiting state transition

**1d. executeCanvas scheduler handling:** Three new blocks:
- **Listen-mode waiting**: Sets node to 'waiting', stores `waiting_since` and `listen_timeout` in metadata, pauses execution
- **Branch skipping**: Marks non-chosen scheduler branches as skipped via getSkippedNodes
- **Count-mode cycle re-execution**: BFS walks upstream to find nodes between control boundaries, resets them to pending, recursively calls executeCanvas

**1e. resumeAfterSignal:** Marks scheduler node completed with chosen output handle, applies branch skipping, cleans up scheduler_waiting metadata, resumes execution fire-and-forget.

**1f. Removed unused generateId import and void statement.**

### Task 2: Signal API Endpoint (SCHED-09)

Created `POST /api/canvas/[id]/run/[runId]/signal` with:
- Input validation (node_id required, run must be waiting, node must be waiting)
- DB-level CAS (`UPDATE ... WHERE status = 'waiting'`) to prevent race conditions with concurrent timeout auto-resolution
- 409 response on CAS failure (duplicate signal or timeout already handled)
- Calls `resumeAfterSignal` on success

### Task 3: Status Endpoint Timeout Checking

Updated status endpoint to:
- Added `metadata` to SELECT query
- Check `scheduler_waiting` entries for timeout expiration
- Use DB-level CAS to atomically claim timeout resolution
- Call `resumeAfterSignal(runId, nodeId, false)` to auto-resolve with output-false
- Re-fetch and return updated state after auto-resolution

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Set iteration TypeScript error**
- **Found during:** Task 1d (count-mode cycle re-execution)
- **Issue:** `for (const resetId of upstreamToReset)` with `Set<string>` fails without `--downlevelIteration` flag
- **Fix:** Changed to `Array.from(upstreamToReset)` (consistent with phase 62-03 pattern)
- **Files modified:** `app/src/lib/services/canvas-executor.ts`
- **Commit:** 36c981d

## Verification

- [x] `getSkippedNodes` uses `edges.filter()` (not `edges.find()`) -- handles all rejected branches
- [x] `dispatchNode` handles `case 'scheduler'` with all 3 modes (delay, count, listen)
- [x] Delay mode: `await new Promise(resolve => setTimeout(resolve, ms))` then returns `{ output: 'output-true' }`
- [x] Count mode: reads/writes `canvas_runs.metadata`, increments counter, returns `output-true` or `output-completed`
- [x] Count mode cycle re-execution: upstream nodes reset to pending, `executeCanvas` called recursively
- [x] Listen mode: sets nodeState to 'waiting', stores timeout info in metadata, pauses execution
- [x] `resumeAfterSignal` marks scheduler completed, skips non-chosen branches, resumes execution
- [x] Signal API: POST with `{ node_id, signal }` resumes with output-true or output-false
- [x] Signal API: returns 409 if CAS fails
- [x] Signal API: returns 400 if run/node not in 'waiting' status
- [x] Status endpoint: auto-resolves listen timeout with output-false using DB-level CAS
- [x] Status endpoint: concurrent polls do NOT trigger duplicate `resumeAfterSignal` calls (CAS guard)
- [x] TypeScript compiles without errors in modified files

## Commits

| Commit | Description |
|--------|-------------|
| 36c981d | feat(65-03): add scheduler executor logic, signal API, and multi-handle routing fix |
