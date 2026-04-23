---
phase: 37-testing-dashboard-log-viewer
plan: 03
subsystem: testing-dashboard
tags: [ui, testing, history, ai-generation, detail-view]
dependency_graph:
  requires: [testing-api, test-results-tab, test-runner-hook]
  provides: [test-history-tab, test-result-detail, ai-test-generator]
  affects: [testing-page]
tech_stack:
  added: []
  patterns: [relative-time-formatting, expandable-detail-rows, clipboard-api]
key_files:
  created:
    - app/src/components/testing/test-run-history.tsx
    - app/src/components/testing/test-result-detail.tsx
    - app/src/components/testing/test-ai-generator.tsx
  modified:
    - app/src/app/testing/page.tsx
decisions:
  - State type string (not const union) for section selector to avoid TS narrowing issues with onChange
metrics:
  duration: 169s
  completed: "2026-03-13T19:26:36Z"
---

# Phase 37 Plan 03: History Tab, Failed Test Detail, AI Generator Summary

History tab with last 10 runs (relative timestamps, status badges, expandable results), failed test detail panel (error + screenshot/code placeholders), and AI test generation dialog via LLM.

## What Was Built

### TestRunHistory Component
- Displays last 10 test runs as alternating-bg rows (zinc-900/zinc-950)
- Each run shows: relative time (hace X min/h/d), type badge (section name or "Completa"), status badge (green/red/amber), aggregate counts (total/passed/failed/skipped), duration
- Clickable rows expand to show individual test results with status icons
- Failed tests in expanded view automatically render TestResultDetail
- Empty state: "Sin historial de ejecuciones" with History icon

### TestResultDetail Component
- Collapsible detail panel for failed tests with ChevronDown/Up toggle
- Error section: red-bg area with monospace font showing `result.error` (or "Error no disponible")
- Screenshot section: renders base64 image via data URL if `screenshot` prop provided, otherwise "[Screenshot no disponible]"
- Code section: renders pre/code block if `code` prop provided, otherwise shows file path placeholder
- Designed for future enrichment via optional `screenshot` and `code` props

### TestAiGenerator Component
- Dialog triggered by "Generar test con IA" button with Sparkles icon
- Section dropdown with all 15 available sections
- POST /api/testing/generate with section name, shows Loader2 while generating
- Generated code displayed in monospace pre/code block with zinc-950 bg
- "Copiar" button uses navigator.clipboard.writeText with success feedback
- Error handling with red error banner
- Dialog state resets on close

### Page Integration
- Historial tab now renders TestRunHistory with `runs` from useTestRunner
- AI generator button added to header alongside "Ejecutar todos"
- Resultados tab content from Plan 02 preserved unchanged

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 319c252 | History list and failed test detail components |
| 2 | 1c1fbe4 | AI generator dialog and page wiring |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript narrowing error on section state**
- **Found during:** Task 2 build verification
- **Issue:** `useState(SECTIONS[0])` inferred type as literal `"navigation"`, causing TS error when setting to other values via onChange
- **Fix:** Explicitly typed as `useState<string>(SECTIONS[0])`
- **Files modified:** app/src/components/testing/test-ai-generator.tsx
- **Commit:** 1c1fbe4

## Verification

- `npm run build` passes
- Historial tab shows test run history with timestamps and counts
- Failed test details show error message from results_json.error field
- AI generator dialog opens, accepts section, returns code
- Generated code is copyable to clipboard

## Self-Check: PASSED
