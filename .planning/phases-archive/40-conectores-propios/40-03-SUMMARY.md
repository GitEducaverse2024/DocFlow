---
phase: 40-conectores-propios
plan: 03
title: "Connector Execution Engine"
subsystem: execution
tags: [connectors, catbrain, mcp, canvas, tasks]
dependency_graph:
  requires: [40-01]
  provides: [catbrain-connector-execution, catbrain-to-catbrain-mcp]
  affects: [canvas-executor, task-executor]
tech_stack:
  added: []
  patterns: [parallel-connector-execution, abort-controller-timeout, json-rpc-mcp]
key_files:
  created:
    - app/src/lib/services/catbrain-connector-executor.ts
  modified:
    - app/src/lib/services/canvas-executor.ts
    - app/src/lib/services/task-executor.ts
decisions:
  - "formatConnectorResults as shared helper for both executors"
  - "CatBrain connectors in task executor iterate all linkedProjects, executing connectors for each"
  - "connector_mode defaults to 'both' — backward compatible with existing canvas nodes"
metrics:
  duration: 140s
  completed: "2026-03-14"
requirements: [CONN-05, CONN-06]
---

# Phase 40 Plan 03: Connector Execution Engine Summary

Shared catbrain connector executor with parallel execution, 15s per-connector timeout, and JSON-RPC MCP support for CatBrain-to-CatBrain RAG queries. Wired into both Canvas and Task executors.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create catbrain-connector-executor service | 3c6b275 | catbrain-connector-executor.ts |
| 2 | Wire connector executor into Canvas and Task executors | d62a216 | canvas-executor.ts, task-executor.ts |

## Key Implementation Details

### executeCatBrainConnectors
- Queries `catbrain_connectors WHERE catbrain_id = ? AND is_active = 1`
- Runs all active connectors in parallel via `Promise.allSettled`
- Each connector gets its own `AbortController` with 15s timeout
- Returns `ConnectorResult[]` with success/failure per connector

### Connector Type Handling
- **n8n_webhook**: POST with `{ query, source, catbrain_id }`
- **http_api**: Configurable method, `{{query}}` substitution in URL and body_template
- **mcp_server**: JSON-RPC to `tools/call` > `search_knowledge` for CatBrain-to-CatBrain RAG
- **email**: Skipped during automatic execution (fire-and-forget notification)

### Canvas Executor Integration
- `connector_mode` from node data controls behavior: `'connector'` (skip RAG), `'both'` (default), or absent (RAG only)
- Connector results appended alongside RAG context in node output

### Task Executor Integration
- For each `linkedProject` (catbrain), executes its connectors automatically
- Results injected into user prompt before LLM call
- Additive to existing global connector logic (connector_config on task_steps)

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. `tsc --noEmit` - zero errors
2. `npm run build` - all routes compile
3. `catbrain-connector-executor.ts` exports `executeCatBrainConnectors` and `formatConnectorResults`
4. `canvas-executor.ts` imports and calls `executeCatBrainConnectors`
5. `task-executor.ts` imports and calls `executeCatBrainConnectors`

## Self-Check: PASSED
