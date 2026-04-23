---
phase: 37-testing-dashboard-log-viewer
plan: 02
subsystem: testing-dashboard
tags: [ui, testing, dashboard, polling, react-hooks]
dependency_graph:
  requires: [testing-api, testing-page-shell]
  provides: [test-results-tab, test-runner-hook]
  affects: [testing-page]
tech_stack:
  added: []
  patterns: [polling-hook, expandable-sections, coverage-bar]
key_files:
  created:
    - app/src/hooks/use-test-runner.ts
    - app/src/components/testing/test-summary-bar.tsx
    - app/src/components/testing/test-section-list.tsx
  modified:
    - app/src/app/testing/page.tsx
decisions:
  - Array.from(map.entries()) instead of for-of on Map (downlevelIteration compat)
  - Section name extracted from spec file path via regex
metrics:
  duration: 147s
  completed: "2026-03-13T19:20:06Z"
---

# Phase 37 Plan 02: Resultados Tab — Summary Bar, Section List, Test Runner Hook

useTestRunner hook with 2s polling, summary bar with 4 stat cards + proportional coverage bar, expandable section list grouped by spec file with per-section run buttons.

## What Was Built

### useTestRunner Hook
- Manages `runs`, `latestRun`, `isRunning`, `runOutput`, `loading` state
- `fetchResults()` — GET /api/testing/results?limit=10 on mount and after runs complete
- `runTests(section?)` — POST /api/testing/run, starts polling
- Polling via `setInterval(2000)` on GET /api/testing/status, auto-clears when status is not 'running'
- Uses `useRef` for interval cleanup to avoid stale closure issues

### TestSummaryBar Component
- 4 stat cards in grid: Total (blue), Pasaron (green), Fallaron (red), Omitidos (yellow)
- Each card has icon, label, and large count number
- Visual coverage bar: horizontal flex bar with green/red/yellow segments proportional to counts
- Pulsing animation when `isRunning` is true
- Empty state: "Sin ejecuciones" when no latestRun

### TestSectionList Component
- Groups `results_json` tests by spec file path (extracts section name via regex)
- Each section is a collapsible card with header showing: name, pass/fail/skip counts, duration
- Per-section "Ejecutar" button (Play icon) calls `onRunSection(sectionName)`
- Expanded view shows individual tests with status icon, title, duration
- Failed sections get red border highlight
- All buttons disabled during execution

### Page Integration
- "Ejecutar todos" button in header (violet-600, Play/Loader2 icon)
- Resultados tab renders TestSummaryBar + TestSectionList
- Historial and Logs tabs remain as placeholders for Plans 03/04

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 87f1d52 | useTestRunner hook with polling |
| 2 | 60eb152 | Summary bar + section list + page wiring |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Map iteration downlevelIteration error**
- **Found during:** Task 2 verification (npm run build)
- **Issue:** `for (const [name, tests] of map)` fails without `--downlevelIteration` flag
- **Fix:** Replaced with `Array.from(map.entries()).map()`
- **Files modified:** app/src/components/testing/test-section-list.tsx
- **Commit:** 60eb152

## Verification

- `npm run build` passes
- Summary bar shows 4 stat cards with colored icons and visual coverage bar
- Test sections grouped by spec file with expandable details
- "Ejecutar todos" and per-section "Ejecutar" buttons present
- Polling interval set to 2000ms with proper cleanup

## Self-Check: PASSED
