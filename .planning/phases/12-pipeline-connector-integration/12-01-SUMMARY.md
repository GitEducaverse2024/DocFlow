---
phase: 12-pipeline-connector-integration
plan: 01
subsystem: pipeline-connectors
tags: [connectors, task-executor, agent-access, wizard]
dependency_graph:
  requires: [09-01-data-model, 10-01-connectors-api, 11-01-connectors-ui]
  provides: [connector-execution-hooks, agent-connector-access-ui, wizard-connector-selection]
  affects: [task-executor, agents-page, wizard, agent-api]
tech_stack:
  added: []
  patterns: [connector-before-after-hooks, agent-access-filtering, connector-config-json]
key_files:
  created: []
  modified:
    - app/src/lib/services/task-executor.ts
    - app/src/app/api/agents/[id]/route.ts
    - app/src/app/agents/page.tsx
    - app/src/app/tasks/new/page.tsx
decisions:
  - Connector failures logged but do not block task execution (fault-tolerant)
  - Before-connector responses injected as system message in LLM context
  - Connector config reset when agent changes in wizard step
metrics:
  duration: 228s
  completed: 2026-03-11
  tasks: 5
  files: 4
---

# Phase 12 Plan 01: Pipeline Connector Integration Summary

Connector execution hooks in task pipeline with before/after agent step invocation, agent access management UI, and wizard connector selection with mode control.

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Connector execution in task-executor | 705354d | executeConnectors() function, before/after hooks in executeAgentStep, connector_logs INSERT, times_used increment |
| 2 | Agent PATCH API connector access | 47800fd | GET handler with connector_ids, PATCH syncs agent_connector_access table |
| 3 | Agent page connector UI | e12f454 | "Conectores disponibles" checkboxes in edit sheet, fetch on edit, save in PATCH |
| 4 | Wizard connector selection | b2b5ff9 | ConnectorConfig in PipelineStep, per-agent connector fetch, checkbox+mode selector in SortableStepCard |
| 5 | Build verification | - | npm run build passes cleanly |

## Key Implementation Details

### Connector Execution Flow (task-executor.ts)
- `executeConnectors()` filters by mode ('before'/'after'/'both'), fetches connector config, calls URL with payload
- BEFORE hooks: execute before LLM call, responses appended to user context as system message
- AFTER hooks: execute after LLM call with step output and token metadata in payload
- All invocations logged to `connector_logs` with request/response/status/duration
- `times_used` counter incremented on each call
- Wrapped in try-catch so connector failures never crash the task

### Agent Access Management (agents/[id]/route.ts)
- New GET endpoint returns agent data + `connector_ids` from `agent_connector_access`
- PATCH accepts `connector_ids[]`, deletes existing access, inserts new entries

### Wizard Integration (tasks/new/page.tsx)
- Connectors fetched per-agent from `/api/connectors/for-agent/{agentId}` (already filtered by access)
- Each connector shows checkbox + mode selector (Antes/Despues/Ambos)
- `connector_config` JSON array stored in step data and sent to API on save

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **Fault-tolerant connectors**: Connector errors are caught and logged but do not fail the task step
2. **Context injection**: Before-connector responses added as system message with prefix markers
3. **Config reset on agent change**: When user selects a different agent, connector_config resets to empty

## Requirements Addressed

- CPIPE-02: Before-step connector execution
- CPIPE-03: After-step connector execution
- CPIPE-04: Connector payload with task/step/agent metadata
- CPIPE-05: Connector invocation logging in connector_logs
- CPIPE-06: Wizard connector selection with mode control
- CACCESS-01: Agent edit page connector checkboxes
- CACCESS-02: Agent save persists connector_ids to access table
- CACCESS-03: Wizard filters connectors by agent access
