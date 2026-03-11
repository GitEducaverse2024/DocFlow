# Roadmap: DocFlow v2.0

**Milestone:** Sistema de Tareas Multi-Agente
**Phases:** 6 (phases 3-8, continuing from v1.0)
**Requirements:** 48 active

---

## Phase 3: Data Model + Templates Seed -- COMPLETE

**Goal:** Create the SQLite tables (tasks, task_steps, task_templates) and TypeScript types. Seed 3 templates.

**Requirements:** DATA-01, DATA-02, DATA-03, DATA-04, TMPL-01, TMPL-02, TMPL-03

**What changes:**
- Add `tasks`, `task_steps`, `task_templates` tables to `db.ts` using existing CREATE TABLE IF NOT EXISTS + ALTER TABLE try-catch pattern
- Add TypeScript interfaces (Task, TaskStep, TaskTemplate) to `types.ts`
- Seed 3 templates (Documentacion tecnica, Propuesta comercial, Investigacion y resumen)

**Success criteria:**
1. Tables created on app startup without errors
2. TypeScript types compile correctly
3. Seed templates exist in DB after first run
4. `npm run build` passes

**Estimated complexity:** Low — schema + types + seed data, no UI

---

## Phase 4: API CRUD (Tasks, Steps, Templates) -- COMPLETE

**Goal:** Full REST API for tasks, steps, and templates. No execution logic yet.

**Requirements:** API-01, API-02, API-03, API-04, API-05, API-06, API-07, API-08, API-09, API-10, API-11, API-12

**What changes:**
- `app/src/app/api/tasks/route.ts` — GET (list with filters), POST (create)
- `app/src/app/api/tasks/[id]/route.ts` — GET (detail), PATCH (update), DELETE
- `app/src/app/api/tasks/[id]/steps/route.ts` — GET (list), POST (create)
- `app/src/app/api/tasks/[id]/steps/[stepId]/route.ts` — PATCH, DELETE
- `app/src/app/api/tasks/[id]/steps/reorder/route.ts` — POST
- `app/src/app/api/tasks/templates/route.ts` — GET
- `app/src/app/api/tasks/from-template/route.ts` — POST

**Success criteria:**
1. All 12 endpoints respond correctly
2. Task creation returns draft status
3. Step CRUD with auto-reorder on delete
4. Max 10 steps validation works
5. Template creates task with pre-configured steps
6. `npm run build` passes

**Estimated complexity:** Medium — 7 route files, multiple operations each

---

## Phase 5: Pipeline Execution Engine

**Goal:** Backend execution logic: sequential step execution, context building, RAG integration, checkpoint pausing, merge synthesis, cancel/retry.

**Requirements:** EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05, EXEC-06, EXEC-07, EXEC-08, EXEC-09, PROMPT-01, PROMPT-02

**What changes:**
- `app/src/lib/services/task-executor.ts` — New service: executes steps sequentially, builds context, calls LLM, handles checkpoints/merge
- `app/src/app/api/tasks/[id]/execute/route.ts` — POST to start execution
- `app/src/app/api/tasks/[id]/status/route.ts` — GET polling endpoint
- `app/src/app/api/tasks/[id]/cancel/route.ts` — POST to cancel
- `app/src/app/api/tasks/[id]/retry/route.ts` — POST to retry from failed step
- `app/src/app/api/tasks/[id]/steps/[stepId]/approve/route.ts` — POST
- `app/src/app/api/tasks/[id]/steps/[stepId]/reject/route.ts` — POST

**Success criteria:**
1. Agent step: calls LLM with correct prompt structure, saves output/tokens/duration
2. Context modes: previous (only last output), all (concatenated), manual (user text)
3. RAG integration: searches linked project collections, adds chunks to context
4. Checkpoint: pauses execution, approve continues, reject re-runs previous with feedback
5. Merge: synthesizes all prior outputs into unified document
6. Completion: saves result_output, calculates totals
7. Cancel/retry work correctly
8. Status endpoint returns current progress
9. `npm run build` passes

**Estimated complexity:** High — core business logic, LLM integration, state machine

---

## Phase 6: Tasks List Page + Sidebar -- COMPLETE

**Goal:** The /tasks page with task cards, status filters, templates section, and sidebar navigation entry.

**Requirements:** UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07

**What changes:**
- `app/src/components/layout/sidebar.tsx` — Add "Tareas" entry with ClipboardList icon
- `app/src/app/tasks/page.tsx` — Task list page with cards, filters, templates
- Components: task-card, task-filters, template-card

**Success criteria:**
1. "Tareas" appears in sidebar between Skills and Configuracion
2. Task list shows cards with correct status badges and colors
3. Filters work: Todas, En curso, Completadas, Borradores with counts
4. Templates section shows 3 seed templates
5. Empty state renders correctly
6. `npm run build` passes

**Estimated complexity:** Medium — page + components, data fetching

---

## Phase 7: Task Creation Wizard -- COMPLETE

**Goal:** 4-step wizard at /tasks/new to create and configure tasks with drag-and-drop pipeline builder.

**Requirements:** WIZ-01, WIZ-02, WIZ-03, WIZ-04, WIZ-05, WIZ-06

**What changes:**
- `app/src/app/tasks/new/page.tsx` — Wizard page with stepper
- Components: wizard-stepper, step-objective, step-projects, step-pipeline, step-review
- Pipeline builder with @dnd-kit for step reordering
- Agent/model/skills selectors reusing existing patterns

**Success criteria:**
1. 4-step stepper navigates correctly
2. Objective fields validate (name required)
3. Projects list shows RAG status per project
4. Pipeline builder: add agent/checkpoint/merge steps, drag to reorder, delete steps
5. Agent step editor: agent selector, model override, instructions, context mode, RAG toggle, skills
6. Review shows full summary
7. "Guardar borrador" saves as ready, "Lanzar" saves and calls /execute
8. Template pre-fill works via ?template=ID
9. `npm run build` passes

**Estimated complexity:** High — complex UI with drag-and-drop, multiple selectors

---

## Phase 8: Execution View + Real-time Monitoring

**Goal:** The /tasks/{id} page showing pipeline execution in real-time with step outputs, checkpoint interaction, and completion view.

**Requirements:** VIEW-01, VIEW-02, VIEW-03, VIEW-04, VIEW-05, VIEW-06, VIEW-07

**What changes:**
- `app/src/app/tasks/[id]/page.tsx` — Task detail/execution page
- Components: pipeline-view, step-card, checkpoint-dialog, result-view
- Polling integration (2s) for real-time updates
- Markdown rendering for outputs

**Success criteria:**
1. Pipeline renders vertically with step cards and connecting lines
2. Active step has violet pulse, completed steps have emerald check
3. Step output preview: 200px max, fade gradient, "Ver completo" dialog
4. Checkpoint: shows previous output, approve/reject buttons, feedback textarea
5. Progress bar: X/N steps, percentage, time, tokens
6. Completion: full markdown result, download .md, copy, re-execute buttons
7. Completed pipeline: collapsed steps expandable to see individual outputs
8. `npm run build` passes

**Estimated complexity:** High — real-time UI, markdown rendering, multiple interaction patterns

---

## Summary

| # | Phase | Goal | Requirements | Criteria |
|---|-------|------|--------------|----------|
| 3 | Data Model + Templates | SQLite tables + types + seed | DATA-01..04, TMPL-01..03 | 4 |
| 4 | API CRUD | Full REST API | API-01..12 | 6 |
| 5 | Execution Engine | Pipeline runner + status | EXEC-01..09, PROMPT-01..02 | 9 |
| 6 | Tasks List Page | /tasks page + sidebar | UI-01..07 | 6 |
| 7 | Creation Wizard | 4-step wizard + dnd | WIZ-01..06 | 9 |
| 8 | Execution View | Real-time monitoring | VIEW-01..07 | 8 |

**Total:** 6 phases | 48 requirements mapped | 0 unmapped

**Dependency chain:**
```
Phase 3 (Data) → Phase 4 (API) → Phase 5 (Execution)
                                         ↓
Phase 3 (Data) → Phase 6 (List UI) → Phase 7 (Wizard) → Phase 8 (Exec View)
```

Phases 4 and 6 can potentially run in parallel (API and UI list), but 5 depends on 4, and 7-8 depend on 5.

---
*Roadmap created: 2026-03-11*
