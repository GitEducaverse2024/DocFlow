---
phase: 06-tasks-list-page-sidebar
plan: 01
subsystem: tasks-ui
tags: [ui, tasks, sidebar, page]
dependency_graph:
  requires: [api-tasks, api-tasks-templates]
  provides: [tasks-list-page, sidebar-tareas-entry]
  affects: [sidebar]
tech_stack:
  added: []
  patterns: [status-badge-config, inline-timeAgo, template-step-parser]
key_files:
  created:
    - app/src/app/tasks/page.tsx
  modified:
    - app/src/components/layout/sidebar.tsx
decisions:
  - Inline timeAgo helper instead of date-fns dependency
  - EnrichedTask interface defined inline in page (no separate file)
  - Status filter groups: running includes paused/configuring/ready
metrics:
  duration: 104s
  completed: "2026-03-11T14:56:22Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 1
---

# Phase 6 Plan 01: Tasks List Page + Sidebar Summary

JWT-free tasks list page with status-colored cards, 4-filter button group with counts, templates section, and sidebar navigation entry using ClipboardList icon.

## What Was Built

### Sidebar Entry (Task 1)
- Added `ClipboardList` import from lucide-react
- Inserted `{ href: '/tasks', label: 'Tareas', icon: ClipboardList }` between Skills and Configuracion in navItems array

### /tasks Page (Task 2)
- **Header**: ClipboardList icon + "Tareas" title + "Nueva tarea" button linking to /tasks/new
- **Filters**: Todas, En curso, Completadas, Borradores -- each with live count from fetched data
- **Task Cards**: Grid layout (1/2/3 cols responsive) with:
  - Status badge using STATUS_CONFIG (7 statuses with correct color classes)
  - Running status has `animate-pulse` class
  - Task name (clickable, links to /tasks/{id})
  - Description (line-clamp-2)
  - Progress bar (steps_completed/steps_count)
  - Agent badges with Bot icon
  - Footer: project names + relative date
- **Empty State**: Dashed border, ClipboardList icon, contextual message, CTA button
- **Templates Section**: Grid of template cards with emoji, name, description, step count, "Usar" button
- **Data Fetching**: Parallel fetch of /api/tasks and /api/tasks/templates on mount

### Build Verification (Task 3)
- `npm run build` passes with /tasks listed as static page (5.51 kB)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 10fe068 | Add Tareas entry to sidebar with ClipboardList icon |
| 2 | e99759c | Create /tasks page with cards, filters, templates, empty state |
| 3 | (no changes) | Build verification passed |

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PASSED
