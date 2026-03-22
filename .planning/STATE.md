---
gsd_state_version: 1.0
milestone: v16.0
milestone_name: CatFlow
current_plan: —
status: defining-requirements
last_updated: "2026-03-22T00:00:00Z"
last_activity: 2026-03-22 -- Milestone v16.0 started
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Current Position

Phase: Phase 63 (Rename UI + BD base + API inter-CatFlow) — NOT STARTED
Plan: —
Status: Ready to plan phase 63
Last activity: 2026-03-22 — Milestone v16.0 CatFlow roadmap created (8 phases, 76 reqs)

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-22)

**Core value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.
**Current focus:** v16.0 CatFlow -- Rename Tareas→CatFlow, 3 new canvas nodes (scheduler/storage/multiagent), right sidebar panel, copy/paste, inter-CatFlow communication

## Milestone History

### v1.0 — Fix RAG Chat + Mejoras de indexacion (COMPLETE)
- 2 phases, 14 requirements, all complete

### v2.0 — Sistema de Tareas Multi-Agente (COMPLETE)
- 6 phases, 48 requirements, all complete
- Data model, API CRUD, execution engine, task list, wizard, execution view

### v3.0 — Conectores + Dashboard de Operaciones (COMPLETE)
- 6 phases (9-14), 48 requirements, all complete

### v4.0 — Rebranding + CatBot + MCP Bridge + UX Polish (COMPLETE)
- 8 phases (15-22), 52 requirements, all complete

### v5.0 — Canvas Visual de Workflows (COMPLETE)
- 4 phases (23-26), 52 requirements, all complete

### v6.0 — Testing Inteligente + Performance + Estabilizacion (PARTIAL)
- 5 phases allocated (27-31), phase 27 complete (resilience foundations)
- Phases 28-31 superseded by v7.0 detailed spec

### v7.0 — Streaming + Testing + Logging + Notificaciones (COMPLETE)
- 6 phases (32-37), 53 requirements, all complete

### v8.0 — CatBot Diagnosticador + Base de Conocimiento (COMPLETE)
- 1 phase (38), 15 requirements, all complete

### v9.0 — CatBrains (COMPLETE)
- 3 phases (39-41), 23 requirements, all complete

### v10.0 — CatPaw: Unificacion de Agentes (COMPLETE)
- 6 phases (42-47), 50 requirements, all complete

### v11.0 — LinkedIn MCP Connector (COMPLETE)
- 1 phase (47), 7 requirements, all complete

### v12.0 — WebSearch CatBrain (COMPLETE)
- 2 phases (48-49), 28 requirements, all complete

### v13.0 — Conector Gmail (COMPLETE)
- 2 phases (50-51), ~35 requirements, all complete

### v14.0 — CatBrain UX Redesign (COMPLETE)
- 5 phases (52-56), 37 requirements, all complete
- CORS fix, entry modal, sources pipeline, reset, RAG info bar

### v15.0 — Tasks Unified (COMPLETE)
- 6 phases (57-62), ~77 requirements, all complete
- Canvas as subagent step, Fork/Join parallel branches, Cascade Wizard
- Variable/scheduled execution cycles, internal scheduler (setInterval 60s)
- Export system: ZIP bundle with manifest, Docker, runner HTML, install scripts
- Sidebar: Canvas removed, accessed from Tasks; /canvas → /tasks redirect

## Decisions

- Phase 57: Used idempotent ALTER TABLE try-catch pattern (no migration framework) -- consistent with all prior schema changes
- Phase 59-01: Used eslint-disable for retained SortableStepCard/DnD/saveTask code awaiting plans 02-03
- Phase 59-01: CascadeSection pattern: index/title/isCompleted/isActive/isLocked/summary/onToggle/children
- Phase 59-01: Section t() prop typed as Record<string, string | number | boolean> for next-intl compatibility
- Phase 59-02: PipelineSection as standalone component (not inline in page.tsx) for maintainability
- Phase 59-02: Fork branch count stored in existing branch_index field on fork step to avoid new state
- Phase 59-02: Old SortableStepCard/AddStepButton removed from page.tsx since pipeline-section.tsx provides own implementation
- Phase 59-03: Custom radio card UI for CicloSection instead of shadcn RadioGroup for card-style layout with sub-forms
- Phase 59-03: ScheduleConfig.days changed to string union type for type safety
- Phase 59-03: saveTask ensures schedule_config.is_active=true for scheduled mode before API call
- Phase 59-04: Extracted schedule calculation into schedule-utils.ts with TDD (13 unit tests)
- Phase 59-04: Edit mode save: PATCH task fields + DELETE all steps + POST new steps (definitive approach)
- Phase 59-04: Fork reconstruction from flat step list: group by fork_group -> separate fork/join/branch -> ForkBranch[]
- Phase 59-04: ScheduleConfig consolidated to single export from schedule-utils.ts (removed from 4 components)
- Phase 59-04: Pipeline collapse summary shows unique step type labels (Agente, Canvas, Fork)
- Phase 60-01: Checkpoint steps rejected at execution time (not creation time) to avoid wizard complexity
- Phase 60-01: run_count on tasks table is single source of truth for all execution modes
- Phase 60-01: Variable cycle loop starts from current run_count, enabling resume from last successful cycle
- Phase 60-02: updateNextRun made non-private for testability
- Phase 60-02: PATCH handler recalculates next_run_at when only schedule_config changes (no execution_mode sent)
- Phase 60-02: No experimental flag needed for instrumentation.ts in Next.js 14.2
- Phase 60-03: Schedule toggle uses PATCH endpoint updating both task_schedules and tasks tables
- Phase 61-01: Used cat_paw_skills junction (not worker_skills) for skill collection -- matches current schema
- Phase 61-01: Agent JSON in bundle includes catbrain and connector associations for complete portability
- Phase 61-01: Logger source 'tasks' used for export route (no 'export' LogSource defined)
- Phase 61-02: Used eslint-disable-next-line for no-explicit-any on DB query results -- consistent with existing API patterns
- Phase 61-04: Skills imported without cat_paw_skills re-linking -- bundle stores skill_ids at step level, not via junction table
- Phase 61-04: Task always created as new (never skipped) with status=draft and run_count=0
- Phase 61-05: ExportSection as inline component in page.tsx (consistent with existing pattern)
- Phase 62-01: Canvas progress queried via metadata LIKE match on parent_step_id (no new index)
- Phase 62-01: canvasProgressMap as separate state to avoid merging into TaskStepDetail types
- Phase 62-01: Enhanced cycle progress (step/time/tokens) only when running; static bar otherwise
- Phase 62-02: LiveNode with Handle as generic node type (not importing full editor node types)
- Phase 62-02: Module-level NODE_TYPES constant to prevent React Flow remount storms
- Phase 62-02: ReactFlowProvider scoped inside Dialog to avoid context conflicts
- Phase 62-03: Array.from() for Map iteration instead of spread to avoid downlevelIteration TS requirement
- Phase 62-03: ForkGroup uses TaskStepDetail (not StatusStep union) since render context always has full step data
- Phase 62-03: renderStepCard/renderForkGroup as closures inside render to access component state
- Phase 62-04: permanentRedirect (301) for canvas->tasks instead of redirect (307) -- permanent navigation change
- Phase 62-04: Toast trigger via ?from=canvas URL param, cleaned after display via replaceState

## Accumulated Context

### v15.0 — Key patterns for Tasks Unified
- task-executor.ts: motor de ejecucion actual (agent, checkpoint, merge steps)
- canvas-executor.ts: motor DAG con topological sort (NO modificar)
- Wizard actual: stepper horizontal 4 pasos con @dnd-kit
- Canvas sidebar item: se elimina, se accede desde Tareas
- Nuevos step_types: 'canvas', 'fork', 'join'
- Scheduler interno: setInterval 60s en el servidor Next.js
- Export: bundle ZIP con manifest.json, runner HTML, install scripts

### Phase structure (v15.0)
- Phase 57: Data Model Foundations (8 reqs) -- schema changes
- Phase 58: Canvas Step + Fork/Join Execution (15 reqs) -- executor extensions
- Phase 59: Cascade Wizard (14 reqs) -- new wizard UI
- Phase 60: Execution Cycles + Scheduler (12 reqs) -- variable/scheduled modes
- Phase 61: Export System (16 reqs) -- ZIP bundle generator
- Phase 62: Execution View + Navigation + Polish (12 reqs) -- UI + sidebar + i18n

### v16.0 — Key patterns for CatFlow
- CatFlow is NOT a new DB entity -- it's the tasks table with new UI + naming
- Backend API stays /api/tasks/... -- only new endpoint is /api/catflows/listening
- Node type keys LOWERCASE: scheduler, storage, multiagent
- Panel de config is shrink-0 flex child (phase 68 moves to fixed right sidebar)
- sourceHandle routing only in condition node currently -- getNextNodeIds helper needed
- output-node.tsx: only has Handle type="target" (terminal) -- no source handle
- start-node.tsx: only has Handle type="source" -- no target handle
- canvas_templates table exists but has no seeds in db.ts
- parentTaskId needed in canvas-executor for external_input injection

### Existing patterns (inherited)
- Sidebar items: Dashboard, CatBrains, CatPaw, Skills, Tareas, Conectores, Notificaciones, [Testing], Configuracion, Estado del Sistema
- crypto.randomUUID NOT available in HTTP -- use generateId() helper
- DB pattern: CREATE TABLE IF NOT EXISTS + ALTER TABLE try-catch
- process.env: use bracket notation process['env']['VAR']
- Colors: Primary mauve (#8B6D8B), accent violet-500/600, bg zinc-950
- withRetry for all external service calls
- In-memory TTL cache (Map-based)
- i18n: next-intl v3.26.5, useT(namespace) client, getTranslations(namespace) server
- All UI text via t(), both es.json and en.json must be in sync
