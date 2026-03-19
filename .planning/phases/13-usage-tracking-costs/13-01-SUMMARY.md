---
phase: 13-usage-tracking-costs
plan: 01
subsystem: usage-tracking
tags: [usage, costs, instrumentation, settings]
dependency_graph:
  requires: [12-01]
  provides: [usage-tracker-service, usage-logging, cost-settings]
  affects: [task-executor, process-route, chat-route, rag-route, agent-generate, settings-page]
tech_stack:
  added: []
  patterns: [logUsage-helper, try-catch-non-blocking]
key_files:
  created:
    - app/src/lib/services/usage-tracker.ts
    - app/src/app/api/settings/route.ts
  modified:
    - app/src/lib/services/task-executor.ts
    - app/src/app/api/projects/[id]/process/route.ts
    - app/src/app/api/projects/[id]/chat/route.ts
    - app/src/app/api/projects/[id]/rag/create/route.ts
    - app/src/app/api/agents/generate/route.ts
    - app/src/app/settings/page.tsx
decisions:
  - "logUsage() is synchronous (better-sqlite3) wrapped in try-catch for non-blocking behavior"
  - "Cost calculation uses fuzzy model matching (includes/contains) for flexibility"
  - "Agent generate tracks duration but not tokens (llm.ts returns string only)"
  - "RAG index tracks duration and chunk count, no LLM tokens"
  - "Generic /api/settings route created for key-value settings CRUD"
metrics:
  completed: "2026-03-11T18:00:00Z"
  tasks_completed: 7
  tasks_total: 7
---

# Phase 13 Plan 1: Usage Tracking + Cost Settings Summary

Created usage-tracker service, instrumented 6 endpoint types for usage logging, added cost calculation from model pricing, and built editable pricing table in settings.

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Create usage-tracker.ts | d5329f7 | logUsage(), getModelPricing(), calculateCost() |
| 2 | Instrument process endpoint | (prev) | USAGE-01: process event with tokens |
| 3 | Instrument chat endpoint | (prev) | USAGE-02: chat event with tokens |
| 4 | Instrument RAG + agent generate | d5329f7 | USAGE-03: rag_index, USAGE-04: agent_generate |
| 5 | Instrument task executor | d5329f7 | USAGE-05: task_step, USAGE-06: connector_call |
| 6 | Cost settings UI | d5329f7 | COST-01+02: editable pricing table |
| 7 | Verify build | -- | npm run build passes |

## Key Details

### Usage Tracker Service
- `logUsage(event)`: Inserts into usage_logs, wrapped in try-catch
- `getModelPricing()`: Reads model_pricing JSON from settings table
- `calculateCost(model, input, output)`: Fuzzy model match, returns estimated cost

### Instrumented Endpoints
| Event Type | Endpoint | Tokens | Duration |
|-----------|----------|--------|----------|
| process | /api/projects/{id}/process | prompt+completion | yes |
| chat | /api/projects/{id}/chat | prompt+completion | yes |
| rag_index | /api/projects/{id}/rag/create | no (embeddings) | yes |
| agent_generate | /api/agents/generate | no (llm.ts string) | yes |
| task_step | task-executor (agent+merge) | input+output | yes |
| connector_call | task-executor (connectors) | no | yes |

### Settings Page
- New "Costes de modelos" section between Processing and Embeddings
- Editable table: model, provider, input_price ($/1M), output_price ($/1M)
- Add/remove rows, save to settings table as JSON

### New API
- GET /api/settings?key=model_pricing — Read setting by key
- POST /api/settings { key, value } — Write setting

## Deviations from Plan
- Process and chat endpoints were already instrumented by a partial previous run
- Agent generate logs duration only (llm.ts chatCompletion returns string, not usage)
- callLLM in task-executor extended to return input_tokens/output_tokens

## Verification Results
- npm run build passes without errors
- All 6 event types have logUsage calls
- Cost calculation uses model pricing from settings
- Settings page renders editable pricing table
