---
phase: 49-catbrain-websearch
plan: 03
subsystem: websearch-ui
tags: [websearch, catbrain, ui, engine-selector, canvas, system-badge]
dependency_graph:
  requires: [49-01]
  provides: [websearch-engine-tab, websearch-test-panel, system-catbrain-ui]
  affects: [catbrains-list, catbrains-detail, canvas-nodes]
tech_stack:
  added: [websearch-engine-tab, websearch-test-panel]
  patterns: [conditional-pipeline-steps, system-catbrain-protection-ui]
key_files:
  created:
    - app/src/components/projects/websearch-engine-tab.tsx
    - app/src/components/projects/websearch-test-panel.tsx
  modified:
    - app/src/app/catbrains/page.tsx
    - app/src/app/catbrains/[id]/page.tsx
    - app/src/components/canvas/nodes/catbrain-node.tsx
    - app/src/lib/types.ts
    - app/src/lib/services/task-executor.ts
decisions:
  - "Engine selector uses PATCH /api/catbrains/{id} with immediate save on click"
  - "Health endpoint used for SearXNG/LiteLLM status dots in engine selector"
  - "WebSearch tab conditionally added to pipeline nav only for system CatBrains with search_engine"
metrics:
  duration: 349s
  completed: "2026-03-16T18:53:27Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 49 Plan 03: WebSearch CatBrain UI Summary

Engine selector tab with 4 engines (Auto/SearXNG/Gemini/Ollama), live status dots, search test panel, Sistema badge in list, and canvas node engine badge.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Sistema badge + lock icon in CatBrains list | 184ce0c | page.tsx, types.ts |
| 2 | Engine selector tab + test panel + canvas badge | 3d7611c | websearch-engine-tab.tsx, websearch-test-panel.tsx, [id]/page.tsx, catbrain-node.tsx |

## What Was Built

### Sistema Badge + Lock Icon (Task 1)
- Added `is_system` and `search_engine` optional fields to Project type
- CatBrains list shows violet "Sistema" badge next to system CatBrain names
- System CatBrain cards have distinct `border-violet-500/20` border
- Lock icon shown next to status badge for system CatBrains

### Engine Selector Tab (Task 2)
- `WebSearchEngineTab` component with 4 engine cards in 2-column grid
- Each card: icon, name, description, Local/Cloud badge, status dot (online/offline)
- Status fetched from `/api/health` (SearXNG, LiteLLM)
- Click selects engine and PATCHes `/api/catbrains/{id}` immediately
- Save feedback: Loader2 spinner then Check icon

### Search Test Panel (Task 2)
- `WebSearchTestPanel` with query input and "Buscar" button
- POSTs to `/api/websearch/search` with selected engine
- Displays results as cards with linked titles (ExternalLink icon) and snippets
- Shows which engine was used, error state, empty state

### Detail Page Updates (Task 2)
- "Motor de Busqueda" tab added to pipeline nav for WebSearch CatBrains
- Delete button replaced with disabled "Sistema" lock button for system CatBrains
- Auto-advance order updated to include websearch step

### Canvas Node Badge (Task 2)
- `search_engine` field added to catbrain-node nodeData type
- Violet badge with Search icon shows engine name (Auto/SearXNG/Gemini/Ollama) in badges row

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed task-executor event_type type error**
- **Found during:** Task 2 build verification
- **Issue:** `task-executor.ts` used `'task_execution'` which is not a valid UsageLog event_type (pre-existing from 49-01)
- **Fix:** Changed to `'task_step'` to match the union type
- **Files modified:** app/src/lib/services/task-executor.ts
- **Commit:** 3d7611c

## Verification

- `npx next build` passes with zero errors
- grep confirms: "Sistema" badge in catbrains list page
- grep confirms: WebSearchEngineTab imported in detail page
- grep confirms: is_system check hides delete
- grep confirms: search_engine badge in catbrain-node.tsx

## Self-Check: PASSED
