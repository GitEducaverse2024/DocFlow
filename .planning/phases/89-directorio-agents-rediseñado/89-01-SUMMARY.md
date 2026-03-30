---
phase: "89"
plan: "01"
subsystem: "agents-directory"
tags: [ui, agents, directory, search, i18n]
dependency-graph:
  requires: [catpaw-types, i18n-keys-phase-88]
  provides: [expandable-directory-page, department-badge-card, search-highlight]
  affects: [agents-page, catpaw-card]
tech-stack:
  added: []
  patterns: [localStorage-persistence, expandable-sections, search-highlight-mark]
key-files:
  created: []
  modified:
    - app/src/app/agents/page.tsx
    - app/src/components/agents/catpaw-card.tsx
    - app/messages/es.json
    - app/messages/en.json
decisions:
  - "Used department field (not department_tags) for directory grouping — single canonical value per agent"
  - "Search highlights only card name (not description) to keep UI clean"
  - "Personal and Otros groups render flat card grids (no subdepartments)"
metrics:
  duration: "2m 28s"
  completed: "2026-03-30T08:55:26Z"
---

# Phase 89 Plan 01: Redesign /agents as Expandable Department Directory

Rewrote the /agents page from a flat card grid into a hierarchical department directory with three collapsible top-level groups (Empresa/Personal/Otros), seven expandable Empresa subdepartments, real-time multi-field search with auto-expand, and department badge on every CatPawCard.

## Tasks Completed

### Task 1: Update i18n search placeholders
- Updated search placeholder in es.json and en.json to reflect broader search (name, description, model, tags)
- **Commit:** f553bf3

### Task 2: Rewrite /agents/page.tsx as expandable directory
- Complete rewrite from ~226 lines to ~412 lines
- Three collapsible groups: Empresa (violet-400), Personal (sky-400), Otros (zinc-400)
- Empresa has 7 expandable subdepartment sections with lucide icons (Crown, Briefcase, etc.)
- GroupSection component: bg-zinc-900/60, left border 3px accent, hover:bg-zinc-800/40, animated chevron
- SubSection component: transparent bg, left border 2px subtle, visual indentation (ml-6)
- Empty sections (0 agents): shown dimmed (opacity-50), no chevron, "(vacio)" text via i18n
- localStorage persistence with key `catpaw-sections-state`, restored on page load
- Default state: Empresa expanded + most populated subdept expanded; Personal/Otros collapsed
- Search filters by name, description, model, and department_tags
- Search auto-expands sections with results, collapses empty ones
- Search cleared restores localStorage state
- Search empty state with catpaw illustration + "No se encontraron CatPaws"
- Mode filter pills preserved (Todos, Chat, Procesador, Hibrido)
- CatPawChatSheet integration preserved
- **Commit:** 0274e4d

### Task 3: Add department badge + highlight to CatPawCard
- New `highlight` prop for search text highlighting in card name
- Highlight rendered as `<mark>` with bg-yellow-500/30 text-yellow-200
- Department badge below name alongside existing tags area
- Badge shows icon (w-3 h-3) + translated department name
- Badge color per group: violet (Empresa), sky (Personal), zinc (Otros)
- DEPT_GROUP mapping, GROUP_BADGE_STYLES, DEPT_ICONS constants
- **Commit:** 076a067

### Task 4: Verification
- `npx tsc --noEmit` passes with zero errors
- `npm run build` succeeds (only pre-existing warnings from unrelated files)

## Deviations from Plan

None - plan executed exactly as written.

## Requirements Coverage

| Requirement | Status | Implementation |
|------------|--------|---------------|
| DIR-01 | Done | Three expandable groups: Empresa, Personal, Otros |
| DIR-02 | Done | 7 subdepts within Empresa: direction, business, marketing, finance, production, logistics, hr |
| DIR-03 | Done | Icon + name + count badge on each section header |
| DIR-04 | Done | Empty sections: opacity-50, no arrow, "(vacio)" text |
| DIR-05 | Done | Default: Empresa expanded + most populated subdept; others collapsed |
| DIR-06 | Done | localStorage key `catpaw-sections-state` persisted and restored |
| DIR-07 | Done | Group headers: bg-zinc-900/60, border-l-[3px], hover:bg-zinc-800/40, animated chevron |
| DIR-08 | Done | Subdepts: transparent bg, border-l-2 subtle, ml-6 indentation |
| SEARCH-01 | Done | Search filters by name, description, model, tags |
| SEARCH-02 | Done | Search auto-expands matching sections, collapses empty |
| SEARCH-03 | Done | Yellow highlight mark on matching card name text |
| SEARCH-04 | Done | Empty state with illustration + "No se encontraron CatPaws" |
| BADGE-01 | Done | Department badge on each card below name, alongside tags |
| BADGE-02 | Done | Badge shows icon (w-3 h-3) + department name |
| BADGE-03 | Done | Violet for Empresa, sky for Personal, zinc for Otros |
| STYLE-01 | Done | Empresa: violet-400/violet-900 accent |
| STYLE-02 | Done | Personal: sky-400/sky-900 accent |
| STYLE-03 | Done | Otros: zinc-400/zinc-800 accent |

## Self-Check: PASSED

- All 3 modified files exist on disk
- All 3 commits (0274e4d, 076a067, f553bf3) found in git log
- TypeScript and build verification passed
