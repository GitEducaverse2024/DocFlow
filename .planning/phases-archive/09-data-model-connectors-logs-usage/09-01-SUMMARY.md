---
phase: 09-data-model-connectors-logs-usage
plan: 01
subsystem: data-model
tags: [sqlite, schema, types, connectors, usage, pricing]
dependency_graph:
  requires: []
  provides: [connectors-table, connector_logs-table, usage_logs-table, agent_connector_access-table, model-pricing-seed]
  affects: [task_steps]
tech_stack:
  added: []
  patterns: [CREATE-TABLE-IF-NOT-EXISTS, ALTER-TABLE-try-catch, settings-seed]
key_files:
  created: []
  modified:
    - app/src/lib/db.ts
    - app/src/lib/types.ts
decisions:
  - "Model pricing stored as JSON array in settings table (key: model_pricing)"
  - "Connector types: n8n_webhook, http_api, mcp_server, email"
  - "Usage event types: process, chat, rag_index, agent_generate, task_step, connector_call"
metrics:
  duration: 81s
  completed: "2026-03-11T15:57:38Z"
  tasks_completed: 5
  tasks_total: 5
---

# Phase 9 Plan 1: Data Model (Connectors, Logs, Usage) Summary

SQLite tables for connectors, connector logs, usage logs, and agent-connector access created with TypeScript interfaces and default model pricing seeded (6 models with per-1M-token pricing).

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Create connectors, connector_logs, usage_logs, agent_connector_access tables | bc6924e | 4 CREATE TABLE IF NOT EXISTS in single db.exec() |
| 2 | Add connector_config column to task_steps | f03dc3a | ALTER TABLE try-catch block |
| 3 | Seed default model pricing in settings | c1277cd | 6 models with input/output pricing |
| 4 | Add TypeScript interfaces to types.ts | 42aa51e | 4 interfaces + connector_config in TaskStep |
| 5 | Verify build | -- | npm run build passes |

## Key Details

### Tables Created

- **connectors**: id, name, description, emoji, type, config (JSON), is_active, test_status, last_tested, times_used, timestamps
- **connector_logs**: id, connector_id (FK CASCADE), task_id, task_step_id, agent_id, payloads, status, duration_ms, error_message
- **usage_logs**: id, event_type, project_id, task_id, agent_id, model, provider, tokens (in/out/total), estimated_cost (REAL), duration_ms, status, metadata (JSON)
- **agent_connector_access**: composite PK (agent_id, connector_id), FK CASCADE on connector_id

### Column Added

- **task_steps.connector_config**: TEXT, stores JSON array of `{connector_id, mode: 'before'|'after'|'both'}`

### Model Pricing Seeded

| Model | Provider | Input ($/1M) | Output ($/1M) |
|-------|----------|--------------|---------------|
| gemini-main | google | 0 | 0 |
| claude-sonnet-4-6 | anthropic | 3 | 15 |
| claude-opus-4-6 | anthropic | 15 | 75 |
| gpt-4o | openai | 2.5 | 10 |
| gpt-4o-mini | openai | 0.15 | 0.60 |
| ollama | ollama | 0 | 0 |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- All 4 tables present in db.ts with CREATE TABLE IF NOT EXISTS
- connector_logs has ON DELETE CASCADE for connector_id FK
- agent_connector_access has composite PRIMARY KEY
- usage_logs.estimated_cost is REAL type
- connector_config ALTER TABLE present
- model_pricing seed present with 6 models
- All 4 interfaces in types.ts
- connector_config in TaskStep interface
- npm run build passes without errors
