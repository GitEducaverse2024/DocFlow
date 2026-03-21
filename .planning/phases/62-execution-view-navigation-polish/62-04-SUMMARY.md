---
phase: 62-execution-view-navigation-polish
plan: "04"
subsystem: navigation-i18n
tags: [sidebar, redirect, i18n, build-validation]
dependency_graph:
  requires: [62-01, 62-02, 62-03]
  provides: [canvas-sidebar-removal, canvas-redirect, i18n-completeness]
  affects: [sidebar, canvas-page, tasks-page, i18n-files]
tech_stack:
  added: []
  patterns: [permanentRedirect, toast-on-redirect-via-search-param]
key_files:
  created: []
  modified:
    - app/src/components/layout/sidebar.tsx
    - app/src/app/canvas/page.tsx
    - app/src/app/tasks/page.tsx
    - app/messages/en.json
    - app/messages/es.json
decisions:
  - "Used permanentRedirect (301) instead of redirect (307) for canvas->tasks"
  - "Toast trigger via ?from=canvas search param, cleaned from URL after display"
  - "Workflow icon removed from sidebar imports (no longer referenced)"
metrics:
  duration: 104s
  completed: "2026-03-21T21:59:47Z"
---

# Phase 62 Plan 04: Navigation + Sidebar + i18n Audit + Build Validation Summary

Removed canvas from sidebar nav, replaced /canvas list page with 301 redirect to /tasks with toast notification, audited all 62-* i18n keys, and validated build passes.

## Task Results

| Task | Name | Status | Commit | Key Files |
|------|------|--------|--------|-----------|
| 1 | Remove canvas from sidebar | Done | 7d3b094 | sidebar.tsx |
| 2 | Replace canvas list page with redirect | Done | cfec55d | canvas/page.tsx |
| 3 | Show toast on /tasks when redirected | Done | 18af9af | tasks/page.tsx |
| 4 | Verify /canvas/[id] still works | Done | (verify-only) | canvas/[id]/page.tsx |
| 5 | i18n audit + add canvasRedirectMessage | Done | 22565c0 | en.json, es.json |
| 6 | Build validation | Done | (verify-only) | - |

## Changes Made

### Task 1: Remove canvas from sidebar
- Removed `{ href: '/canvas', labelKey: 'canvas', icon: Workflow }` entry from navItems array
- Removed unused `Workflow` import from lucide-react

### Task 2: Replace canvas list page with redirect
- Replaced entire 256-line canvas list page with 5-line permanentRedirect to `/tasks?from=canvas`
- Uses Next.js permanentRedirect for 301 status code

### Task 3: Show toast on redirect
- Added useEffect in tasks page to detect `?from=canvas` search param
- Shows `toast.info()` with i18n key `canvasRedirectMessage`
- Cleans URL by removing search param via `window.history.replaceState`

### Task 4: Verify /canvas/[id]
- Confirmed `/canvas/[id]/page.tsx` is unaffected by redirect on `/canvas`
- Next.js routes these as separate pages; dynamic route still loads CanvasEditor

### Task 5: i18n audit
- Added `canvasRedirectMessage` to both en.json and es.json
- Verified all 12 keys from 62-01/02/03 present in both files:
  - tasks.detail.canvasNode, canvasCurrentNode, canvasLiveView, canvasModalTitle, canvasModalLoading
  - tasks.detail.cycleLabel, cycleStepInfo
  - tasks.detail.forkExecution, forkWaiting
  - tasks.stepTypes.fork, tasks.stepTypes.join

### Task 6: Build validation
- `npm run build` passes cleanly with no TypeScript or module errors
- All routes compile successfully including modified canvas and tasks pages

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- Build passes: confirmed
- Canvas removed from sidebar: confirmed (navItems array, Workflow import removed)
- /canvas redirects to /tasks: confirmed (permanentRedirect)
- /canvas/[id] unaffected: confirmed (separate route file)
- All i18n keys present in both languages: confirmed
