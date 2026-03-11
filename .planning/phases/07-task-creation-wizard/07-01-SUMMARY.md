---
phase: 07-task-creation-wizard
plan: 01
subsystem: task-creation-wizard
tags: [wizard, dnd-kit, pipeline-builder, ui]
dependency_graph:
  requires: [api-tasks, api-steps, api-templates, api-agents, api-skills, api-projects]
  provides: [task-creation-wizard]
  affects: [tasks-page]
tech_stack:
  added: []
  patterns: [dnd-kit-sortable, wizard-stepper, suspense-boundary]
key_files:
  created:
    - app/src/app/tasks/new/page.tsx
  modified: []
decisions:
  - Single-file wizard (all 4 steps + pipeline builder in one page.tsx)
  - Suspense boundary wrapping useSearchParams for Next.js 14 compatibility
  - Lazy RAG info fetching when step 2 renders (not on mount)
  - Local crypto.randomUUID() for pipeline step IDs (no server roundtrip)
  - PointerSensor with 8px activation distance for drag-and-drop
metrics:
  duration: 201s
  completed: "2026-03-11T15:08:33Z"
---

# Phase 7 Plan 01: Task Creation Wizard Summary

4-step wizard at /tasks/new with dnd-kit pipeline builder, project RAG linking, template pre-fill, and save/launch actions

## What Was Built

### Task 1: Create /tasks/new wizard page
**Commit:** e839804

Created the complete 4-step wizard page with:

- **Step 1 (Objetivo):** Name (required), description, expected output fields with validation
- **Step 2 (Proyectos):** Project list with checkboxes showing RAG status (vector count, "No indexado", "Deshabilitado"). Lazy-fetches RAG info when step renders
- **Step 3 (Pipeline):** Drag-and-drop pipeline builder using @dnd-kit/core + @dnd-kit/sortable. Supports agent/checkpoint/merge step types. Agent steps have: agent selector, model override, instructions, context mode radio (previous/all/manual), RAG toggle, skills multi-select. Add step buttons between each step and at end. Max 10 steps enforced
- **Step 4 (Revisar):** Summary card showing all task details + visual pipeline list. "Guardar borrador" (saves as ready) and "Lanzar tarea" (saves + executes) buttons
- **Template pre-fill:** Via ?template=ID query param, loads template steps_config into pipeline
- **Stepper UI:** Horizontal step indicator with completed (emerald), active (violet), future (zinc) states

### Task 2: Verify build
**Commit:** 45897d7

Fixed type compatibility issue with shadcn Select component's `onValueChange` callback which passes `string | null`. Build passes cleanly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Select onValueChange type mismatch**
- **Found during:** Task 2 (build verification)
- **Issue:** shadcn Select `onValueChange` passes `string | null` but PipelineStep.agent_id is `string`
- **Fix:** Added explicit `string | null` type annotation and null guard before assignment
- **Files modified:** app/src/app/tasks/new/page.tsx
- **Commit:** 45897d7

## Decisions Made

1. **Single-file wizard:** All wizard logic in one `page.tsx` file (no separate component files) for simplicity and cohesion
2. **Suspense boundary:** Wrapped `useSearchParams()` consumer in `<Suspense>` as required by Next.js 14 App Router
3. **Lazy RAG fetch:** RAG info for projects fetched only when user navigates to step 2, not on initial mount
4. **Local step IDs:** Pipeline steps use `crypto.randomUUID()` for drag-and-drop keys; server generates real IDs on save
5. **PointerSensor with distance constraint:** 8px activation distance prevents accidental drags when clicking

## Verification Results

All 10 verification checks passed:
- DndContext present in page
- All 4 wizard steps (Objetivo, Proyectos, Pipeline, Revisar) present
- Guardar borrador and Lanzar tarea buttons present
- Template pre-fill logic present
- useSortable and SortableContext integrated
- npm run build passes

## Self-Check: PASSED
