# Roadmap: DoCatFlow v6.0 — Testing Inteligente + Performance + Estabilización

**Milestone:** v6.0
**Phases:** 5 (phases 27–31, continuing from v5.0)
**Requirements:** 58 total
**Coverage:** 58/58 ✓
**Started:** 2026-03-12

---

## Phases

- [ ] **Phase 27: Resilience Foundations** — retry, TTL cache, structured logger, error boundaries, health latency, startup DB cleanup
- [ ] **Phase 28: Playwright Foundation** — install, config, Page Object Models, data-testid attributes, all 15 E2E specs, all 7 API specs
- [ ] **Phase 29: Testing Dashboard** — /testing page, run trigger, results table, log viewer, run history, coverage chart
- [ ] **Phase 30: LLM Streaming** — chatStream service, streaming chat endpoint, streaming CatBot endpoint, UI consumers
- [ ] **Phase 31: AI Test Generation** — CLI script, prompt template, /api/testing/generate, UI section, ai-generated/ output folder

---

## Phase Details

### Phase 27: Resilience Foundations
**Goal**: The application handles external service failures gracefully — retrying transient errors, caching hot endpoints, logging all activity to disk, reporting crashes to CatBot, and recovering zombie run states on startup.
**Depends on**: Nothing (foundations phase)
**Requirements**: RESIL-01, RESIL-02, RESIL-03, RESIL-04, RESIL-05, RESIL-06, RESIL-07, RESIL-08
**Success Criteria** (what must be TRUE when phase completes):
  1. A transient failure on a LiteLLM, Qdrant, Ollama, OpenClaw, or connector call is retried automatically with exponential backoff and the user sees a result rather than an instant error
  2. Repeated requests to /api/agents, /api/dashboard, /api/health, and /api/settings within their respective TTL windows return instantly from cache without hitting SQLite
  3. Errors in any of the 8 main sections (projects, tasks, agents, canvas, workers, skills, connectors, testing) show a localized error card with a "Reintentar" button — the sidebar and other sections remain fully functional
  4. A section crash pushes the error context to CatBot's localStorage so CatBot proactively offers help on the next open
  5. After a Docker restart, no task or canvas_run remains stuck in "running" state — all are reset to "failed" automatically on startup, and the health check reports latency_ms per service
**Plans:** 2/3 plans executed

Plans:
- [x] 27-01-PLAN.md — Core utilities (retry, cache, logger) + DB cleanup + health latency
- [ ] 27-02-PLAN.md — Apply withRetry to services + TTL cache to API routes
- [ ] 27-03-PLAN.md — Error boundaries (8 sections) with CatBot integration

### Phase 28: Playwright Foundation
**Goal**: A complete, runnable Playwright test suite exists on the host with Page Object Models for all sections, data-testid attributes on all key UI elements, and all 22 specs (15 E2E + 7 API) executing without crashing.
**Depends on**: Phase 27 (stable, non-crashing application surface for specs to target; error boundaries prevent test runner from encountering unhandled app crashes)
**Requirements**: PLAY-01, PLAY-02, PLAY-03, PLAY-04, E2E-01, E2E-02, E2E-03, E2E-04, E2E-05, E2E-06, E2E-07, E2E-08, E2E-09, E2E-10, E2E-11, E2E-12, E2E-13, E2E-14, E2E-15, API-01, API-02, API-03, API-04, API-05, API-06, API-07
**Success Criteria** (what must be TRUE when phase completes):
  1. Running `npx playwright test` from the host executes all 22 specs against http://localhost:3500 and produces a JSON results file in /app/data/test-results/
  2. Test data created during any spec run is fully cleaned up after the run — no [TEST]-prefixed rows remain in the live DB after globalTeardown completes
  3. Each of the 8 sections has a typed Page Object Model covering navigation, key CRUD actions, and primary form interactions
  4. All key interactive elements across the 8 sections carry data-testid attributes that the specs use as primary selectors — no brittle CSS-path selectors
**Plans**: TBD

### Phase 29: Testing Dashboard
**Goal**: Users can trigger a full Playwright run from within the DoCatFlow UI, watch results appear in a table, review failure details, browse run history, and read structured application logs — all without needing SSH access to the server.
**Depends on**: Phase 27 (logger must be writing JSONL content before the log viewer has anything to show), Phase 28 (specs must exist before the run button is useful)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07, TEST-08, TEST-09, TEST-10, TEST-11, TEST-12
**Success Criteria** (what must be TRUE when phase completes):
  1. Clicking "Ejecutar Tests" on /testing triggers a Playwright run on the host and the UI updates to show running status — the button is disabled while tests are running
  2. The results table shows every test with its section, status (pass/fail/skip), duration, and an expandable failure row with error message and trace
  3. The run history section shows the last 10 test runs with timestamps, total pass/fail/skip counts, and duration — different runs can be compared at a glance
  4. The log viewer displays application JSONL logs filterable by INFO / WARN / ERROR level with the most recent entries visible first
  5. A horizontal bar chart shows per-section pass/fail coverage across all 8 application sections
**Plans**: TBD

### Phase 30: LLM Streaming
**Goal**: Chat, CatBot, and Processing LLM responses stream tokens to the screen as they are generated — the first token appears within 1–2 seconds instead of a full-generation wait.
**Depends on**: Phase 27 (withRetry available for connection resilience during stream setup; logger available for stream error reporting)
**Requirements**: STRM-01, STRM-02, STRM-03, STRM-04, STRM-05, STRM-06, STRM-07
**Success Criteria** (what must be TRUE when phase completes):
  1. Sending a message in the project chat panel shows the first token within 2 seconds and the full response builds progressively — no full-generation spinner delay
  2. Sending a message to CatBot shows a blinking cursor while the response streams and tokens appear progressively — tool calls resolve silently first, then streaming begins
  3. Triggering document processing shows a real-time preview of the LLM-generated text accumulating in the output area as it is generated
  4. Navigating away from a chat or CatBot panel mid-stream cleanly aborts the in-flight request — no lingering network connections after component unmount
**Plans**: TBD

### Phase 31: AI Test Generation
**Goal**: Users can generate Playwright spec files for any DoCatFlow section by running a CLI command or pressing a button in /testing — the generated specs follow the Spanish-language POM conventions established in Phase 28.
**Depends on**: Phase 28 (tests/e2e/ directory and POM conventions established as output target), Phase 29 (/testing page exists for UI integration)
**Requirements**: AIGEN-01, AIGEN-02, AIGEN-03, AIGEN-04, AIGEN-05
**Success Criteria** (what must be TRUE when phase completes):
  1. Running `npx ts-node scripts/generate-tests.ts --section projects` produces a valid Playwright spec file in tests/ai-generated/ within 30 seconds
  2. Generated specs use Spanish-language text selectors matching actual UI content, prefer data-testid attributes, and follow the Page Object Model structure established in Phase 28
  3. Selecting a section in /testing and clicking "Generar Tests" calls the generation endpoint and shows a preview of the generated spec before any file is written
  4. Generated files land in tests/ai-generated/ for human review — they are not automatically moved to tests/e2e/ without manual approval
**Plans**: TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 27. Resilience Foundations | 2/3 | In Progress|  |
| 28. Playwright Foundation | 0/? | Not started | — |
| 29. Testing Dashboard | 0/? | Not started | — |
| 30. LLM Streaming | 0/? | Not started | — |
| 31. AI Test Generation | 0/? | Not started | — |

---

## Dependency Chain

```
Phase 27 (Resilience Foundations)
  └→ Phase 28 (Playwright Foundation)
  |    └→ Phase 31 (AI Test Generation)
  └→ Phase 29 (Testing Dashboard) ← also needs Phase 28
  └→ Phase 30 (LLM Streaming)
```

Build order: 27 → 28 → 29 → 30 → 31
- Phase 27 must come first (all phases benefit from retry/logger/cache)
- Phase 28 before 29 (run button needs specs)
- Phase 28 before 31 (tests/e2e/ directory is generation output target)
- Phase 30 independent of 28-29 (can run in parallel if needed)

---

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| RESIL-01 | 27 |
| RESIL-02 | 27 |
| RESIL-03 | 27 |
| RESIL-04 | 27 |
| RESIL-05 | 27 |
| RESIL-06 | 27 |
| RESIL-07 | 27 |
| RESIL-08 | 27 |
| PLAY-01 | 28 |
| PLAY-02 | 28 |
| PLAY-03 | 28 |
| PLAY-04 | 28 |
| E2E-01 | 28 |
| E2E-02 | 28 |
| E2E-03 | 28 |
| E2E-04 | 28 |
| E2E-05 | 28 |
| E2E-06 | 28 |
| E2E-07 | 28 |
| E2E-08 | 28 |
| E2E-09 | 28 |
| E2E-10 | 28 |
| E2E-11 | 28 |
| E2E-12 | 28 |
| E2E-13 | 28 |
| E2E-14 | 28 |
| E2E-15 | 28 |
| API-01 | 28 |
| API-02 | 28 |
| API-03 | 28 |
| API-04 | 28 |
| API-05 | 28 |
| API-06 | 28 |
| API-07 | 28 |
| TEST-01 | 29 |
| TEST-02 | 29 |
| TEST-03 | 29 |
| TEST-04 | 29 |
| TEST-05 | 29 |
| TEST-06 | 29 |
| TEST-07 | 29 |
| TEST-08 | 29 |
| TEST-09 | 29 |
| TEST-10 | 29 |
| TEST-11 | 29 |
| TEST-12 | 29 |
| STRM-01 | 30 |
| STRM-02 | 30 |
| STRM-03 | 30 |
| STRM-04 | 30 |
| STRM-05 | 30 |
| STRM-06 | 30 |
| STRM-07 | 30 |
| AIGEN-01 | 31 |
| AIGEN-02 | 31 |
| AIGEN-03 | 31 |
| AIGEN-04 | 31 |
| AIGEN-05 | 31 |

**Mapped: 58/58 — 100% coverage**

---

## Technical Notes (for plan-phase)

### New packages
- `@playwright/test` — devDependency, host-only (NOT in Docker image)
- No new production npm dependencies required — retry, cache, logger, streaming all use Node/Web built-in APIs

### Critical constraints
- Playwright: host-only devDependency — NEVER install inside Docker image (node:20-slim lacks Chromium dependencies)
- `.dockerignore` must exclude: `tests/`, `playwright-report/`, `test-results/`
- Streaming routes: must export `dynamic = 'force-dynamic'` AND `runtime = 'nodejs'`
- Streaming routes: must set `X-Accel-Buffering: no` header (prevents nginx proxy buffering)
- `withRetry`: apply ONLY to idempotent operations (health pings, embeddings, Qdrant search) — NOT to LLM generation calls (non-idempotent; retry causes double execution and DB corruption)
- Logger: write to `/app/data/logs/` (persisted volume) — NEVER to ephemeral paths like `/app/logs/`
- SQLite test isolation: `[TEST]` prefix on all test-created data + globalTeardown cleanup + `workers: 1`
- All env vars: `process['env']['VARIABLE']` bracket notation
- All UI text in Spanish
- All API routes: `export const dynamic = 'force-dynamic'`

---
*Roadmap created: 2026-03-12*
*Milestone: v6.0 — Testing Inteligente + Performance + Estabilización*
