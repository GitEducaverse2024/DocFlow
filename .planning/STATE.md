---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Conectores + Dashboard de Operaciones
status: in_progress
last_updated: "2026-03-11T16:09:22Z"
last_activity: 2026-03-11 — Completed 10-01 Connectors API CRUD
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 2
  completed_plans: 2
---

# Project State

## Current Position

Phase: 10 — Connectors API CRUD
Plan: 01 (complete)
Status: Phase 10 Plan 01 complete, ready for Phase 11
Last activity: 2026-03-11 — Completed 10-01 Connectors API CRUD

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.
**Current focus:** Conectores + Dashboard de Operaciones

## Milestone History

### v1.0 — Fix RAG Chat + Mejoras de indexacion (COMPLETE)
- 2 phases, 14 requirements, all complete

### v2.0 — Sistema de Tareas Multi-Agente (COMPLETE)
- 6 phases, 48 requirements, all complete
- Data model, API CRUD, execution engine, task list, wizard, execution view

## Decisions

- [09-01] Model pricing stored as JSON array in settings table (key: model_pricing)
- [09-01] Connector types: n8n_webhook, http_api, mcp_server, email
- [09-01] Usage event types: process, chat, rag_index, agent_generate, task_step, connector_call
- [10-01] Connector test uses AbortController with 10s timeout for all HTTP types
- [10-01] Email connector test validates config structure only (no actual send)

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 09 | 01 | 81s | 5 | 2 |
| 10 | 01 | 117s | 6 | 5 |

## Accumulated Context

- Agents exist in custom_agents table + OpenClaw (GET /api/agents merges both)
- Skills in skills table with full metadata
- LLM calls via llm.ts chatCompletion (supports all providers)
- Task executor: direct LiteLLM fetch for LLM calls, ollama+qdrant for RAG
- RAG search via ollama.ts + qdrant.ts shared services
- @dnd-kit installed for drag-and-drop
- recharts NOT installed yet (needs npm install for Phase 14)
- Task execution: fire-and-forget pattern, in-memory cancel flags
- Checkpoint: step stays 'running' while waiting, task goes 'paused'
- Tasks list page at /tasks, wizard at /tasks/new, execution at /tasks/{id}
- Sidebar: Dashboard, Proyectos, Agentes, Workers, Skills, Tareas, Configuracion, Estado del Sistema
- crypto.randomUUID NOT available in HTTP — use generateId() helper
- DB pattern: CREATE TABLE IF NOT EXISTS + ALTER TABLE try-catch
- Seed pattern: check count, insert if 0
- Settings stored in settings table (key-value with JSON values)
- process.env: use bracket notation process['env']['VAR']
- Connectors table: 4 types (n8n_webhook, http_api, mcp_server, email), config as JSON
- connector_logs: FK CASCADE to connectors, tracks task/step/agent invocations
- usage_logs: 6 event types, token counts, estimated_cost (REAL), metadata JSON
- agent_connector_access: composite PK (agent_id, connector_id)
- task_steps.connector_config: JSON array of {connector_id, mode}
- Model pricing in settings (key: model_pricing): 6 models with per-1M-token pricing
- Connectors API: 8 endpoints (list, create, get, update, delete, test, logs, for-agent)
- Connector test: type-specific (n8n_webhook POST, http_api configurable, mcp_server GET, email validate-only)
- Max 20 connectors enforced in POST /api/connectors
- Connector logs: last 50 per connector, ordered by created_at DESC
