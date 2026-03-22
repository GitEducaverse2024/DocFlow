---
phase: 63-rename-ui-bd-base-api-inter-catflow
plan: 01
subsystem: ui-navigation
tags: [sidebar, routing, catflow, i18n, refactor]
dependency_graph:
  requires: []
  provides: [catflow-routes, catflow-sidebar-entry, task-list-shared-component]
  affects: [sidebar, breadcrumb, tasks-page]
tech_stack:
  added: []
  patterns: [shared-component-extraction, pathname-based-branching]
key_files:
  created:
    - app/src/components/tasks/task-list-content.tsx
    - app/src/app/catflow/page.tsx
    - app/src/app/catflow/[id]/page.tsx
    - app/src/app/catflow/new/page.tsx
  modified:
    - app/src/components/layout/sidebar.tsx
    - app/src/components/layout/breadcrumb.tsx
    - app/src/app/tasks/page.tsx
    - app/messages/es.json
    - app/messages/en.json
decisions:
  - Extracted TaskListContent shared component from tasks/page.tsx instead of duplicating
  - TaskListContent uses usePathname to detect /catflow vs /tasks and adjusts icon, title, and links
  - catflow/[id] and catflow/new re-export tasks page default exports directly
  - Hardcoded CatFlow title for now -- plan 63-04 will wire proper i18n namespace
metrics:
  duration: 181s
  completed: "2026-03-22T10:41:00Z"
  tasks_completed: 1
  tasks_total: 1
  files_created: 4
  files_modified: 5
---

# Phase 63 Plan 01: Sidebar CatFlow Rename + Route Setup Summary

Sidebar entry renamed from Tareas (ClipboardList) to CatFlow (Zap icon), with /catflow routes mirroring /tasks via shared TaskListContent component and thin page wrappers.

## Tasks Completed

### Task 1: Update sidebar nav item and create /catflow routes
**Commit:** 6623655

**What was done:**
- Sidebar nav item changed from `{ href: '/tasks', icon: ClipboardList, labelKey: 'tasks' }` to `{ href: '/catflow', icon: Zap, labelKey: 'catflow' }`
- Extracted full task list logic from `tasks/page.tsx` into `TaskListContent` shared component
- `TaskListContent` detects `usePathname()` prefix to show Zap icon + "CatFlow" title on /catflow routes, ClipboardList + translated title on /tasks routes
- Task card links and "new task" button dynamically use the current base path (/catflow or /tasks)
- Created `/catflow` route as thin wrapper rendering `<TaskListContent />`
- Created `/catflow/[id]` route importing and re-rendering `TaskDetailPage` from tasks/[id]
- Created `/catflow/new` route importing and re-rendering `NewTaskPage` from tasks/new
- `tasks/page.tsx` reduced to thin wrapper rendering same `<TaskListContent />`
- Added `catflow` to breadcrumb ROUTE_KEYS array
- Added `nav.catflow` and `layout.breadcrumb.catflow` i18n keys in both es.json and en.json

**Backward compatibility:** All /tasks routes remain fully functional with no redirects.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npm run build` passes clean
- /catflow, /catflow/[id], /catflow/new all appear in build output
- /tasks, /tasks/[id], /tasks/new all remain in build output
- Sidebar will show "CatFlow" with Zap icon linking to /catflow

## Self-Check: PASSED

- All 4 created files exist on disk
- Commit 6623655 verified in git log
- Build output confirms all 6 routes (/catflow/*, /tasks/*) present
