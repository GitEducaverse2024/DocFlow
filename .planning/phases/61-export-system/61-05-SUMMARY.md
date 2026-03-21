---
phase: 61-export-system
plan: 05
subsystem: export-ui
tags: [ui, i18n, export, task-detail]
dependency_graph:
  requires: [61-01, 61-02]
  provides: [export-section-ui]
  affects: [task-detail-page]
tech_stack:
  added: []
  patterns: [collapsible-section, lazy-fetch-on-expand, inline-component]
key_files:
  created: []
  modified:
    - app/src/app/tasks/[id]/page.tsx
    - app/messages/es.json
    - app/messages/en.json
decisions:
  - ExportSection as inline component in page.tsx (consistent with existing pattern)
  - Lazy-load bundle list on first section open (avoids unnecessary API calls)
  - Resource counts derived from latest bundle manifest (no separate API call)
metrics:
  duration: 100s
  completed: "2026-03-21T19:50:14Z"
  tasks_completed: 3
  tasks_total: 3
---

# Phase 61 Plan 05: Export Section UI + i18n Summary

Collapsible export section on task detail page with i18n, resource summary grid, bundle generation, and bundle management (download/delete).

## What Was Done

### Task 1: i18n Keys
Added 18 translation keys under `tasks.export.*` in both `es.json` and `en.json` covering title, description, resource labels, generate/download/delete actions, and toast messages.

### Task 2: ExportSection Component
Created inline `ExportSection` component in `page.tsx` with:
- Collapsible header with Package icon and chevron toggle
- Lazy-loads bundle list via GET `/api/tasks/{id}/exports` on first open
- Resource summary grid (3 columns: agents, skills, canvases) from latest bundle manifest
- Required Docker services shown as violet Badge components
- Full-width "Generar bundle" button with gradient styling and loading spinner
- Bundle list with name, date, download (opens ZIP in new tab), and delete (with confirm dialog)
- Toast notifications via sonner on generate/delete success/error
- Placed after task metadata section, before sticky progress bar

### Task 3: Build Validation
`npm run build` passes with zero TypeScript errors.

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| 08648b2 | feat(61-05): add i18n keys for export section |
| 256ed5c | feat(61-05): add ExportSection component to task detail page |
