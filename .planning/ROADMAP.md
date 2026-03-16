# Roadmap: DoCatFlow v12.0 — WebSearch CatBrain

**Milestone:** v12.0
**Created:** 2026-03-16
**Phases:** 2 (Phase 48-49)
**Requirements:** 28 total, 28 mapped (100%)

## Phases

- [x] **Phase 48: Infraestructura WebSearch** - SearXNG Docker service, Gemini grounding endpoint, seeds, health checks, env vars
- [ ] **Phase 49: CatBrain WebSearch** - Seed CatBrain WebSearch, multi-engine API, Canvas/Tasks integration, UI, tests, docs

## Phase Details

### Phase 48: Infraestructura WebSearch

**Goal**: DoCatFlow can perform web searches via SearXNG (self-hosted) and Gemini grounding (cloud), with both engines visible in system health and seeded as connectors.

**Depends on**: Nothing (first phase in v12.0)

**Requirements**: SRXNG-01, SRXNG-02, SRXNG-03, SRXNG-04, SRXNG-05, SRXNG-06, GMNGG-01, GMNGG-02, GMNGG-03, UPD-03

**Success Criteria** (what must be TRUE when this phase completes):
1. Running `docker compose up -d` starts a `docflow-searxng` container that responds to `GET /search?q=test&format=json` on port 8080 with JSON results
2. The `/system` page shows a SearXNG service card (violet color, magnifying glass icon) with online/offline status when SEARXNG_URL is configured
3. The `/api/health` endpoint includes SearXNG status (with 3s timeout, conditional on SEARXNG_URL being set)
4. Calling `POST /api/websearch/gemini` with a query returns Gemini grounding results extracted from grounding_metadata via LiteLLM
5. Both seed connectors (`seed-searxng` and `seed-gemini-search`) appear in the connectors list after app startup

**Plans**: 3 plans

Plans:
- [x] 48-01-PLAN.md — Docker SearXNG + settings.yml + seed connectors + env vars
- [x] 48-02-PLAN.md — Gemini grounding search endpoint
- [x] 48-03-PLAN.md — Health check + system UI card + footer dot + CatBot awareness

**Technical notes:**
- SearXNG settings.yml MUST include `formats: [html, json]` to enable JSON API
- SearXNG secret_key via env var SEARXNG_SECRET_KEY
- All env vars read with `process['env']['VARIABLE']` bracket notation
- SearXNG health check uses `cacheGet`/`cacheSet` with TTL, `withRetry` on the fetch call
- SearXNG tarjeta color: violet; Gemini tarjeta color: blue
- GMNGG-01 configures `gemini-search` alias in LiteLLM routing.yaml
- UPD-03: document SEARXNG_URL and SEARXNG_SECRET_KEY in .env

---

### Phase 49: CatBrain WebSearch

**Goal**: Users can perform web searches from within CatBrains, Canvas, and Tasks using a system-protected CatBrain "WebSearch" with selectable engine (SearXNG/Gemini/Ollama/auto) and visual feedback in the UI.

**Depends on**: Phase 48 (requires SearXNG running and Gemini endpoint available)

**Requirements**: GMNGG-04, WSCB-01, WSCB-02, WSCB-03, WSCB-04, WSCB-05, WSCB-06, WSCB-07, WSCBUI-01, WSCBUI-02, WSCBUI-03, WSCBUI-04, WSCBUI-05, UPD-01, UPD-02, TEST-01, TEST-02, TEST-03

**Success Criteria** (what must be TRUE when this phase completes):
1. A "WebSearch" CatBrain appears in the CatBrains list with a "Sistema" badge, and attempting to delete it returns 403 (lock icon replaces delete button)
2. Opening the WebSearch CatBrain detail shows a "Motor de Busqueda" tab where the user can select Auto/SearXNG/Gemini/Ollama, see real-time engine status, type a query and test it with formatted results
3. Adding a WebSearch CatBrain node in Canvas shows the active engine badge, and executing the canvas performs a web search via executeWebSearch() producing markdown output
4. Creating a Task step using the WebSearch CatBrain executes the web search and passes results through the pipeline
5. All Playwright E2E and API tests pass: infrastructure health, connector test, search endpoints, CatBrain CRUD protection, engine selector, and search test UI

**Plans**: 4 plans

Plans:
- [ ] 49-01-PLAN.md — DB migration + seed CatBrain + multi-engine search API + executeWebSearch + DELETE protection
- [ ] 49-02-PLAN.md — Canvas + Task executor WebSearch integration
- [ ] 49-03-PLAN.md — UI: Sistema badge, engine selector tab, search test panel
- [ ] 49-04-PLAN.md — E2E + API tests, update script, maintenance docs

**Technical notes:**
- CatBrain seed: `is_system: 1`, `search_engine: "auto"`, specialized system prompt
- New columns: `search_engine` (TEXT, default null), `is_system` (INTEGER, default 0) via ALTER TABLE migration
- `POST /api/websearch/search`: orchestrates multi-engine with fallback, max 500 chars query
- `executeWebSearch()` in `execute-websearch.ts`: formats output as markdown for pipelines
- Canvas integration: canvas-executor.ts detects seed-catbrain-websearch id, routes to executeWebSearch()
- Task integration: task-executor.ts same pattern
- DELETE `/api/catbrains/[id]` rejects with 403 if `is_system: 1`
- UI text in Spanish, colors: SearXNG violet (local), Gemini blue (cloud), Ollama emerald (local)
- withRetry on all external search calls
- Update script: `scripts/update-searxng.sh` for container pull + restart
- Docs: maintenance section in installation guide with cron semanal

---

## Dependency Chain

```
Phase 48: Infraestructura WebSearch
    |
    v
Phase 49: CatBrain WebSearch
```

Phase 49 depends on Phase 48 because:
- executeWebSearch() calls SearXNG API (SRXNG-01..02 must be running)
- Gemini engine selector needs /api/websearch/gemini endpoint (GMNGG-03)
- Health checks and seed connectors must exist for status display

## Coverage Map

```
SRXNG-01  -> Phase 48   (Docker service docflow-searxng)
SRXNG-02  -> Phase 48   (settings.yml con JSON format)
SRXNG-03  -> Phase 48   (SEARXNG_URL env var)
SRXNG-04  -> Phase 48   (seed connector searxng)
SRXNG-05  -> Phase 48   (health check SearXNG)
SRXNG-06  -> Phase 48   (tarjeta /system SearXNG)
GMNGG-01  -> Phase 48   (LiteLLM routing alias gemini-search)
GMNGG-02  -> Phase 48   (seed connector gemini-search)
GMNGG-03  -> Phase 48   (Gemini grounding endpoint)
GMNGG-04  -> Phase 49   (Gemini selectable as engine in CatBrain)
WSCB-01   -> Phase 49   (seed CatBrain WebSearch)
WSCB-02   -> Phase 49   (search_engine column)
WSCB-03   -> Phase 49   (is_system column)
WSCB-04   -> Phase 49   (multi-engine search endpoint)
WSCB-05   -> Phase 49   (executeWebSearch service)
WSCB-06   -> Phase 49   (Canvas integration)
WSCB-07   -> Phase 49   (Tasks integration)
WSCBUI-01 -> Phase 49   (badge Sistema + lock icon)
WSCBUI-02 -> Phase 49   (Motor de Busqueda tab)
WSCBUI-03 -> Phase 49   (test de busqueda UI)
WSCBUI-04 -> Phase 49   (Canvas node engine badge)
WSCBUI-05 -> Phase 49   (DELETE protection 403)
UPD-01    -> Phase 49   (update script)
UPD-02    -> Phase 49   (maintenance docs)
UPD-03    -> Phase 48   (env vars documentation in .env)
TEST-01   -> Phase 49   (E2E infra tests)
TEST-02   -> Phase 49   (E2E CatBrain tests)
TEST-03   -> Phase 49   (API tests)

Mapped: 28/28 — 100% coverage
Orphaned: 0
```

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 48. Infraestructura WebSearch | 3/3 | Complete    | 2026-03-16 |
| 49. CatBrain WebSearch | 0/4 | Not started | - |

---
*Roadmap created: 2026-03-16*
*Milestone: v12.0 — WebSearch CatBrain*
