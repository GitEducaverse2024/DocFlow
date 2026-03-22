# Roadmap: DoCatFlow

## Milestones

- v12.0 WebSearch CatBrain -- Phases 48-49 (shipped 2026-03-16) -- [archive](.planning/milestones/v12.0-ROADMAP.md)
- v13.0 Conector Gmail -- Phases 50-51 (shipped 2026-03-16)
- v14.0 CatBrain UX Redesign -- Phases 52-56 (shipped 2026-03-21) -- [archive](.planning/milestones/v14.0-ROADMAP.md)
- v15.0 Tasks Unified -- Phases 57-62 (shipped 2026-03-22) -- [archive](.planning/milestones/v15.0-ROADMAP.md)
- **v16.0 CatFlow** -- Phases 63-70 (active)

## Phases

- [x] **Phase 63: Rename UI + BD base + API inter-CatFlow** - Sidebar rename, /catflow route, DB columns/table, inter-CatFlow API endpoints, i18n base
- [x] **Phase 64: CatFlow Page** - Custom /catflow page with CatFlowCard, toggle, badges, filters, fork dialog, listen section
- [ ] **Phase 65: Scheduler Node** - Canvas node with delay/count/listen modes, multi-handle routing, signal endpoint
- [x] **Phase 66: Storage Node** - Canvas node for persisting results to local files or connectors with LLM formatting
- [ ] **Phase 67: MultiAgent Node + Templates** - Canvas node to trigger other CatFlows (sync/async), 3 seed templates
- [ ] **Phase 68: Config Panel Redesign + Copy/Paste** - Right sidebar panel replacing bottom panel, Ctrl+C/V node copy/paste
- [ ] **Phase 69: Enhanced START + Enhanced OUTPUT** - START listen_mode badge/handle, OUTPUT notifications + trigger chain
- [ ] **Phase 70: CatBot + Tests + Docs** - 4 CatBot tools, E2E + API tests, i18n audit, build validation

## Phase Details

### Phase 63: Rename UI + BD base + API inter-CatFlow
**Goal**: Sidebar shows "CatFlow", /catflow works, DB has new columns and table, inter-CatFlow API ready
**Depends on**: v15.0 complete (phase 62)
**Requirements**: REN-01, REN-02, REN-03, REN-04, REN-05, REN-06, DB-01, DB-02, DB-03, DB-04, DB-05, API-01, API-02, API-03, API-04
**Success Criteria** (what must be TRUE):
  1. Sidebar displays "CatFlow" with Zap icon linking to /catflow; /catflow loads the task list
  2. /tasks continues working without redirect for backward compatibility
  3. Columns listen_mode and external_input exist in tasks table; catflow_triggers table exists
  4. GET /api/catflows/listening returns tasks with listen_mode=1; POST /api/catflow-triggers creates trigger and launches target
  5. npm run build passes without TypeScript errors
**Plans:** 4/4 plans complete
Plans:
- [x] 63-01-PLAN.md -- Sidebar CatFlow rename + /catflow routes
- [x] 63-02-PLAN.md -- DB schema (listen_mode, external_input, catflow_triggers) + TypeScript types
- [x] 63-03-PLAN.md -- Inter-CatFlow API endpoints (4 routes)
- [x] 63-04-PLAN.md -- i18n catflow namespace + nav keys

### Phase 64: CatFlow Page
**Goal**: /catflow has its own UX with cards, toggles, badges, filters, fork, and listen section
**Depends on**: Phase 63 (needs /catflow route, listen_mode column, API endpoints)
**Requirements**: PAGE-01, PAGE-02, PAGE-03, PAGE-04, PAGE-05, PAGE-06, PAGE-07, PAGE-08, PAGE-09, PAGE-10
**Success Criteria** (what must be TRUE):
  1. /catflow renders CatFlowCard components with toggle active/inactive that persists
  2. Badge "En escucha" visible on cards with listen_mode=1; schedule badge on scheduled tasks
  3. Filters (Todos/Activos/Programados/En escucha/Borradores) work with correct counts
  4. Fork creates a complete copy (task + all steps) with user-specified name
  5. Collapsible "CatFlows a la escucha" section at bottom with per-item listen_mode toggle
**Plans**: 64-01 (CatFlowCard component), 64-02 (ForkDialog), 64-03 (page + filters + listen section), 64-04 (i18n)

### Phase 65: Scheduler Node
**Goal**: Scheduler node in canvas editor controls flow timing with delay, count, and listen modes
**Depends on**: Phase 63 (needs catflow_triggers table for listen mode signaling)
**Requirements**: SCHED-01, SCHED-02, SCHED-03, SCHED-04, SCHED-05, SCHED-06, SCHED-07, SCHED-08, SCHED-09, SCHED-10
**Success Criteria** (what must be TRUE):
  1. Scheduler node appears in palette under "Control de flujo" with amber colors
  2. 3 output handles (TRUE, COMPLETADO, FALSE); FALSE only visible in listen mode
  3. Delay mode pauses execution for N time units then emits via output-true
  4. Count mode cycles using canvas_run metadata; emits output-true per cycle, output-completed when done
  5. Listen mode waits for signal via /api/canvas/[id]/run/[runId]/signal; emits output-true or output-false on timeout
**Plans**: 4/4 plans complete
Plans:
- [x] 65-01-PLAN.md -- SchedulerNode component (amber, 3 handles, dynamic label)
- [x] 65-02-PLAN.md -- Config panel form (delay/count/listen modes)
- [x] 65-03-PLAN.md -- Executor logic + signal API + getSkippedNodes fix + count cycles
- [x] 65-04-PLAN.md -- Palette + NODE_TYPES registration + i18n

### Phase 66: Storage Node
**Goal**: Storage node persists flow results to local files or external connectors
**Depends on**: Nothing specific (uses existing connector infrastructure)
**Requirements**: STOR-01, STOR-02, STOR-03, STOR-04, STOR-05, STOR-06, STOR-07, STOR-08
**Success Criteria** (what must be TRUE):
  1. Storage node appears in palette with teal colors, input + output handles
  2. Config panel supports local/connector/both modes with filename template
  3. Filename template variables ({date}, {time}, {run_id}, {title}) resolve correctly
  4. Local mode writes to PROJECTS_PATH/storage/{subdir}/{filename}
  5. If use_llm_format enabled, LLM formats content before saving; output passes to next node
**Plans**: 4/4 plans complete
Plans:
- [x] 66-01-PLAN.md -- StorageNode component (teal, single input + single output, mode badge)
- [x] 66-02-PLAN.md -- Config panel form (mode selector, filename template, subdir, connector, LLM toggle)
- [x] 66-03-PLAN.md -- Executor logic (resolveFilenameTemplate, local write, connector invocation, LLM format)
- [x] 66-04-PLAN.md -- Palette + NODE_TYPES registration + i18n keys

### Phase 67: MultiAgent Node + Templates
**Goal**: MultiAgent node triggers other CatFlows; 3 seed templates added
**Depends on**: Phase 63 (needs catflow_triggers table, API endpoints, listen_mode)
**Requirements**: MA-01, MA-02, MA-03, MA-04, MA-05, MA-06, MA-07, MA-08, MA-09, TMPL-01, TMPL-02, TMPL-03, TMPL-04
**Success Criteria** (what must be TRUE):
  1. MultiAgent node in palette under "Avanzado" with purple colors, output-response and output-error handles
  2. Selector loads only tasks with listen_mode=1; shows warning if none available
  3. Sync mode creates trigger, launches target, polls until done, emits via output-response or output-error
  4. Async mode creates trigger, launches target, continues immediately with trigger_id
  5. 3 canvas templates seeded on startup (Pipeline Multi-Agente, Flujo con Almacenamiento, Flujo Modular)
**Plans:** 4 plans
Plans:
- [x] 67-01-PLAN.md -- MultiAgentNode component (purple, dual output handles, mode badge)
- [x] 67-02-PLAN.md -- Config panel + palette + NODE_TYPES registration + i18n
- [ ] 67-03-PLAN.md -- Executor logic (sync/async modes, timeout, branch skipping)
- [x] 67-04-PLAN.md -- 3 seed templates (INSERT OR IGNORE, idempotent)

### Phase 68: Config Panel Redesign + Copy/Paste
**Goal**: Config panel moves to right sidebar; nodes can be copied/pasted
**Depends on**: Phases 65-67 (new nodes need the panel to work)
**Requirements**: PANEL-01, PANEL-02, PANEL-03, PANEL-04, PANEL-05, PANEL-06, PANEL-07, PANEL-08, PANEL-09, CP-01, CP-02, CP-03
**Success Criteria** (what must be TRUE):
  1. Config panel renders as fixed right sidebar (w-80) with slide-in/out transition
  2. Canvas compresses width when panel is open; click on empty area closes it
  3. Panel has fixed header (editable name, type, close), scrollable body, fixed footer (Duplicar + delete)
  4. Panel does not open during execution; execution result panel (bottom) unchanged
  5. Ctrl+C copies selected nodes with toast; Ctrl+V pastes with 60px offset; shortcuts skip input elements
**Plans**: 68-01 (panel refactor), 68-02 (canvas-editor layout adjustment), 68-03 (copy/paste)

### Phase 69: Enhanced START + Enhanced OUTPUT
**Goal**: START supports listen_mode with badge/handle; OUTPUT supports notifications and trigger chains
**Depends on**: Phase 63 (listen_mode column), Phase 67 (multiagent/trigger infrastructure)
**Requirements**: START-01, START-02, START-03, START-04, OUT-01, OUT-02, OUT-03, OUT-04, OUT-05
**Success Criteria** (what must be TRUE):
  1. START shows amber "En escucha" badge and input-external handle when listen_mode enabled
  2. Toggle listen_mode in config panel PATCHes parent task; executor injects external_input as START output
  3. OUTPUT config panel has notification toggle and "Activar otros CatFlows" trigger list
  4. Canvas executor creates notification on OUTPUT completion when configured
  5. Canvas executor fires trigger chain to other CatFlows on OUTPUT completion (fire-and-forget)
**Plans**: 69-01 (START listen_mode), 69-02 (START executor logic), 69-03 (OUTPUT config + triggers), 69-04 (OUTPUT executor logic)

### Phase 70: CatBot + Tests + Docs
**Goal**: CatBot gets 4 new tools, E2E + API tests pass, all i18n keys present, build clean
**Depends on**: All previous phases (tests validate everything)
**Requirements**: BOT-01, BOT-02, BOT-03, BOT-04, BOT-05, TEST-01, TEST-02, BUILD-01, BUILD-02
**Success Criteria** (what must be TRUE):
  1. CatBot can list, execute, toggle listen_mode, and fork CatFlows via tools
  2. CatBot system prompt includes CatFlow context paragraph
  3. 8 E2E specs pass (page, sidebar, nodes, interactions)
  4. 3 API specs pass (catflow-triggers endpoints)
  5. All new UI text has i18n keys in es.json + en.json; npm run build passes clean

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 63. Rename UI + BD base + API inter-CatFlow | 0/4 | Complete    | 2026-03-22 |
| 64. CatFlow Page | 4/4 | Complete | 2026-03-22 |
| 65. Scheduler Node | 4/4 | Complete | 2026-03-22 |
| 66. Storage Node | 4/4 | Complete | 2026-03-22 |
| 67. MultiAgent Node + Templates | 1/4 | Active | — |
| 68. Config Panel Redesign + Copy/Paste | 0/3 | Pending | — |
| 69. Enhanced START + Enhanced OUTPUT | 0/4 | Pending | — |
| 70. CatBot + Tests + Docs | 0/1 | Pending | — |

---
*Created: 2026-03-22*
*Last updated: 2026-03-22*
