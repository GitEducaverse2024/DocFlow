---
gsd_state_version: 1.0
milestone: v9.0
milestone_name: CatBrains
status: in_progress
last_updated: "2026-03-14T12:36:40Z"
last_activity: 2026-03-14 — Completed 39-01 (DB migration + catbrains API + project redirects)
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 1
  completed_plans: 1
---

# Project State

## Current Position

Phase: 39 — Renombrado y Migracion
Plan: 01 complete, awaiting next plan
Status: Plan 39-01 complete
Last activity: 2026-03-14 — Completed 39-01-PLAN.md

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-14)

**Core value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.
**Current focus:** v9.0 CatBrains — Renombrar y ampliar Projects a unidades de conocimiento inteligente

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
- Phase 26 (Templates + Modes) completed 2026-03-14: 4 templates seeded, palette mode filtering

### v6.0 — Testing Inteligente + Performance + Estabilizacion (PARTIAL)
- 5 phases allocated (27-31), phase 27 complete (resilience foundations)
- Phases 28-31 superseded by v7.0 detailed spec
- 8/58 requirements complete (RESIL-01..08)

### v7.0 — Streaming + Testing + Logging + Notificaciones (COMPLETE)
- 6 phases (32-37), 53 requirements, all complete
- Streaming LLM (SSE), Playwright E2E+API tests, JSONL logging, notifications system
- Testing dashboard with runner, results, history, AI generator, log viewer

### v8.0 — CatBot Diagnosticador + Base de Conocimiento (COMPLETE)
- 1 phase (38), 15 requirements, all complete
- Error interceptor (fetch monkey-patch), doc search, diagnostics, model validation

## Decisions

- [v9.0] 3 phases derived from 4 requirement categories: REN (refactor) -> CONN (new logic) -> CFG+INT (UI + integration)
- [v9.0] CFG and INT merged into Phase 41 because system prompt and executeCatBrain are tightly coupled — config UI depends on the I/O contract
- [v9.0] Linear dependency chain: 39 -> 40 -> 41 (each phase builds on the previous)
- [v7.0] Logging as Phase 32 (first) — foundation for all other phases
- [v7.0] Streaming split into backend (33) + frontend (34) — verify SSE before polishing UX
- [v7.0] Notifications as standalone Phase 35 — full system in one phase (data model through UI)
- [v7.0] Playwright + all specs in single Phase 36 — setup and specs are tightly coupled work
- [v7.0] Log viewer lives in /testing page (Phase 37) — not a separate page
- [v7.0] Requirement count corrected: 53 (not 48 as initially estimated)
- [v7.0] Chromium installed in Dockerfile (overrides v6.0 decision to keep Playwright host-only)
- [v7.0] Notifications via SQLite + polling 15s (no WebSocket)
- [v7.0] Streaming uses text/event-stream SSE format
- [v7.0] Logger uses fs.appendFileSync (sync to prevent loss on crash)
- [v7.0] test_runs table for persisting Playwright results
- [33-01] streamLiteLLM skips withRetry; createSSEStream uses background IIFE pattern; Chat RAG keeps JSON fallback
- [33-02] CatBot streams tool_call_start/tool_call_result events between LLM iterations; Process streaming only for local mode, n8n unchanged; both keep JSON fallback
- [34-01] rAF batching limits onToken state updates to ~60/s; streaming cursor uses CSS ::after (not appended char); streamingContentRef avoids stale closures
- [34-02] CatBot uses streamingToolCallsRef to avoid stale closure; ProcessPanel dual-path: SSE for local, JSON+polling for n8n; CatBot messages upgraded to ReactMarkdown
- [35-01] createNotification is fire-and-forget with internal try-catch; uses generateId() not crypto.randomUUID; added 'notifications' to LogSource
- [35-02] Popover created manually (shadcn CLI broken on Node 22); useNotifications polls count only, fetches recent on-demand; filter selects use 'all' sentinel for base-ui compatibility
- [36-01] Playwright chromium installed locally and in Dockerfile; globalSetup does health check + pre-clean; SQLite reporter uses crypto.randomUUID (Node context); test-fixtures.ts is simple re-export for now
- [36-03] ChatPOM verifies UI state only (not LLM response); AgentsPOM uses Manual mode for E2E creation; all specs use afterAll API cleanup
- [36-02] POMs use exact Spanish labels from component source; specs verify UI states not LLM output for service-dependent tests; RAG query uses OR assertions for graceful Qdrant-unavailable handling
- [36-04] Reused DashboardPOM from Plan 02; Canvas spec serial CRUD with wizard/editor/drag; CatBot contextual suggestions tested across pages; Dashboard handles both main and welcome screen
- [36-05] API specs use request fixture (no browser); response shapes extracted from actual route handlers; test-fixtures.ts wires all 15 POMs as typed Playwright fixtures
- [37-01] Shared testing-state.ts module for cross-route state (avoids module isolation issues); section-to-spec mapping as const object in run route
- [37-02] Array.from(map.entries()) instead of for-of on Map (downlevelIteration compat); section name extracted from spec file path via regex
- [37-03] State type string (not const union) for section selector to avoid TS narrowing issues with onChange
- [37-04] Debounced search uses useRef+setTimeout pattern (500ms) to avoid excessive API calls; auto-scroll uses scrollTop=scrollHeight on entries change
- [39-01] FK column names (project_id) kept in sources/processing_runs for backward compat; data directory on disk unchanged
- [39-01] Canvas template seeds updated: project -> catbrain type, projects -> catbrains mode
- [v6.0] withRetry applies ONLY to idempotent calls — NOT LLM generation
- [v6.0] Custom logger.ts (not winston) — fewer dependencies
- [v6.0] In-memory TTL cache (Map-based)
- [v8.0] Fetch monkey-patch in global ErrorInterceptorProvider (dynamic import, no SSR)
- [v8.0] XMLHttpRequest for error-history POST to avoid recursive fetch interceptor loop
- [v8.0] Text search (not vector) for doc search — sufficient for ~15 .md files
- [v8.0] Error history in settings table (reuses key-value store, no new table)
- [v8.0] Model validation cached 60s, fallback chain: requested -> default -> first available
- [v8.0] CatBot troubleshooting table as static system prompt section (not dynamic)

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 32 | 01 | 445s | 2 | 10 |
| 32 | 02 | 280s | 2 | 41 |
| 32 | 03 | 420s | 2 | 26 |
| 33 | 01 | 168s | 2 | 2 |
| 33 | 02 | 271s | 2 | 2 |
| 34 | 01 | 130s | 2 | 3 |
| 34 | 02 | 200s | 2 | 2 |
| 35 | 01 | 241s | 2 | 11 |
| 35 | 02 | 223s | 2 | 7 |
| 36 | 01 | 190s | 2 | 13 |
| 36 | 02 | 264s | 2 | 11 |
| 36 | 03 | 180s | 2 | 10 |
| 36 | 04 | 180s | 2 | 9 |
| 36 | 05 | 120s | 2 | 5 |
| 37 | 01 | 195s | 2 | 10 |
| 37 | 02 | 147s | 2 | 4 |
| 37 | 03 | 169s | 2 | 4 |
| 37 | 04 | 126s | 2 | 4 |
| 39 | 01 | 555s | 3 | 42 |

## Accumulated Context

### v9.0 — Key patterns for CatBrains
- Migration: CREATE TABLE catbrains AS SELECT ... FROM projects, then DROP projects, then ALTER TABLE for new columns
- API aliases: old /api/projects/... routes return 301 redirect to /api/catbrains/...
- catbrain_connectors: separate table with FK to catbrains.id, reuses connector patterns from v3.0
- executeCatBrain(): shared orchestration function (RAG + connectors + LLM + system prompt)
- CatBrainInput/CatBrainOutput: TypeScript interfaces in shared types file
- Canvas node rename: PROJECT -> CATBRAIN in type registry, palette, executor
- Task step rename: PROJECT -> CATBRAIN in task-engine.ts, wizard, display

### v7.0 — Critical patterns to enforce
- Streaming routes require BOTH: `export const dynamic = 'force-dynamic'` AND `export const runtime = 'nodejs'`
- Streaming routes must set `X-Accel-Buffering: no` header (prevents nginx proxy buffering in Docker)
- ReadableStream `start(controller)` must run in background — return `new Response(stream)` immediately, never await the full stream
- Verify streaming in browser DevTools Network tab — must show progressive chunks, not single response
- Logger must write to `/app/data/logs/` (volume-mounted path) — never to `/app/logs/` (ephemeral container filesystem)
- Playwright: `workers: 1` enforced in playwright.config.ts to prevent SQLite lock errors on concurrent writes
- SQLite test isolation: `[TEST]` prefix convention established from first spec, globalTeardown deletes all [TEST] rows
- Error boundaries: use Next.js `error.tsx` file convention (NOT class-based ErrorBoundary wrapping Server Components)

### Existing patterns (inherited)
- Agents: custom_agents table + OpenClaw (GET /api/agents merges both)
- Skills: skills table with full metadata
- LLM calls: llm.ts chatCompletion (supports all providers via LiteLLM)
- Task executor: direct LiteLLM fetch for LLM calls, ollama+qdrant for RAG
- RAG search: ollama.ts + qdrant.ts shared services
- @dnd-kit installed for drag-and-drop
- recharts installed for dashboard charts
- Sidebar items: Dashboard, Proyectos, Agentes, Workers, Skills, Tareas, Canvas, Conectores, Notificaciones, [Testing], Configuracion, Estado del Sistema
- crypto.randomUUID NOT available in HTTP — use generateId() helper
- DB pattern: CREATE TABLE IF NOT EXISTS + ALTER TABLE try-catch
- process.env: use bracket notation process['env']['VAR']
- Colors: Primary mauve (#8B6D8B), accent violet-500/600, bg zinc-950
