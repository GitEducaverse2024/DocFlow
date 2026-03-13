---
gsd_state_version: 1.0
milestone: v7.0
milestone_name: "Streaming + Testing + Logging + Notificaciones"
status: defining_requirements
last_updated: "2026-03-13"
last_activity: 2026-03-13 — Milestone v7.0 started
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
Last activity: 2026-03-13 — Milestone v7.0 started

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-13)

**Core value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.
**Current focus:** v7.0 Streaming + Testing + Logging + Notificaciones

## Current Milestone: v7.0

**Phases:** TBD (defining requirements)
**Requirements:** TBD
**Coverage:** TBD

## Milestone History

### v1.0 — Fix RAG Chat + Mejoras de indexacion (COMPLETE)
- 2 phases, 14 requirements, all complete

### v2.0 — Sistema de Tareas Multi-Agente (COMPLETE)
- 6 phases, 48 requirements, all complete
- Data model, API CRUD, execution engine, task list, wizard, execution view

### v3.0 — Conectores + Dashboard de Operaciones (COMPLETE)
- 6 phases (9-14), 48 requirements, all complete

### v4.0 — Rebranding + CatBot + MCP Bridge + UX Polish (COMPLETE)
- 8 phases (15-22), 52 requirements, all complete

### v5.0 — Canvas Visual de Workflows (PARTIAL)
- 4 phases (23-26), 52 requirements, 51 complete
- Phases 25-26 deferred

### v6.0 — Testing Inteligente + Performance + Estabilización (PARTIAL)
- 5 phases allocated (27-31), phase 27 complete (resilience foundations)
- Phases 28-31 superseded by v7.0 detailed spec
- 8/58 requirements complete (RESIL-01..08)

## Decisions

- [v7.0] Chromium installed in Dockerfile (overrides v6.0 decision to keep Playwright host-only)
- [v7.0] Notifications via SQLite + polling 15s (no WebSocket)
- [v7.0] Streaming uses text/event-stream SSE format
- [v7.0] Logger uses fs.appendFileSync (sync to prevent loss on crash)
- [v7.0] test_runs table for persisting Playwright results
- [v6.0] withRetry applies ONLY to idempotent calls — NOT LLM generation
- [v6.0] Custom logger.ts (not winston) — fewer dependencies
- [v6.0] In-memory TTL cache (Map-based)
- [v5.0] React Flow: @xyflow/react v12
- [v5.0] dagre: @dagrejs/dagre (maintained fork)
- [v4.0] CatBot in localStorage, no delete actions
- [v4.0] MCP Streamable HTTP per project
- [Phase 27]: Error boundaries use Next.js error.tsx file convention
- [Phase 27]: LLM generation calls NOT wrapped with withRetry

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
| 23 | 01 | 121s | 2 | 4 |
| 23 | 02 | 191s | 2 | 4 |
| 23 | 03 | ~180s | 2 | 5 |
| 23 | 04 | 168s | 2 | 6 |
| 24 | 01 | 268s | 2 | 7 |
| 24 | 02 | ~420s | 2 | 10 |
| 24 | 03 | ~420s | 2 | 3 |
| 25 | 01 | 199s | 2 | 8 |
| 25 | 02 | 281s | 2 | 10 |
| 27 | 01 | 118s | 2 | 5 |
| 27 | P02 | 5min | 2 | 16 |
| 27 | P03 | 2min | 1 | 8 |

## Accumulated Context

### v7.0 — Critical patterns to enforce

- Streaming routes require BOTH: `export const dynamic = 'force-dynamic'` AND `export const runtime = 'nodejs'`
- Streaming routes must set `X-Accel-Buffering: no` header (prevents nginx proxy buffering in Docker)
- ReadableStream `start(controller)` must run in background — return `new Response(stream)` immediately, never await the full stream
- Verify streaming in browser DevTools Network tab — must show progressive chunks, not single response
- Logger must write to `/app/data/logs/` (volume-mounted path) — never to `/app/logs/` (ephemeral container filesystem)
- Playwright: `workers: 1` enforced in playwright.config.ts to prevent SQLite lock errors on concurrent writes
- SQLite test isolation: `[TEST]` prefix convention established from first spec, globalTeardown deletes all [TEST] rows
- Error boundaries: use Next.js `error.tsx` file convention (NOT class-based ErrorBoundary wrapping Server Components)

### Canvas-specific (v5.0, inherited)
- React Flow: "use client" + next/dynamic({ ssr: false }) mandatory on canvas editor
- nodeTypes: module-level constant — never inside component body (causes remount on every render)
- ReactFlowProvider: must wrap toolbar + palette + canvas together (not just canvas)
- Container height: h-[calc(100vh-64px)] as direct parent of ReactFlow component
- CSS order: globals.css must import @xyflow/react/dist/style.css AFTER Tailwind directives
- Auto-save: useRef timer with useCallback, not useState (avoid debounce recreation on re-render)
- DAG cycle check: isValidConnection prop with DFS from target node checking if source is reachable
- dagre layout: NODE_DIMENSIONS constant with declared w/h per node type to avoid overlap
- Execution: strip executionStatus fields before auto-save (avoid storing exec data in flow_data)
- canvas_runs.status stuck at "running" on restart: mark as "failed" at db.ts init

### Existing patterns (inherited)
- Agents: custom_agents table + OpenClaw (GET /api/agents merges both)
- Skills: skills table with full metadata
- LLM calls: llm.ts chatCompletion (supports all providers via LiteLLM)
- Task executor: direct LiteLLM fetch for LLM calls, ollama+qdrant for RAG
- RAG search: ollama.ts + qdrant.ts shared services
- Checkpoint: step stays 'running' while waiting, parent goes 'paused'
- @dnd-kit installed for drag-and-drop
- recharts installed for dashboard charts
- Task execution: fire-and-forget pattern, in-memory cancel flags
- Tasks list: /tasks, wizard: /tasks/new, execution: /tasks/{id}
- Sidebar items: Dashboard, Proyectos, Agentes, Workers, Skills, Tareas, Canvas, Conectores, [Testing], Configuracion, Estado del Sistema
- crypto.randomUUID NOT available in HTTP — use generateId() helper
- DB pattern: CREATE TABLE IF NOT EXISTS + ALTER TABLE try-catch
- Seed pattern: check count, insert if 0
- Settings: settings table (key-value with JSON values)
- process.env: use bracket notation process['env']['VAR']
- Connectors: 4 types (n8n_webhook, http_api, mcp_server, email), config as JSON
- usage_logs: 6+ event types, token counts, estimated_cost (REAL), metadata JSON
- Event types include: 'canvas_execution'
- Model pricing in settings (key: model_pricing): 6 models with per-1M-token pricing
- Layout components: breadcrumb.tsx, page-header.tsx, footer.tsx in components/layout/
- Animations: animate-fade-in, animate-slide-up, animate-shimmer in globals.css
- Responsive sidebar: lg: breakpoint, mobile hamburger with overlay
- Logo: app/images/logo.jpg (cat with VR glasses and violet suit)
- CatBot: floating panel, API at /api/catbot/chat, tools in catbot-tools.ts
