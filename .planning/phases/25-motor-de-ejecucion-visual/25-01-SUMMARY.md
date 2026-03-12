---
phase: 25-motor-de-ejecucion-visual
plan: 01
subsystem: canvas-executor
tags: [canvas, execution-engine, dag, topological-sort, api-routes, checkpoint, usage-tracking]
dependency_graph:
  requires: [24-01, 24-02, 24-03]
  provides: [canvas execution backend, execution API routes]
  affects: [usage_logs, canvas_runs]
tech_stack:
  added: []
  patterns: [fire-and-forget execution, in-memory cancel map, DAG topological sort (Kahn)]
key_files:
  created:
    - app/src/lib/services/canvas-executor.ts
    - app/src/app/api/canvas/[id]/execute/route.ts
    - app/src/app/api/canvas/[id]/run/[runId]/status/route.ts
    - app/src/app/api/canvas/[id]/run/[runId]/checkpoint/[nodeId]/approve/route.ts
    - app/src/app/api/canvas/[id]/run/[runId]/checkpoint/[nodeId]/reject/route.ts
    - app/src/app/api/canvas/[id]/run/[runId]/cancel/route.ts
  modified:
    - app/src/lib/services/usage-tracker.ts
    - app/src/lib/db.ts
decisions:
  - topologicalSort exported from canvas-executor.ts (used by execute route and validate route)
  - checkpoint uses 'waiting' status (not 'running' like task-executor.ts) for DAG clarity
  - resumeAfterCheckpoint is async (calls executeCanvas fire-and-forget internally)
  - generateId() used for run IDs (not crypto.randomUUID, unavailable in HTTP context)
  - db.ts startup cleanup now resets both 'running' AND 'waiting' canvas_runs to 'failed'
metrics:
  duration: 199s
  completed_date: "2026-03-12"
  tasks: 2
  files_created: 6
  files_modified: 2
---

# Phase 25 Plan 01: Canvas Execution Engine Backend Summary

**One-liner:** DAG executor with Kahn topological sort, node dispatch by type (agent/project/connector/merge/condition/checkpoint/output), checkpoint pause/resume, cancel, and 5 REST API routes.

## What Was Built

### canvas-executor.ts (new, 580+ lines)

Full DAG execution engine for canvas workflows:

- **topologicalSort(nodes, edges)**: Kahn's algorithm, exported for use in execute route and validate route.
- **executeCanvas(canvasId, runId)**: Main execution loop — iterates topological order, dispatches by node type, handles checkpoint pause, condition branch skipping, cancel checks. Updates `canvas_runs.node_states` JSON after every node.
- **cancelExecution(runId)**: Sets in-memory cancelled flag + immediately updates DB to 'cancelled'.
- **resumeAfterCheckpoint(runId, checkpointNodeId, approved, feedback?)**: Approve marks checkpoint 'completed' and resumes; reject resets predecessor to 'pending' with feedback stored in node state, then resumes.
- **dispatchNode**: Switch on node.type — agent (callLLM + optional RAG), project (getRagContext only), connector (HTTP fetch), checkpoint (passthrough, main loop handles waiting), merge (concatenate or callLLM if agent configured), condition (LLM yes/no evaluation), output (passthrough with optional JSON format), start (passthrough).
- Each LLM-calling node logs usage with `event_type: 'canvas_execution'`.

### API Routes (5 new files)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/canvas/[id]/execute` | POST | Creates canvas_run, fires executeCanvas |
| `/api/canvas/[id]/run/[runId]/status` | GET | Returns node_states, elapsed, tokens, progress |
| `/api/canvas/[id]/run/[runId]/checkpoint/[nodeId]/approve` | POST | Resumes execution after checkpoint |
| `/api/canvas/[id]/run/[runId]/checkpoint/[nodeId]/reject` | POST | Resets predecessor with feedback, re-executes |
| `/api/canvas/[id]/run/[runId]/cancel` | POST | Cancels running execution |

All routes export `dynamic = 'force-dynamic'` and use `process['env']` bracket notation.

### Modifications

- **usage-tracker.ts**: Added `'canvas_execution'` to `UsageEvent.event_type` union type.
- **db.ts**: Added `UPDATE canvas_runs SET status = 'failed' WHERE status = 'waiting'` to startup cleanup (alongside existing 'running' cleanup).

## Deviations from Plan

None — plan executed exactly as written.

The `generateId` import in canvas-executor.ts is voided at file end (`void generateId`) because the execute route imports it directly rather than via the executor — this is correct architecture since topologicalSort is what the route needs from the executor, and generateId is used in the route itself.

## Self-Check: PASSED

All 8 files found. Commits `28bd978` and `7966781` exist. Build passes with all 5 new canvas API routes listed as dynamic. canvas-executor.ts exports: topologicalSort, executeCanvas, cancelExecution, resumeAfterCheckpoint. usage-tracker.ts contains 'canvas_execution'. All routes have force-dynamic.
