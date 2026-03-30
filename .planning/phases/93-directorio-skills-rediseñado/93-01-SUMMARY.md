---
phase: "93"
plan: "01"
subsystem: skills-directory
tags: [ui, directory, skills, expandable-sections, search]
dependency-graph:
  requires: [phase-91-categories, phase-92-seeds]
  provides: [skills-directory-page]
  affects: [/skills]
tech-stack:
  added: []
  patterns: [expandable-directory, localStorage-persistence, client-side-filtering, search-highlight]
key-files:
  created: []
  modified:
    - app/src/app/skills/page.tsx
    - app/messages/es.json
    - app/messages/en.json
decisions:
  - Client-side filtering instead of server-side for instant search UX
  - Single-level directory (no sub-groups) unlike /agents which has 2 levels
  - Tags capped at 3 visible with overflow indicator
metrics:
  duration: "3m 27s"
  completed: "2026-03-30"
---

# Phase 93 Plan 01: Skills Directory Redesign Summary

Rewrote /skills page from flat grid to expandable category directory with 5 sections, redesigned skill cards, real-time search with yellow highlight, and localStorage persistence.

## What Was Done

### Task 1: i18n Keys
- Added `section.empty`, `search.noResults`, `search.noResultsHint`, `card.uses`, `card.moreTags` to both es.json and en.json
- Commit: `cdf3cde`

### Task 2: Full Page Rewrite
- **Directory layout**: 5 expandable `CategorySection` components (writing/analysis/strategy/technical/format), each with colored left border, icon, name, count badge
- **Empty sections**: opacity-50, no chevron arrow, "(vacio)" text
- **Default state**: first category with skills expanded, rest collapsed
- **localStorage**: key `skills-sections-state`, persists expand/collapse, restored on load
- **Search**: full-width input, client-side filtering by name/description/tags, auto-expands matching sections, collapses non-matching
- **Highlight**: `<mark>` with yellow bg on card name when searching
- **Empty search state**: Sparkles icon + "No se encontraron skills" + hint
- **Filter pills**: Todos + 5 category pills with icons and category colors, toggleable
- **Skill cards**: category icon + name, 2-line clamped description, category badge, tags (max 3 + "+N mas"), source badge, version, Zap icon + times_used
- **Actions**: Edit, Duplicate, Export JSON, Delete (hover reveal, same as before)
- **Preserved**: Sheet editor, Delete dialog, OpenClaw import, JSON file import, AI generation
- Commit: `4eae57c`

## Requirements Covered

| Requirement | Status |
|-------------|--------|
| DIR-01 | Complete - 5 expandable sections by category |
| DIR-02 | Complete - icon + name + count badge + color |
| DIR-03 | Complete - empty sections dimmed, no arrow, "(vacio)" |
| DIR-04 | Complete - first section with skills expanded |
| DIR-05 | Complete - localStorage key `skills-sections-state` |
| DIR-06 | Complete - bg-zinc-900/60, left border 3px, hover, animated arrow |
| SEARCH-01 | Complete - filters by name, description, tags |
| SEARCH-02 | Complete - auto-expand/collapse on search |
| SEARCH-03 | Complete - yellow highlight with `<mark>` |
| SEARCH-04 | Complete - empty state with illustration and text |
| CARD-01 | Complete - name with icon, description 2-line, category badge |
| CARD-02 | Complete - tags max 3, "+N mas" overflow |
| CARD-03 | Complete - source badge, version, times_used with Zap |
| CARD-04 | Complete - Edit, Duplicate, Export, Delete buttons |
| CARD-05 | Complete - category filter pills with Todos |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- TypeScript: `npx tsc --noEmit` passes with zero errors
- Build: `npm run build` compiles successfully, /skills page 12.7 kB
