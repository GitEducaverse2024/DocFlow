# Roadmap: DoCatFlow

## Milestones

- v12.0 WebSearch CatBrain -- Phases 48-49 (shipped 2026-03-16) -- [archive](.planning/milestones/v12.0-ROADMAP.md)
- v13.0 Conector Gmail -- Phases 50-51 (shipped 2026-03-16)
- v14.0 CatBrain UX Redesign -- Phases 52-56 (shipped 2026-03-21) -- [archive](.planning/milestones/v14.0-ROADMAP.md)
- **v15.0 Tasks Unified** -- Phases 57-62 (active)

## Phases

- [ ] **Phase 57: Data Model Foundations** - New columns and tables for execution modes, canvas steps, fork/join groups, schedules, and export bundles
- [x] **Phase 58: Canvas Step + Fork/Join Execution** - Extend task-executor.ts with canvas subagent steps and parallel fork/join branch execution
- [x] **Phase 59: Cascade Wizard** - Vertical 5-section wizard replacing the horizontal 4-step stepper, with canvas selector, fork configurator, and cycle section
- [ ] **Phase 60: Execution Cycles + Scheduler** - Variable N-times execution, scheduled mode with internal setInterval scheduler
- [ ] **Phase 61: Export System** - ZIP bundle generator with manifest, install scripts, runner HTML, and import endpoint
- [ ] **Phase 62: Execution View + Navigation + Polish** - Canvas/fork/cycle execution UI, sidebar cleanup, redirects, i18n, build validation

## Phase Details

### Phase 57: Data Model Foundations
**Goal**: All database schema changes are in place so subsequent phases can store and query new task configurations
**Depends on**: Nothing (foundation phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07, DATA-08
**Success Criteria** (what must be TRUE):
  1. Creating a task with execution_mode 'single', 'variable', or 'scheduled' persists correctly and defaults to 'single'
  2. Creating a task step with step_type 'canvas', 'fork', or 'join' persists correctly, including canvas_id FK and fork_group/branch_index/branch_label columns
  3. task_schedules table stores schedule state (task_id, next_run_at, is_active, run_count) and task_bundles table stores export metadata (bundle_name, bundle_path, manifest JSON)
  4. schedule_config JSON column on tasks table round-trips correctly (cron, time, days, custom_days, start/end dates, is_active)
**Plans**: 57-01 (schema + types)

### Phase 58: Canvas Step + Fork/Join Execution
**Goal**: The task executor can run canvas subagent steps and parallel fork/join branches as part of a task pipeline
**Depends on**: Phase 57 (needs new step_types, canvas_id FK, fork columns in schema)
**Requirements**: CANV-01, CANV-02, CANV-03, CANV-04, CANV-05, CANV-06, CANV-07, FORK-01, FORK-02, FORK-03, FORK-04, FORK-05, FORK-06, FORK-07, FORK-08
**Success Criteria** (what must be TRUE):
  1. A task with a canvas step executes the referenced canvas (creating a canvas_run with parent metadata), polls until completion, and passes the OUTPUT node result to the next step
  2. If canvas execution fails or exceeds 30 minutes, the canvas step is marked failed with the appropriate error message
  3. A task with a fork step splits into 2-3 parallel branches executed via Promise.all, each branch receiving the pre-fork output as input
  4. The join step concatenates branch outputs with "--- Rama X ---" separators, and optionally runs a CatPaw LLM synthesis on the combined output
  5. If one or more branches fail, the remaining branches still complete; the task only fails if ALL branches fail
**Plans**: 58-01 (canvas step execution), 58-02 (fork/join execution)

### Phase 59: Cascade Wizard
**Goal**: Users create and configure tasks through a vertical cascade wizard with canvas selection, fork configuration, and execution cycle options
**Depends on**: Phase 57 (schema for new fields), Phase 58 (canvas/fork step types must be executable)
**Requirements**: WIZD-01, WIZD-02, WIZD-03, WIZD-04, WIZD-05, WIZD-06, WIZD-07, WIZD-08, WIZD-09, WIZD-10, WIZD-11, WIZD-12, WIZD-13, WIZD-14
**Success Criteria** (what must be TRUE):
  1. User sees 5 sections (Objetivo, CatBrains, Pipeline, Ciclo, Revisar) that reveal sequentially; completed sections collapse to a one-line summary and can be reopened
  2. In the Pipeline section, the "+" button offers Agente, Canvas, Checkpoint, Merge, and Fork options; selecting Canvas opens a Sheet with search and "Crear nuevo canvas" navigation
  3. Selecting Fork shows an inline configurator with branch count (2/3) and editable labels; the pipeline displays fork branches as visual parallel columns with per-branch "+" buttons and a Join at the bottom
  4. Section 4 (Ciclo de Ejecucion) offers Unico, Variable (spinner 2-100), and Programado (time picker, day selector, date range) with real-time "Proxima ejecucion calculada" preview
  5. Section 5 (Revisar y Lanzar) shows full config summary with "Guardar borrador" (activates schedule without execution) and "Lanzar ahora" (activates schedule AND executes immediately)
**Plans**: 4 plans
Plans:
- [x] 59-01-PLAN.md -- API extensions (v15 fields) + cascade shell with sections 1-2
- [x] 59-02-PLAN.md -- Pipeline section with canvas picker, fork configurator, visual branches
- [x] 59-03-PLAN.md -- Ciclo section (execution modes + schedule) + Revisar section (summary + launch)
- [x] 59-04-PLAN.md -- Schedule utility with tests, edit mode, i18n audit, collapse summaries

### Phase 60: Execution Cycles + Scheduler
**Goal**: Tasks can run multiple times (variable mode) or on a recurring schedule (scheduled mode) with automatic next-run calculation
**Depends on**: Phase 57 (task_schedules table, schedule_config column), Phase 58 (executor must handle full pipeline)
**Requirements**: CYCL-01, CYCL-02, CYCL-03, CYCL-04, CYCL-05, CYCL-06, SCHD-01, SCHD-02, SCHD-03, SCHD-04, SCHD-05, SCHD-06
**Success Criteria** (what must be TRUE):
  1. A task in variable mode with execution_count=5 runs 5 sequential executions, each waiting for the previous to complete, with run_count incrementing after each
  2. If a variable execution fails, subsequent executions do not launch
  3. A task in scheduled mode with configured time/days has its next_run_at calculated correctly, respecting day filters (always/weekdays/weekends/custom) and date range boundaries
  4. The internal scheduler (setInterval 60s) picks up active schedules where next_run_at <= now, launches the task, and calculates the next run; schedules deactivate when end_date is exceeded
  5. User can activate or deactivate a schedule from the task detail page
**Plans**: TBD

### Phase 61: Export System
**Goal**: Users can export a task as a portable ZIP bundle that can be installed and run on any machine with Docker
**Depends on**: Phase 57 (task_bundles table), Phase 58 (canvas/fork tasks must be exportable)
**Requirements**: EXPRT-01, EXPRT-02, EXPRT-03, EXPRT-04, EXPRT-05, EXPRT-06, EXPRT-07, EXPRT-08, EXPRT-09, EXPRT-10, EXPRT-11, EXPRT-12, EXPRT-13, EXPRT-14, EXPRT-15, EXPRT-16
**Success Criteria** (what must be TRUE):
  1. POST /api/tasks/[id]/export generates a ZIP in /app/data/exports/ containing manifest.json, config/ (task.json, canvases/, agents/, skills/), docker/, runner/, install/ with correct structure
  2. manifest.json lists bundle_version, docatflow_version, task info, minimal Docker services (only Qdrant if RAG, only Ollama if local models), resource inventory, and credentials_needed
  3. install.sh (Linux/Mac) and install.ps1 (Windows) verify Docker, run setup-wizard.js (prompts for each credential), pull images, and start the stack; docker-compose.yml uses image: with fixed version tags
  4. runner/index.html is a standalone page that connects to localhost:3500, executes the task, polls status every 2s, shows step progress, and offers result download
  5. GET /api/tasks/[id]/exports lists bundles; GET .../download serves ZIP; DELETE removes ZIP and record; POST /api/tasks/import validates manifest and imports resources idempotently by slug
  6. Task detail page shows a collapsible export section with resource summary, service list, generate button, and list of previous bundles with download/delete actions
**Plans**: TBD

### Phase 62: Execution View + Navigation + Polish
**Goal**: The execution view shows canvas/fork/cycle progress, canvas is removed from the sidebar, and all new text is internationalized
**Depends on**: Phase 58 (canvas/fork execution to visualize), Phase 59 (wizard creates tasks to view), Phase 60 (cycles to display)
**Requirements**: EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05, EXEC-06, NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, NAV-06
**Success Criteria** (what must be TRUE):
  1. During canvas step execution, the UI shows canvas name, progress bar (node X/Y), current node name, and a "Ver canvas en tiempo real" link that opens a read-only React Flow modal with live node colors
  2. Fork execution displays branches as side-by-side columns with per-step status indicators and a "Esperando que finalicen todas las ramas..." message while branches run
  3. Variable mode execution shows "Ciclo N/M" in the progress bar with format "Ciclo N/M . Paso X/Y . [bar] Z% . time . tokens"
  4. Canvas is removed from the sidebar; GET /canvas redirects 301 to /tasks with toast "Los canvas ahora estan dentro de Tareas"; GET /canvas/[id] still works for direct editing
  5. All new UI text uses i18n t() with keys in both es.json and en.json; npm run build passes without TypeScript errors

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 57. Data Model Foundations | 1/1 | Complete | 2026-03-21 |
| 58. Canvas Step + Fork/Join Execution | 2/2 | Complete | 2026-03-21 |
| 59. Cascade Wizard | 2/4 | Complete    | 2026-03-21 |
| 60. Execution Cycles + Scheduler | 0/? | Not started | - |
| 61. Export System | 0/? | Not started | - |
| 62. Execution View + Navigation + Polish | 0/? | Not started | - |

---
*Created: 2026-03-21*
*Last updated: 2026-03-21*
