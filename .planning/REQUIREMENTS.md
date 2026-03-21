# Requirements: DoCatFlow v15.0 — Tasks Unified

**Defined:** 2026-03-21
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.

## v15.0 Requirements

Requirements for Tasks Unified milestone. Each maps to roadmap phases.

### Data Model

- [ ] **DATA-01**: User can create tasks with execution_mode column (single/variable/scheduled) defaulting to 'single'
- [ ] **DATA-02**: User can create tasks with execution_count, run_count, last_run_at, next_run_at columns
- [ ] **DATA-03**: User can create task steps with expanded step_type values ('canvas', 'fork', 'join' in addition to existing)
- [ ] **DATA-04**: User can create task steps with canvas_id FK linking to a canvas when step_type is 'canvas'
- [ ] **DATA-05**: User can create task steps with fork_group, branch_index, and branch_label columns for fork/join grouping
- [ ] **DATA-06**: User can store task schedule configuration in task_schedules table (task_id, next_run_at, is_active, run_count)
- [ ] **DATA-07**: User can store export bundle metadata in task_bundles table (task_id, bundle_name, bundle_path, manifest)
- [ ] **DATA-08**: User can store schedule_config as JSON in tasks table (cron, time, days, custom_days, start/end dates, is_active)

### Canvas Step

- [ ] **CANV-01**: User can add a step of type 'canvas' to a task pipeline that references an existing canvas
- [ ] **CANV-02**: When the task executor encounters a canvas step, it injects the previous step's output as the START node input_text
- [ ] **CANV-03**: The canvas step creates a canvas_run with metadata { parent_task_id, parent_step_id } and calls executeCanvas()
- [ ] **CANV-04**: The canvas step polls canvas_run.status every 2 seconds until completed or failed
- [ ] **CANV-05**: When canvas_run completes, the OUTPUT node result becomes the task step output
- [ ] **CANV-06**: If canvas_run fails, the task step is marked failed with the canvas error message
- [ ] **CANV-07**: If canvas execution exceeds 30 minutes, the step is marked failed with timeout error

### Fork/Join

- [ ] **FORK-01**: User can add a fork step that splits the pipeline into 2 or 3 parallel branches (max 3)
- [ ] **FORK-02**: Each branch can contain up to 5 steps (agent, canvas, checkpoint, merge) with its own order_index
- [ ] **FORK-03**: All steps in the same fork share a fork_group identifier with distinct branch_index values
- [ ] **FORK-04**: The executor runs all branches in parallel using Promise.all, each branch receiving the pre-fork step output
- [ ] **FORK-05**: The join step concatenates all branch outputs with clear separators ("--- Rama A ---", "--- Rama B ---")
- [ ] **FORK-06**: User can optionally configure a CatPaw on the join step to synthesize branch outputs via LLM
- [ ] **FORK-07**: If a branch fails, other branches continue; join receives successful outputs plus error notes
- [ ] **FORK-08**: The task is not marked as failed if at least one branch completed successfully

### Execution Cycles

- [ ] **CYCL-01**: User can set a task to 'variable' mode with execution_count (2-100) to run N times in sequence
- [ ] **CYCL-02**: Each variable execution waits for the previous one to complete before starting the next
- [ ] **CYCL-03**: If a variable execution fails, subsequent executions are not launched
- [ ] **CYCL-04**: The run_count in the tasks table increments after each completed execution
- [ ] **CYCL-05**: User can set a task to 'scheduled' mode with schedule_config (time, days, date range)
- [ ] **CYCL-06**: Scheduled tasks calculate next_run_at from schedule_config and store it in task_schedules

### Scheduler

- [ ] **SCHD-01**: An internal scheduler runs as setInterval every 60 seconds within the Next.js server
- [ ] **SCHD-02**: Each tick queries task_schedules for active schedules where next_run_at <= now and launches the task
- [ ] **SCHD-03**: After each scheduled execution, the scheduler calculates and updates next_run_at
- [ ] **SCHD-04**: The calculateNextRun function respects day filters (always/weekdays/weekends/custom) and time config
- [ ] **SCHD-05**: If end_date is exceeded, the schedule is deactivated (is_active = 0)
- [ ] **SCHD-06**: User can activate/deactivate a schedule from the task detail page

### Wizard

- [ ] **WIZD-01**: User sees a vertical cascade wizard with 5 sections that reveal sequentially (Objetivo, CatBrains, Pipeline, Ciclo, Revisar)
- [ ] **WIZD-02**: Completed sections collapse showing a one-line summary; user can click to reopen and edit
- [ ] **WIZD-03**: Pipeline section shows a "+" button between steps with dropdown offering: Agente, Canvas, Checkpoint, Merge, Fork
- [ ] **WIZD-04**: Selecting "Canvas" opens a Sheet panel listing existing canvases with search and "Crear nuevo canvas" option
- [ ] **WIZD-05**: "Crear nuevo canvas" navigates to /canvas/new?from_task={taskId}&step_index={n} and returns after save
- [ ] **WIZD-06**: Canvas step in pipeline shows canvas name, node count, last execution, and "Ver/Editar Canvas" link
- [ ] **WIZD-07**: Selecting "Fork" shows inline configurator with branch count (2 or 3) and editable branch labels
- [ ] **WIZD-08**: Fork in pipeline displays as visual parallel columns with per-branch "+" buttons and a Join at the bottom
- [ ] **WIZD-09**: Section 4 "Ciclo de Ejecución" offers 3 radio options: Único, Variable (with spinner 2-100), Programado
- [ ] **WIZD-10**: Programado expands to show time picker, day selector (always/weekdays/weekends/custom), optional date range
- [ ] **WIZD-11**: "Próxima ejecución calculada" updates in real-time as user configures the schedule
- [ ] **WIZD-12**: Section 5 "Revisar y Lanzar" shows full config summary with "Guardar borrador" and "Lanzar ahora" buttons
- [ ] **WIZD-13**: "Guardar borrador" for scheduled tasks activates the schedule without immediate execution
- [ ] **WIZD-14**: "Lanzar ahora" for scheduled tasks activates the schedule AND executes once immediately

### Execution View

- [ ] **EXEC-01**: Canvas step during execution shows canvas name, progress bar (node X/Y), current executing node name
- [ ] **EXEC-02**: "Ver canvas en tiempo real" link opens a read-only modal/sheet with React Flow editor showing live node colors
- [ ] **EXEC-03**: Fork during execution shows branches as side-by-side columns with per-step status indicators
- [ ] **EXEC-04**: While branches execute, the UI shows "Esperando que finalicen todas las ramas..."
- [ ] **EXEC-05**: Cycle indicator shows "Ciclo 2/5" in the progress bar when running variable mode
- [ ] **EXEC-06**: Progress bar format: "Ciclo N/M · Paso X/Y · [bar] Z% · time · tokens"

### Export System

- [ ] **EXPRT-01**: POST /api/tasks/[id]/export analyzes task resources and generates a ZIP bundle in /app/data/exports/
- [ ] **EXPRT-02**: Bundle ZIP contains manifest.json, config/ (task.json, canvases/, agents/, skills/), docker/, runner/, install/
- [ ] **EXPRT-03**: manifest.json includes bundle_version, docatflow_version, task info, docker services, resources, credentials_needed
- [ ] **EXPRT-04**: The generator calculates minimal Docker services needed (Qdrant only if RAG, Ollama only if local models, etc.)
- [ ] **EXPRT-05**: Bundle includes install.sh (Linux/Mac) that verifies Docker, runs setup wizard, pulls images, starts stack
- [ ] **EXPRT-06**: Bundle includes install.ps1 (Windows PowerShell) with equivalent installation flow
- [ ] **EXPRT-07**: Bundle includes setup-wizard.js (Node.js) that reads manifest.json and prompts for each credential_needed
- [ ] **EXPRT-08**: runner/index.html is a standalone vanilla HTML+CSS+JS page that connects to localhost:3500 to execute the task
- [ ] **EXPRT-09**: Runner polls /api/tasks/{id}/status every 2s, shows current step and progress, offers result download
- [ ] **EXPRT-10**: GET /api/tasks/[id]/export/[bundleId]/download serves the ZIP with Content-Disposition attachment header
- [ ] **EXPRT-11**: GET /api/tasks/[id]/exports lists previous bundles with date and size
- [ ] **EXPRT-12**: DELETE /api/tasks/[id]/export/[bundleId] removes ZIP from disk and task_bundles record
- [ ] **EXPRT-13**: POST /api/tasks/import accepts a bundle ZIP, validates manifest, imports skills/agents/canvases/task idempotently by slug
- [ ] **EXPRT-14**: Bundle export UI in task detail page shows collapsible section with resource summary, service list, and generate button
- [ ] **EXPRT-15**: Export UI lists previous bundles with download and delete actions
- [ ] **EXPRT-16**: docker-compose.yml in bundle uses image: with fixed version tag, never build:

### Navigation

- [ ] **NAV-01**: Canvas is removed from the sidebar; Tareas remains in its position
- [ ] **NAV-02**: GET /canvas redirects 301 to /tasks with an informative toast "Los canvas ahora están dentro de Tareas"
- [ ] **NAV-03**: GET /canvas/[id] continues working for editing a canvas directly (accessible from task canvas step)
- [ ] **NAV-04**: All new UI text uses i18n t() from tasks namespace (extended) and new taskExport namespace
- [ ] **NAV-05**: All new i18n keys exist in both es.json and en.json
- [ ] **NAV-06**: npm run build passes without TypeScript errors after all changes

## Future Requirements

### Marketplace
- **MKTPL-01**: Users can publish task bundles to a shared marketplace
- **MKTPL-02**: Users can browse and install community task bundles

### Advanced Scheduling
- **ASCHD-01**: Cron expression editor for advanced users
- **ASCHD-02**: Conditional scheduling (run only if previous run succeeded)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Canvas parallel node execution | Sequential topological order maintained from v5.0 |
| Modifying canvas-executor.ts | Called from task-executor.ts but not changed |
| Real-time WebSocket for execution | Polling every 2s is sufficient |
| Docker image publishing pipeline | Bundle references image, CI/CD for publishing is separate |
| Paid cron services | Internal setInterval scheduler sufficient for single-server |
| External task marketplace | Future milestone, but bundle format designed for it |
| Canvas loop detection at runtime | DAG only, deferred |
| Deleting existing canvas data | Canvases preserved, accessible from tasks |

## Traceability

Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (populated by roadmapper) | | |

**Coverage:**
- v15.0 requirements: 70 total
- Mapped to phases: 0
- Unmapped: 70

---
*Requirements defined: 2026-03-21*
*Last updated: 2026-03-21 after initial definition*
