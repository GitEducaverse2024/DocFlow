---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: milestone
status: executing
last_updated: "2026-03-12T20:58:49.003Z"
last_activity: 2026-03-12 — Phase 27 Plan 01 complete
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 3
  completed_plans: 2
---

# Project State

## Current Position

Phase: 27 — Resilience Foundations (in progress)
Plan: 27-01 complete — next: 27-02
Status: Executing Phase 27
Last activity: 2026-03-12 — Phase 27 Plan 01 complete

Progress: [>---------] 0/5 phases | 4/58 requirements (RESIL-01, RESIL-04, RESIL-07, RESIL-08)

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-12)

**Core value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.
**Current focus:** v6.0 Testing Inteligente + Performance + Estabilización

## Current Milestone: v6.0

**Phases:** 27–31 (5 phases)
**Requirements:** 58 total
**Coverage:** 58/58 ✓

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| 27. Resilience Foundations | Retry, cache, logger, error boundaries, health latency, DB cleanup | RESIL-01..08 (8) | In progress (1/3 plans) |
| 28. Playwright Foundation | Install, config, POMs, data-testid, 15 E2E specs, 7 API specs | PLAY-01..04, E2E-01..15, API-01..07 (26) | Not started |
| 29. Testing Dashboard | /testing page, run trigger, results, logs viewer, history, chart | TEST-01..12 (12) | Not started |
| 30. LLM Streaming | chatStream service, streaming endpoints, UI consumers | STRM-01..07 (7) | Not started |
| 31. AI Test Generation | CLI script, prompt template, UI integration, ai-generated/ folder | AIGEN-01..05 (5) | Not started |

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

### v5.0 — Canvas Visual de Workflows (PARTIAL)
- 4 phases (23-26), 52 requirements, 51 complete
- Phase 23: Modelo de Datos + API CRUD + Lista + Wizard (COMPLETE)
- Phase 24: Editor Visual + 8 Tipos de Nodo (COMPLETE)
- Phase 25: Motor de Ejecucion Visual (2/3 plans — checkpoint dialog + result panel deferred)
- Phase 26: Templates + Modos de Canvas (deferred)

## Decisions

- [v6.0] Playwright for E2E testing (@playwright/test as devDependency, host-only)
- [v6.0] Tests run against Docker app (baseURL: http://localhost:3500)
- [v6.0] Playwright NOT in Docker image — node:20-slim lacks Chromium system libs
- [v6.0] ReadableStream for LLM streaming (no WebSocket)
- [v6.0] In-memory TTL cache (Map-based, no external cache)
- [v6.0] Structured JSONL file logging with 7-day rotation to /app/data/logs/
- [v6.0] withRetry applies ONLY to idempotent calls — NOT LLM generation (non-idempotent)
- [v6.0] Custom logger.ts (not winston) — fewer dependencies, sufficient for single-user
- [v6.0] Trigger-file pattern for test execution (API writes file, host script detects and runs Playwright)
- [v5.0] React Flow library: @xyflow/react v12 (NOT deprecated reactflow package)
- [v5.0] dagre library: @dagrejs/dagre (maintained fork of abandoned dagre)
- [v5.0] html-to-image pinned at 1.11.11 (later versions have known export bug)
- [v5.0] flow_data never mutated during execution — execution state in canvas_runs.node_states
- [v5.0] canvas-executor.ts mirrors task-engine.ts pattern (fire-and-forget + 2s polling)
- [v5.0] generateId() for all node/edge IDs — crypto.randomUUID() not available on HTTP
- [v4.0] CatBot conversations stored in localStorage (not server DB)
- [v4.0] CatBot cannot delete resources (safety constraint)
- [v4.0] MCP uses Streamable HTTP protocol, one endpoint per project
- [v4.0] Primary brand color: mauve (#8B6D8B), complementing existing violet accent
- [Phase 27]: Error boundaries use Next.js error.tsx file convention scoped to route segments — sidebar stays functional during section crashes
- [Phase 27]: CatBot error notification via localStorage push in useEffect — zero coupling to catbot-panel.tsx, works even if server is down

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
| Phase 27 P03 | 2 | 1 tasks | 8 files |

## Accumulated Context

### v6.0 — Critical patterns to enforce

- Streaming routes require BOTH: `export const dynamic = 'force-dynamic'` AND `export const runtime = 'nodejs'`
- Streaming routes must set `X-Accel-Buffering: no` header (prevents nginx proxy buffering in Docker)
- ReadableStream `start(controller)` must run in background — return `new Response(stream)` immediately, never await the full stream
- Verify streaming in browser DevTools Network tab — must show progressive chunks, not single response
- Logger must write to `/app/data/logs/` (volume-mounted path) — never to `/app/logs/` (ephemeral container filesystem)
- Playwright: `workers: 1` enforced in playwright.config.ts to prevent SQLite lock errors on concurrent writes
- SQLite test isolation: `[TEST]` prefix convention established from first spec, globalTeardown deletes all [TEST] rows
- Error boundaries: use Next.js `error.tsx` file convention (NOT class-based ErrorBoundary wrapping Server Components)
- Host watch script for test execution: polling loop checking every 2s is simpler than inotifywait for single-user tool

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
