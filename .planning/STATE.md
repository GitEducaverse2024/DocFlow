---
gsd_state_version: 1.0
milestone: v17.0
milestone_name: Holded MCP
status: active
last_updated: "2026-03-23"
last_activity: "2026-03-23 -- Completed 76-04 Holded Integration Tests"
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 22
  completed_plans: 17
---

# Project State

## Current Position

Phase: 76 (in progress, 5/5 plans done)
Status: 76-04 complete. Holded integration tests added: 10 unit tests (Vitest), 4 API tests, 4 E2E UI tests (Playwright).
Last activity: 2026-03-23 -- Completed 76-04 Holded Integration Tests

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-23)

**Core value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.
**Current milestone:** v17.0 Holded MCP — Integrar Holded ERP/CRM con DoCatFlow mediante servidor MCP
**Repo base:** `iamsamuelfraga/mcp-holded` (MIT, 60+ invoice tools) — extender con CRM/Proyectos/Equipo

## Phase Overview

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 71 | Setup + Base del Servidor | 4 | complete (4/4) |
| 72 | Módulo CRM (Leads, Funnels, Eventos) | 4 | pending |
| 73 | Módulo Proyectos + Registros Horarios | 4 | pending |
| 74 | Módulo Equipo (Empleados + Control Horario) | 2 | complete (2/2) |
| 75 | Contactos Mejorado + Facturación | 3 | pending |
| 76 | Integración DoCatFlow: CatBot + Canvas + Sistema + Tests | 5 | pending |

## Decisions

- **71-01**: Single HOLDED_API_KEY env var (no multi-tenant). HTTP transport on /mcp port 8766 via express + StreamableHTTPServerTransport. stdio fallback when PORT not set.
- **71-02**: 150ms min delay between requests. API key masked as xxxx****xxxx. HoldedModule type exported for CRM/Projects/Team URL routing. Optional module param defaults to invoicing for backward compat.
- **71-03**: RestartSec=5 (lighter than LinkedIn's 15s, no browser). /usr/bin/node for ExecStart (reliable for systemd). EnvironmentFile reads HOLDED_API_KEY from docflow app .env.
- **71-04**: Holded MCP seed uses is_active=0 (user activates after verifying service). Health check uses POST initialize (same MCP protocol as LinkedIn). Port 8766 in health panel.
- **73-01**: Client-side pagination for project list (Holded API has no server-side pagination). Zod schemas for all project inputs.
- **73-02**: Client-side projectId filter for task list (Holded /tasks returns all tasks). No update tool (no PUT endpoint documented).
- **73-03**: archived boolean converted to 0/1 for Holded API query params. Cross-project list_all_time_entries rate limited to 100/min (lower than per-project 200/min).
- **73-04**: Year 2100 heuristic (4102444800) for ms vs seconds detection. formatDuration rounds down sub-minute values. calculateTotal uses floating-point division to match Holded formula.
- **74-01**: Client-side pagination and search for employees (API returns all). Config at ~/.config/holded-mcp/config.json via node:fs built-ins. All API calls use 'team' module.
- **74-02**: vi.useFakeTimers for Date mocking (vi.spyOn fails as constructor). TZ=UTC in vitest config for consistent Date behavior. startTmp/endTmp accepted as numbers, converted via String() for API.
- **75-03**: Contact context tool added to existing contact-search.ts (same domain). Rate limit 100/min (between write ops 20/min and read ops 200/min).
- **76-02**: Default tool_name to search_knowledge for backward compat. Canvas MCP returns tool result as output (not pass-through). Date.now() for JSON-RPC id.
- **76-01**: 10 native Holded tools in CatBot (no sudo). JSON-RPC 2.0 via HOLDED_MCP_URL. findServerUrl updated for env-var MCP resolution.
- **76-03**: Shared config/description variables for INSERT+UPDATE. Else branch (not separate UPDATE) avoids double execution. tools_count added to HoldedMcpStatus interface.
- **76-04**: Logger mocked globally in unit tests to avoid fs writes. All E2E/API tests conditional on HOLDED_MCP_URL configuration.

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

### v5.0 — Canvas Visual de Workflows (COMPLETE)
- 4 phases (23-26), 52 requirements, all complete

### v6.0 — Testing Inteligente + Performance + Estabilizacion (PARTIAL)
- 5 phases allocated (27-31), phase 27 complete (resilience foundations)
- Phases 28-31 superseded by v7.0 detailed spec

### v7.0 — Streaming + Testing + Logging + Notificaciones (COMPLETE)
- 6 phases (32-37), 53 requirements, all complete

### v8.0 — CatBot Diagnosticador + Base de Conocimiento (COMPLETE)
- 1 phase (38), 15 requirements, all complete

### v9.0 — CatBrains (COMPLETE)
- 3 phases (39-41), 23 requirements, all complete

### v10.0 — CatPaw: Unificacion de Agentes (COMPLETE)
- 6 phases (42-47), 50 requirements, all complete

### v11.0 — LinkedIn MCP Connector (COMPLETE)
- 1 phase (47), 7 requirements, all complete

### v12.0 — WebSearch CatBrain (COMPLETE)
- 2 phases (48-49), 28 requirements, all complete

### v13.0 — Conector Gmail (COMPLETE)
- 2 phases (50-51), ~35 requirements, all complete

### v14.0 — CatBrain UX Redesign (COMPLETE)
- 5 phases (52-56), 37 requirements, all complete
- CORS fix, entry modal, sources pipeline, reset, RAG info bar

### v15.0 — Tasks Unified (COMPLETE)
- 6 phases (57-62), ~77 requirements, all complete
- Canvas as subagent step, Fork/Join parallel branches, Cascade Wizard
- Variable/scheduled execution cycles, internal scheduler (setInterval 60s)
- Export system: ZIP bundle with manifest, Docker, runner HTML, install scripts
- Sidebar: Canvas removed, accessed from Tasks; /canvas → /tasks redirect

### v16.0 — CatFlow (COMPLETE)
- 8 phases (63-70), 76 requirements, 69 PASS / 5 PARTIAL / 2 FAIL (cosmetic)
- Rename Tareas→CatFlow, 3 new canvas nodes (scheduler/storage/multiagent)
- Right sidebar config panel, copy/paste, inter-CatFlow communication
- Enhanced START + OUTPUT, CatBot tools, E2E + API tests
