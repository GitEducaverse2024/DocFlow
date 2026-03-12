---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Canvas Visual de Workflows
status: planning
last_updated: "2026-03-12T18:00:00Z"
last_activity: 2026-03-12 — Milestone v5.0 started
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-12 — Milestone v5.0 started

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-12)

**Core value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat — now with visual workflow canvas.
**Current focus:** v5.0 Canvas Visual de Workflows — defining requirements

## Milestone History

### v1.0 — Fix RAG Chat + Mejoras de indexacion (COMPLETE)
- 2 phases, 14 requirements, all complete

### v2.0 — Sistema de Tareas Multi-Agente (COMPLETE)
- 6 phases, 48 requirements, all complete
- Data model, API CRUD, execution engine, task list, wizard, execution view

### v3.0 — Conectores + Dashboard de Operaciones (COMPLETE)
- 6 phases (9-14), 48 requirements, all complete
- Phase 9: Data model (connectors, logs, usage tables + types)
- Phase 10: Connectors API CRUD (8 endpoints)
- Phase 11: Connectors UI (/connectors page with CRUD sheet, test, logs)
- Phase 12: Pipeline integration (executor hooks, agent access, wizard connectors)
- Phase 13: Usage tracking + cost settings (logUsage helper, model pricing)
- Phase 14: Dashboard (6 API endpoints, recharts bar chart, activity feed, top agents/models, storage)

### v4.0 — Rebranding + CatBot + MCP Bridge + UX Polish (COMPLETE)
- 8 phases (15-22), 52 requirements, all complete
- Phase 15: Rebranding Visual (DocFlow → DoCatFlow, logo, gradients, mauve branding)
- Phase 16: Welcome + Onboarding (welcome screen for empty state, capability list)
- Phase 17: CatBot Backend (API + 11 tools, tool-calling loop, LiteLLM proxy)
- Phase 18: CatBot Frontend (floating panel, suggestions, localStorage persistence)
- Phase 19: CatBot Configuration (model, personality, allowed_actions in settings)
- Phase 20: MCP Bridge Backend (POST /api/mcp/[projectId], 3 tools, MCP Streamable HTTP)
- Phase 21: MCP Bridge UI (enhanced panel in RAG section, connection buttons)
- Phase 22: UX Polish (breadcrumbs, page-header, footer, animations, responsive sidebar)

## Decisions

- [v4.0] CatBot conversations stored in localStorage (not server DB)
- [v4.0] CatBot cannot delete resources (safety constraint)
- [v4.0] MCP uses Streamable HTTP protocol, one endpoint per project
- [v4.0] Primary brand color: mauve (#8B6D8B), complementing existing violet accent
- [v4.0] Logo at app/images/logo.jpg, displayed as 32px circle in sidebar
- [v4.0] MCP tools: search_knowledge, get_project_info, get_document
- [v4.0] MCP endpoint auto-activates when RAG is indexed (no extra flag needed)
- [v4.0] Footer shows service status dots from useSystemHealth hook
- [v4.0] Sidebar responsive: hidden on mobile, hamburger menu via lg: breakpoint

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 09 | 01 | 81s | 5 | 2 |
| 10 | 01 | 117s | 6 | 5 |
| 11 | 01 | 169s | 3 | 2 |
| 12 | 01 | 228s | 5 | 4 |
| 13 | 01 | manual | 8 | 6 |
| 14 | 01 | manual | 8 | 7 |
| 15-22 | manual | session | 8 phases | ~25 files |

## Accumulated Context

- Agents exist in custom_agents table + OpenClaw (GET /api/agents merges both)
- Skills in skills table with full metadata
- LLM calls via llm.ts chatCompletion (supports all providers)
- Task executor: direct LiteLLM fetch for LLM calls, ollama+qdrant for RAG
- RAG search via ollama.ts + qdrant.ts shared services
- @dnd-kit installed for drag-and-drop
- recharts installed for dashboard charts
- Task execution: fire-and-forget pattern, in-memory cancel flags
- Checkpoint: step stays 'running' while waiting, task goes 'paused'
- Tasks list page at /tasks, wizard at /tasks/new, execution at /tasks/{id}
- Sidebar: Dashboard, Proyectos, Agentes, Workers, Skills, Tareas, Conectores, Configuracion, Estado del Sistema
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
- Dashboard API: 6 endpoints (summary, usage, activity, top-agents, top-models, storage)
- Dashboard page: 7 summary cards, stacked bar chart (recharts), activity feed, top agents, top models, storage info
- Logo: app/images/logo.jpg (cat with VR glasses and violet suit)
- CatBot: floating panel (catbot-panel.tsx), API at /api/catbot/chat, tools in catbot-tools.ts
- CatBot config: stored in settings.catbot_config as JSON (model, personality, allowed_actions)
- MCP Bridge: /api/mcp/[projectId] endpoint, GET for discovery, POST for JSON-RPC
- MCP tools: search_knowledge (RAG), get_project_info (DB), get_document (filesystem)
- Layout components: breadcrumb.tsx, page-header.tsx, footer.tsx in components/layout/
- Animations: animate-fade-in, animate-slide-up, animate-shimmer in globals.css
- Responsive sidebar: lg: breakpoint, mobile hamburger with overlay
