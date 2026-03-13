---
phase: 37-testing-dashboard-log-viewer
plan: 04
subsystem: testing-dashboard
tags: [ui, logs, polling, filters, download]
dependency_graph:
  requires: [testing-api, log-api, testing-page-shell]
  provides: [log-viewer-tab, log-filters, log-viewer-hook]
  affects: [testing-page]
tech_stack:
  added: []
  patterns: [polling-hook, debounced-search, auto-scroll]
key_files:
  created:
    - app/src/hooks/use-log-viewer.ts
    - app/src/components/testing/log-filters.tsx
    - app/src/components/testing/log-viewer.tsx
  modified:
    - app/src/app/testing/page.tsx
decisions:
  - Debounced search uses useRef+setTimeout pattern (500ms) to avoid excessive API calls
  - Auto-scroll uses scrollTop=scrollHeight on entries change for real-time log tailing
metrics:
  duration: 126s
  completed: "2026-03-13T19:31:00Z"
---

# Phase 37 Plan 04: Log Viewer Tab — Filters, Polling, Download Summary

useLogViewer hook with 3s polling and debounced search, LogFilters with level/source/text controls and download button, LogViewer with auto-scroll and metadata expansion.

## What Was Built

### useLogViewer Hook
- Manages `entries`, `level`, `source`, `search`, `loading`, `autoRefresh` state
- `fetchLogs()` builds query params from filter state, GETs /api/system/logs
- Polling via `setInterval(3000)` when autoRefresh is true, with proper cleanup
- Search debounce: 500ms delay using useRef+setTimeout before triggering fetch
- `downloadLogs()` opens /api/system/logs/download in new window

### LogFilters Component
- Horizontal flex row with gap-3, wraps on mobile
- Level select: Todos/Info/Warn/Error with zinc-900 bg, violet focus ring
- Source select: Todas + all 13 LogSource values
- Search input with Search icon and "Buscar en logs..." placeholder
- Auto-refresh toggle button with spinning RefreshCw icon when active
- Download button "Descargar logs" with Download icon
- All text in Spanish

### LogViewer Component
- Scrollable list (max-h-[600px]) with auto-scroll to bottom on new entries
- Each entry row: timestamp (HH:MM:SS monospace), level badge (blue/amber/red), source badge (violet), message (truncated with title tooltip)
- Alternating row backgrounds (zinc-950/zinc-900)
- Metadata expansion: "+" button shows JSON.stringify(metadata, null, 2) in pre block
- Empty state: "Sin logs para los filtros seleccionados"
- Loading state: Loader2 spinner

### Page Integration
- useLogViewer destructured with renamed fields to avoid conflicts with useTestRunner
- Logs tab renders LogFilters + LogViewer
- Resultados and Historial tabs preserved unchanged from Plans 02/03

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 4da644f | useLogViewer hook + LogFilters component |
| 2 | d89b871 | LogViewer component + Logs tab page wiring |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npm run build` passes
- Log entries display with timestamp, level badge, source badge, message
- Level/source/text filters wired to useLogViewer hook
- Polling interval set to 3000ms with autoRefresh toggle
- Download button calls window.open on /api/system/logs/download
- Metadata expandable via "+" button on entries with metadata

## Self-Check: PASSED
