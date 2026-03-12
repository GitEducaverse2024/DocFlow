---
phase: 23-modelo-datos-api-crud-lista-wizard
plan: "03"
subsystem: canvas-ui
tags: [canvas, navigation, list-page, wizard, ui-components]
dependency_graph:
  requires: [23-01]
  provides: [canvas-nav, canvas-list-page, canvas-card-component, canvas-wizard-component]
  affects: [sidebar, breadcrumb, canvas-routes]
tech_stack:
  added: []
  patterns: [page-header-pattern, filter-tabs-pattern, card-grid-pattern, dialog-wizard-pattern]
key_files:
  created:
    - app/src/app/canvas/page.tsx
    - app/src/components/canvas/canvas-card.tsx
    - app/src/components/canvas/canvas-wizard.tsx
  modified:
    - app/src/components/layout/sidebar.tsx
    - app/src/components/layout/breadcrumb.tsx
key_decisions:
  - "img tag used for SVG thumbnails (not next/image) because SVG data URIs don't benefit from image optimization"
  - "Template mode in wizard shows no-templates message when empty (friendly UX, no placeholder needed)"
  - "Canvas page imports CanvasWizard directly (co-located in components/canvas/)"
metrics:
  duration: ~180s
  completed_date: "2026-03-12"
  tasks_completed: 2
  files_changed: 5
---

# Phase 23 Plan 03: Canvas Navigation, List Page, and Creation Wizard Summary

**One-liner:** Sidebar Canvas link, /canvas list page with filter tabs and card grid, 2-step creation wizard Dialog using mode cards + details form.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add sidebar link, breadcrumb, and canvas list page | 22d8be3 | sidebar.tsx, breadcrumb.tsx, canvas/page.tsx, canvas-card.tsx |
| 2 | Create canvas creation wizard Dialog | 6368f4b | canvas-wizard.tsx |

## What Was Built

### Task 1: Navigation + List Page + Card Component

**Sidebar (NAV-01):** Added `Workflow` icon import and `{ href: '/canvas', label: 'Canvas', icon: Workflow }` nav item inserted between Tareas and Conectores.

**Breadcrumb (NAV-02):** Added `'canvas': 'Canvas'` entry to ROUTE_LABELS in `breadcrumb.tsx`.

**CanvasCard component (LIST-01):** `app/src/components/canvas/canvas-card.tsx` renders:
- SVG thumbnail (data URI via `<img>`) or dark placeholder with emoji
- Emoji + truncated name, 1-line description
- Mode badge (violet/blue/emerald), relative time
- Editar (link to /canvas/{id}) and Eliminar (calls onDelete) buttons

**Canvas list page (LIST-01..04, NAV-02):** `app/src/app/canvas/page.tsx` with:
- PageHeader: title="Canvas", icon=Workflow, "+ Nuevo" button opens wizard
- Filter tabs: Todos/Agentes/Proyectos/Mixtos/Plantillas with live counts
- Card grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`
- Empty state (LIST-04): dashed border, Workflow icon, title, subtitle, "Crear Canvas" button, "o preguntale a CatBot" link
- Templates section (LIST-03): only shown when templates exist, with "Usar" button
- Delete: window.confirm → DELETE /api/canvas/{id} → refetch
- On wizard success: refetch + router.push to /canvas/{id}

### Task 2: Creation Wizard (WIZ-01, WIZ-02, WIZ-03)

`app/src/components/canvas/canvas-wizard.tsx` — shadcn Dialog with 2 steps:

**Step 1 (WIZ-01):** 2x2 grid of mode cards:
- Agentes (Bot icon, violet)
- Proyectos (FolderKanban icon, blue)
- Mixto (Layers icon, emerald)
- Desde Plantilla (FileText icon, amber)
Clicking any card sets mode and advances to step 2. `initialMode` prop auto-advances.

**Step 2 (WIZ-02, WIZ-03):** Details form:
- Name input (required), Description textarea (optional)
- Emoji picker: 12 preset emojis + custom text input
- Tags input (comma-separated)
- Template mode: fetches /api/canvas/templates, shows selectable template list; no-templates message if empty
- "Crear y abrir editor" button (disabled when name empty or loading)
- "Atras" button returns to step 1
- Submit: POST /api/canvas or /api/canvas/from-template → calls onCreated(id)
- Resets all state on close via useEffect watching `open` prop

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `app/src/app/canvas/page.tsx` — EXISTS
- [x] `app/src/components/canvas/canvas-card.tsx` — EXISTS
- [x] `app/src/components/canvas/canvas-wizard.tsx` — EXISTS
- [x] `app/src/components/layout/sidebar.tsx` — MODIFIED (Canvas nav item added)
- [x] `app/src/components/layout/breadcrumb.tsx` — MODIFIED (canvas label added)
- [x] Commit 22d8be3 — Task 1
- [x] Commit 6368f4b — Task 2
- [x] Build passed (npm run build — only pre-existing warnings, no errors)
