---
phase: 37-testing-dashboard-log-viewer
plan: 01
subsystem: testing-dashboard
tags: [api, testing, logs, sidebar, playwright]
dependency_graph:
  requires: [logger, db, llm]
  provides: [testing-api, log-api, testing-page-shell]
  affects: [sidebar]
tech_stack:
  added: []
  patterns: [shared-module-state, child-process-spawn, jsonl-parsing]
key_files:
  created:
    - app/src/lib/testing-state.ts
    - app/src/app/api/testing/run/route.ts
    - app/src/app/api/testing/status/route.ts
    - app/src/app/api/testing/results/route.ts
    - app/src/app/api/testing/generate/route.ts
    - app/src/app/api/system/logs/route.ts
    - app/src/app/api/system/logs/download/route.ts
    - app/src/app/testing/page.tsx
  modified:
    - app/e2e/reporters/sqlite-reporter.ts
    - app/src/components/layout/sidebar.tsx
decisions:
  - Shared testing-state.ts module for cross-route state (avoids module isolation issues)
  - Section-to-spec mapping as const object in run route
metrics:
  duration: 195s
  completed: "2026-03-13T19:14:00Z"
---

# Phase 37 Plan 01: Testing API Routes + Page Shell Summary

6 API routes (testing run/status/results/generate, system logs/download), shared state module, sidebar entry, and 3-tab page shell for the testing dashboard.

## What Was Built

### SQLite Reporter Update
- Added optional `error` field to `testResults` array type
- `onTestEnd` now captures `result.error?.message` from Playwright's TestResult
- Error data automatically included in `results_json` column via JSON.stringify

### API Routes (all export `dynamic = 'force-dynamic'`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/testing/run` | POST | Spawns Playwright child process, returns run ID |
| `/api/testing/status` | GET | Returns current run status (idle/running/passed/failed) |
| `/api/testing/results` | GET | Queries test_runs table with limit param |
| `/api/testing/generate` | POST | Uses LLM to generate E2E specs for a section |
| `/api/system/logs` | GET | Reads/filters JSONL log entries by level/source/search |
| `/api/system/logs/download` | GET | Returns raw JSONL file as downloadable attachment |

### Shared State Module
- `testing-state.ts` exports `getCurrentRun()` / `setCurrentRun()` with `TestRunState` interface
- Used by both run and status routes to share in-memory state

### Sidebar + Page Shell
- FlaskConical icon added to sidebar between Notificaciones and Configuracion
- `/testing` page with 3 tabs: Resultados, Historial, Logs
- Tab content areas are placeholders for Plans 02, 03, 04

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 902b4d5 | API routes + SQLite reporter update + shared state |
| 2 | a62e29f | Sidebar entry + page shell with tabs |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npm run build` passes
- `npx tsc --noEmit` passes
- All 6 API routes export `dynamic = 'force-dynamic'`
- Sidebar includes FlaskConical and /testing at correct position
- /testing page renders with 3 clickable tabs
- SQLite reporter captures `error?.message`

## Self-Check: PASSED
