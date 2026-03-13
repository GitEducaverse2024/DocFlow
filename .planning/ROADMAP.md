# Roadmap: DoCatFlow v7.0 — Streaming + Testing + Logging + Notificaciones

**Milestone:** v7.0
**Phases:** 6 (phases 32–37, continuing from v6.0)
**Requirements:** 53 total
**Coverage:** 53/53
**Started:** 2026-03-13

---

## Phases

- [x] **Phase 32: Logging Foundation** - Logger module, endpoint integration, log rotation
- [ ] **Phase 33: Streaming Backend** - SSE endpoints for Chat RAG, CatBot, and Processing
- [ ] **Phase 34: Streaming Frontend** - Cursor, stop button, autoscroll, progressive markdown
- [ ] **Phase 35: Notifications System** - Data model, endpoints, auto-generation, bell UI, dropdown, panel
- [ ] **Phase 36: Playwright Setup + Test Specs** - Config, POM, test_runs table, all 15 E2E specs + 4 API specs
- [ ] **Phase 37: Testing Dashboard + Log Viewer** - /testing page, run execution, results, history, AI gen, log viewer with filters

---

## Phase Details

### Phase 32: Logging Foundation
**Goal**: Every significant action in the application writes a structured JSONL log entry to disk, with automatic cleanup of old files
**Depends on**: Nothing (foundation phase)
**Requirements**: LOG-01, LOG-02, LOG-03
**Success Criteria** (what must be TRUE when phase completes):
  1. Sending a chat message, processing a document, indexing RAG, running a task, executing a canvas, or calling a connector each produce a JSONL log line in /app/data/logs/ with timestamp, level, source, and message
  2. Log files older than 7 days are automatically deleted when the application starts
  3. The logger module exposes info/warn/error levels and every API route that touches LLM, RAG, or external services uses it
**Plans:** 3 plans

Plans:
- [x] 32-01-PLAN.md — Enhance logger.ts with source field, sync writes, integrate into service modules
- [x] 32-02-PLAN.md — Integrate logger into processing, chat, RAG, catbot, tasks, canvas, connectors routes
- [x] 32-03-PLAN.md — Integrate logger into agents, workers, skills, settings, dashboard, projects routes

### Phase 33: Streaming Backend
**Goal**: LLM responses in Chat RAG, CatBot, and document processing stream token-by-token from server to browser via SSE
**Depends on**: Phase 32 (logger available for stream error reporting)
**Requirements**: STRM-01, STRM-02, STRM-03
**Success Criteria** (what must be TRUE when phase completes):
  1. Sending a message in Chat RAG shows the first token within 2 seconds — the response builds progressively instead of appearing all at once after generation completes
  2. Sending a message to CatBot streams the response token-by-token with tool call indicators (icon + spinner) shown inline when tools execute mid-stream
  3. Processing a document shows real-time SSE progress through stages (preparando, enviando, generando, guardando) with the LLM-generated text accumulating live
  4. Browser DevTools Network tab shows progressive chunked responses (text/event-stream) for all three endpoints, not single payloads
**Plans:** 2 plans

Plans:
- [ ] 33-01-PLAN.md — Shared streamLiteLLM helper + Chat RAG SSE streaming
- [ ] 33-02-PLAN.md — CatBot streaming with tool-call loop + Process route SSE stage events

### Phase 34: Streaming Frontend
**Goal**: The streaming experience feels polished — users see a cursor while waiting, can stop generation, content auto-scrolls, and markdown renders progressively
**Depends on**: Phase 33 (streaming endpoints must exist for frontend to consume)
**Requirements**: STRM-04, STRM-05, STRM-06, STRM-07
**Success Criteria** (what must be TRUE when phase completes):
  1. A blinking cursor character appears at the end of streaming text during generation and disappears when the stream completes
  2. A "Parar generacion" button is visible during active streaming and clicking it immediately stops token arrival and removes the cursor
  3. The chat scroll position follows the latest token automatically during streaming — the user never needs to scroll manually to see new content
  4. Code blocks, headers, lists, and other markdown elements render correctly as tokens arrive — not just after the stream ends
**Plans**: TBD

### Phase 35: Notifications System
**Goal**: Users are automatically informed of completed processes, errors, and service status changes through a notification bell with badge, dropdown, and full panel
**Depends on**: Phase 32 (logger provides the event source for auto-generated notifications)
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06, NOTIF-07
**Success Criteria** (what must be TRUE when phase completes):
  1. After processing a document, indexing RAG, completing a task, or finishing a canvas execution, a notification appears in the bell dropdown without any user action
  2. The sidebar/header shows a Bell icon with a red badge showing the count of unread notifications — the badge updates every 15 seconds via polling
  3. Clicking the bell opens a dropdown showing the last 20 notifications with severity icon, title, truncated message, relative time, and a "Ver" link that navigates to the related resource
  4. A full notifications panel allows filtering by type and severity with pagination for browsing older notifications
  5. Clicking "Marcar todas como leidas" clears the badge count and marks all notifications as read
**Plans**: TBD

### Phase 36: Playwright Setup + Test Specs
**Goal**: A complete Playwright test suite with Page Object Models covers all application sections — running the suite produces a structured JSON report
**Depends on**: Phase 33, Phase 34 (streaming must work before chat/CatBot specs can verify responses), Phase 35 (notification bell must exist before navigation spec can verify it)
**Requirements**: PLAY-01, PLAY-02, PLAY-03, PLAY-04, E2E-01, E2E-02, E2E-03, E2E-04, E2E-05, E2E-06, E2E-07, E2E-08, E2E-09, E2E-10, E2E-11, E2E-12, E2E-13, E2E-14, E2E-15, API-01, API-02, API-03, API-04
**Success Criteria** (what must be TRUE when phase completes):
  1. Running `npx playwright test` from the app directory executes all 19 specs (15 E2E + 4 API) against http://localhost:3500 and produces JSON + HTML reports
  2. Each application section (dashboard, projects, sources, processing, RAG, chat, agents, workers, skills, tasks, canvas, connectors, CatBot, settings) has a typed Page Object Model used by its corresponding spec
  3. Test data created during spec runs is fully cleaned up after — no [TEST]-prefixed rows remain in the live database after globalTeardown
  4. The test_runs table in SQLite stores execution results (type, section, status, total/passed/failed/skipped, duration, results_json) for consumption by the testing dashboard
**Plans**: TBD

### Phase 37: Testing Dashboard + Log Viewer
**Goal**: Users can trigger tests, view results, browse history, generate tests with AI, and inspect application logs — all from the /testing page without SSH access
**Depends on**: Phase 36 (specs must exist for run button to work), Phase 32 (JSONL logs must exist for log viewer)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07, TEST-08, TEST-09, LOG-04, LOG-05, LOG-06, LOG-07
**Success Criteria** (what must be TRUE when phase completes):
  1. The /testing page appears in the sidebar between Conectores and Configuracion with a FlaskConical icon, showing a summary bar with total/pass/fail/skip counts
  2. Clicking "Ejecutar todos" triggers a Playwright run and the UI polls every 2 seconds showing progress — individual section "Ejecutar" buttons run targeted specs
  3. Test results show expandable sections with individual test status (pass/fail/skip), duration, and failed tests display error message, screenshot (if available), and test code
  4. The history tab shows the last 10 test runs with timestamps and aggregate counts — different runs are comparable at a glance
  5. The log viewer tab streams JSONL application logs with filters for level (info/warn/error), source (processing/chat/rag/catbot/tasks/canvas/connectors), text search, and a "Descargar logs" button for the current day's file
**Plans**: TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 32. Logging Foundation | 3/3 | Complete | 2026-03-13 |
| 33. Streaming Backend | 0/2 | In progress | - |
| 34. Streaming Frontend | 0/? | Not started | - |
| 35. Notifications System | 0/? | Not started | - |
| 36. Playwright Setup + Test Specs | 0/? | Not started | - |
| 37. Testing Dashboard + Log Viewer | 0/? | Not started | - |

---

## Dependency Chain

```
Phase 32 (Logging Foundation)
  |-> Phase 33 (Streaming Backend)
  |     |-> Phase 34 (Streaming Frontend)
  |           |-> Phase 36 (Playwright Setup + Test Specs)
  |-> Phase 35 (Notifications System)
  |     |-> Phase 36 (Playwright Setup + Test Specs)
  |-> Phase 37 (Testing Dashboard + Log Viewer) <- also needs Phase 36
```

Build order: 32 -> 33 -> 34 -> 35 -> 36 -> 37
- Phase 32 first (logging is foundation for all other phases)
- Phase 33 before 34 (backend streaming before frontend polish)
- Phase 35 can run after 32 (parallel with 33-34 if needed)
- Phase 36 after 34 and 35 (specs need streaming + notifications to be working)
- Phase 37 last (dashboard needs specs to exist and logs to be flowing)

---

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| LOG-01 | 32 |
| LOG-02 | 32 |
| LOG-03 | 32 |
| STRM-01 | 33 |
| STRM-02 | 33 |
| STRM-03 | 33 |
| STRM-04 | 34 |
| STRM-05 | 34 |
| STRM-06 | 34 |
| STRM-07 | 34 |
| NOTIF-01 | 35 |
| NOTIF-02 | 35 |
| NOTIF-03 | 35 |
| NOTIF-04 | 35 |
| NOTIF-05 | 35 |
| NOTIF-06 | 35 |
| NOTIF-07 | 35 |
| PLAY-01 | 36 |
| PLAY-02 | 36 |
| PLAY-03 | 36 |
| PLAY-04 | 36 |
| E2E-01 | 36 |
| E2E-02 | 36 |
| E2E-03 | 36 |
| E2E-04 | 36 |
| E2E-05 | 36 |
| E2E-06 | 36 |
| E2E-07 | 36 |
| E2E-08 | 36 |
| E2E-09 | 36 |
| E2E-10 | 36 |
| E2E-11 | 36 |
| E2E-12 | 36 |
| E2E-13 | 36 |
| E2E-14 | 36 |
| E2E-15 | 36 |
| API-01 | 36 |
| API-02 | 36 |
| API-03 | 36 |
| API-04 | 36 |
| TEST-01 | 37 |
| TEST-02 | 37 |
| TEST-03 | 37 |
| TEST-04 | 37 |
| TEST-05 | 37 |
| TEST-06 | 37 |
| TEST-07 | 37 |
| TEST-08 | 37 |
| TEST-09 | 37 |
| LOG-04 | 37 |
| LOG-05 | 37 |
| LOG-06 | 37 |
| LOG-07 | 37 |

**Mapped: 53/53 -- 100% coverage**

---

## Technical Notes (for plan-phase)

### New packages
- `@playwright/test` — devDependency, chromium + deps in Dockerfile runner stage
- No new production npm dependencies — streaming, logging, notifications all use Node/Web built-in APIs

### Critical constraints
- Streaming routes: must export `dynamic = 'force-dynamic'` AND `runtime = 'nodejs'`
- Streaming routes: must set `X-Accel-Buffering: no` header (prevents nginx proxy buffering in Docker)
- ReadableStream `start(controller)` must run in background — return `new Response(stream)` immediately
- Logger: write to `/app/data/logs/` (volume-mounted) with fs.appendFileSync (sync to prevent loss)
- Logger: JSONL format, one JSON object per line, rotate files > 7 days old
- Playwright: `workers: 1` in config (prevent SQLite lock errors)
- SQLite test isolation: `[TEST]` prefix + globalTeardown cleanup
- Notifications: polling cada 15s, no WebSocket
- Streaming cursor: blinking U+2588 with CSS animation 0.8s
- All env vars: `process['env']['VARIABLE']` bracket notation
- All UI text in Spanish
- All API routes: `export const dynamic = 'force-dynamic'`

---
*Roadmap created: 2026-03-13*
*Milestone: v7.0 — Streaming + Testing + Logging + Notificaciones*
