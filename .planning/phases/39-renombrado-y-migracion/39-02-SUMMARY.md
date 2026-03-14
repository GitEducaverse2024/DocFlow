---
phase: 39-renombrado-y-migracion
plan: 02
subsystem: ui-pages + components
tags: [rename, ui, catbrains, sidebar, breadcrumbs, routing]
dependency_graph:
  requires: [catbrains-table, catbrains-api, projects-redirects]
  provides: [catbrains-pages, catbrains-sidebar, catbrains-breadcrumbs, catbrains-components]
  affects: [sidebar, breadcrumbs, pages, source-components, process-components, rag-components, chat-components]
tech_stack:
  added: []
  patterns: [page-route-copy-rename, redirect-stubs, icon-branding]
key_files:
  created:
    - app/src/app/catbrains/page.tsx
    - app/src/app/catbrains/new/page.tsx
    - app/src/app/catbrains/[id]/page.tsx
    - app/src/app/catbrains/error.tsx
  modified:
    - app/src/app/projects/page.tsx
    - app/src/app/projects/new/page.tsx
    - app/src/app/projects/[id]/page.tsx
    - app/src/app/projects/error.tsx
    - app/src/components/layout/sidebar.tsx
    - app/src/components/layout/breadcrumb.tsx
    - app/src/app/page.tsx
    - app/src/components/system/system-health-panel.tsx
    - app/src/components/projects/delete-project-dialog.tsx
    - app/src/components/projects/project-settings-sheet.tsx
    - app/src/components/chat/chat-panel.tsx
    - app/src/components/sources/source-manager.tsx
    - app/src/components/sources/source-list.tsx
    - app/src/components/sources/note-editor.tsx
    - app/src/components/sources/url-input.tsx
    - app/src/components/sources/youtube-input.tsx
    - app/src/components/sources/file-upload-zone.tsx
    - app/src/components/process/process-panel.tsx
    - app/src/components/process/version-history.tsx
    - app/src/components/rag/rag-panel.tsx
    - app/src/app/canvas/page.tsx
    - app/src/components/canvas/canvas-card.tsx
decisions:
  - "Old /projects pages become redirect stubs (not deleted) for backward compat"
  - "Canvas mode type widened to string for backward compat with old 'projects' mode entries"
  - "ico_catbrain.png used in list cards (24x24) and detail headers (32x32)"
metrics:
  duration: 840s
  completed: "2026-03-14"
  tasks: 3
  files: 25
---

# Phase 39 Plan 02: UI Rename Proyectos to CatBrains Summary

All user-facing UI renamed from "Proyectos" to "CatBrains" -- new /catbrains page routes with ico_catbrain.png branding, sidebar Brain icon, breadcrumbs updated, and all component fetch URLs pointing to /api/catbrains.

## Task Results

### Task 1: Create /catbrains page routes and redirect old /projects pages
**Commit:** 7174153

Created four new page files under `/catbrains/`:
- **page.tsx**: List page with ico_catbrain.png in header and per-card, fetches from `/api/catbrains`
- **new/page.tsx**: Creation wizard with CatBrain terminology, fetches from `/api/catbrains`
- **[id]/page.tsx**: Detail page with ico_catbrain.png in header, fetches from `/api/catbrains`
- **error.tsx**: Error boundary with CatBrains section name

Converted old `/projects/` pages to simple redirect stubs:
- `projects/page.tsx` -> redirects to `/catbrains`
- `projects/new/page.tsx` -> redirects to `/catbrains/new`
- `projects/[id]/page.tsx` -> redirects to `/catbrains/${id}`
- `projects/error.tsx` -> redirects to `/catbrains`

### Task 2: Update sidebar, breadcrumbs, and layout components
**Commit:** c6bd920

- Sidebar: Changed `FolderKanban` to `Brain` icon, label "CatBrains", href `/catbrains`
- Breadcrumb: Added `catbrains` route label mapping
- Homepage: Links to `/catbrains/new`, summary card with Brain icon and "CatBrains" label, storage label updated
- System health panel: "Proyectos" count label changed to "CatBrains"

### Task 3: Update domain components
**Commit:** 59d1c15

Updated all fetch URLs from `/api/projects/` to `/api/catbrains/` in:
- Source components: source-manager, source-list, note-editor, url-input, youtube-input, file-upload-zone
- Process components: process-panel, version-history
- RAG panel and chat panel
- Project settings sheet and delete dialog

Updated all visible text from "Proyecto(s)" to "CatBrain(s)" in:
- Delete dialog: "Eliminar CatBrain"
- Settings sheet: "Configuracion del CatBrain", all labels
- Chat panel: placeholder and welcome text
- RAG panel: MCP endpoint description
- Process panel: empty state text

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Canvas mode type backward compat**
- **Found during:** Task 3 verification
- **Issue:** Canvas CanvasListItem `mode` union type included `'projects'` but FilterKey and counts object had been updated to use `catbrains`. TypeScript error on counts object indexing.
- **Fix:** Widened mode to `string` in CanvasListItem for backward compat, removed `projects` from FilterKey
- **Files modified:** app/src/app/canvas/page.tsx, app/src/components/canvas/canvas-card.tsx
- **Commit:** 59d1c15

**2. [Rule 3 - Blocking] Unused FolderOpen import after migration**
- **Found during:** Build verification
- **Issue:** `FolderOpen` import in dashboard page became unused after replacing summary card icon with `Brain`
- **Fix:** Removed unused import
- **Files modified:** app/src/app/page.tsx
- **Commit:** ad91b51

## Verification

1. `npx tsc --noEmit` -- passes with zero errors
2. `npm run build` -- compiles successfully
3. No remaining "Proyectos" or `/api/projects` in UI component files (only in API redirect routes per 39-01 design)

## Self-Check: PASSED

All 4 created files exist. All 4 commits found in git log.
