---
phase: 45-ui-pagina-agentes-rediseñada
plan: 01
subsystem: ui
tags: [agents, catpaw, sidebar, grid, filters]
dependency_graph:
  requires: [cat-paws-api, catpaw-types]
  provides: [agents-page-grid, catpaw-card-component, sidebar-catpaw-icon]
  affects: [sidebar, agents-page]
tech_stack:
  added: []
  patterns: [client-side-filtering, mode-badge-colors, responsive-grid]
key_files:
  created:
    - app/src/components/agents/catpaw-card.tsx
  modified:
    - app/src/components/layout/sidebar.tsx
    - app/src/app/agents/page.tsx
decisions:
  - CatPawIcon as inline component in sidebar (Image wrapper matching navItems pattern)
  - Client-side filtering for mode/search/department (no server round-trips)
  - Mode badge colors: violet=chat, teal=processor, amber=hybrid
metrics:
  duration: 121s
  completed: "2026-03-15T13:32:45Z"
---

# Phase 45 Plan 01: Agents Page Redesign Summary

Sidebar updated with CatPaw icon, Workers removed; /agents page rewritten as CatPaw grid with mode/search/department filters and reusable CatPawCard component.

## Tasks Completed

### Task 1: Update sidebar -- PawPrint icon for Agentes, remove Workers
- **Commit:** 66c49d5
- Created `CatPawIcon` inline component using `next/image` with `/Images/icon/catpaw.png`
- Replaced `Bot` icon on Agentes nav item with `CatPawIcon`
- Removed `Docs Workers` entry entirely
- Cleaned up unused imports (`Bot`, `FileOutput`)

### Task 2: CatPawCard component + /agents page rewrite
- **Commit:** 5c6f070
- **CatPawCard** (`app/src/components/agents/catpaw-card.tsx`):
  - Mode badges with distinct colors (violet/teal/amber)
  - Emoji avatar, name, description (2-line clamp), model badge, department pills
  - Relation counts row (skills, catbrains, connectors, agents)
  - Inactive paws shown with opacity-50
- **Agents page** (`app/src/app/agents/page.tsx`):
  - Fetches from `/api/cat-paws` on mount
  - Mode toggle filter bar (Todos/Chat/Procesador/Hibrido) with matching colors
  - Text search by name (real-time)
  - Department dropdown derived from all paws' tags
  - 3-column responsive grid (1/2/3 cols)
  - Empty state with catpaw icon and contextual message
  - "Crear CatPaw" button navigates to `/agents/new`

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- Build passes without errors
- Lint passes without warnings
- Sidebar shows "Agentes" with catpaw.png icon, no Workers entry
- /agents page renders CatPaw grid with all filter types functional

## Self-Check: PASSED

- FOUND: app/src/components/agents/catpaw-card.tsx
- FOUND: app/src/components/layout/sidebar.tsx
- FOUND: app/src/app/agents/page.tsx
- FOUND: commit 66c49d5 (Task 1)
- FOUND: commit 5c6f070 (Task 2)
