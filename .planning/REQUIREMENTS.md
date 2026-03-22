# Requirements: DoCatFlow v16.0 — CatFlow

**Defined:** 2026-03-22
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.

## v16.0 Requirements

Requirements for CatFlow milestone. Each maps to roadmap phases.

### Rename + Routing

- [x] **REN-01**: Sidebar shows "CatFlow" with Zap icon where "Tareas" was, linking to /catflow
- [x] **REN-02**: /catflow route loads and displays the same task list as /tasks
- [x] **REN-03**: /tasks continues working for backward compatibility (no redirect)
- [x] **REN-04**: Breadcrumb shows "CatFlow" label for /catflow routes
- [x] **REN-05**: i18n namespace "catflow" exists in both es.json and en.json with base keys
- [x] **REN-06**: nav label key "catflow" added to sidebar i18n

### Database + API Foundation

- [x] **DB-01**: tasks table has listen_mode INTEGER column (default 0)
- [x] **DB-02**: tasks table has external_input TEXT column
- [x] **DB-03**: catflow_triggers table exists (id, source_task_id, source_run_id, source_node_id, target_task_id, payload, status, response, created_at, completed_at)
- [x] **DB-04**: CatFlowTrigger TypeScript interface defined in types.ts
- [x] **DB-05**: Task interface extended with listen_mode and external_input fields

### Inter-CatFlow API

- [x] **API-01**: GET /api/catflows/listening returns tasks with listen_mode=1
- [x] **API-02**: POST /api/catflow-triggers creates trigger, sets external_input on target, launches target task (fire-and-forget)
- [x] **API-03**: GET /api/catflow-triggers/[id] returns trigger status for polling
- [x] **API-04**: POST /api/catflow-triggers/[id]/complete marks trigger as completed with response

### CatFlow Page

- [ ] **PAGE-01**: /catflow has its own page with CatFlowCard components (not re-export)
- [ ] **PAGE-02**: CatFlowCard shows toggle active/inactive, badges (En escucha, Programado), action buttons (Ejecutar, Editar, Fork, Exportar)
- [ ] **PAGE-03**: Toggle active/inactive persists via PATCH /api/tasks/[id] with status ready/draft
- [ ] **PAGE-04**: Badge "En escucha" visible on cards with listen_mode=1
- [ ] **PAGE-05**: Filters: Todos, Activos, Programados, En escucha, Borradores with counts
- [ ] **PAGE-06**: Fork button opens ForkDialog that duplicates task + all steps with new name
- [ ] **PAGE-07**: Export button calls POST /api/tasks/[id]/export and downloads ZIP
- [ ] **PAGE-08**: Dropdown menu with Rename (inline edit) and Delete (confirm dialog)
- [ ] **PAGE-09**: Collapsible "CatFlows a la escucha" section at bottom with listen_mode toggle per item
- [ ] **PAGE-10**: "Nuevo CatFlow" button navigates to /tasks/new (existing wizard)

### Scheduler Node

- [ ] **SCHED-01**: scheduler node type registered in canvas-editor NODE_TYPES and visible in palette under "Control de flujo"
- [ ] **SCHED-02**: SchedulerNode component with amber-600 colors, input handle, output-true/output-completed/output-false handles
- [ ] **SCHED-03**: output-false handle visible only when schedule_type is 'listen'
- [ ] **SCHED-04**: Config panel supports 3 modes: delay (time wait), count (repeat N), listen (wait for signal)
- [ ] **SCHED-05**: Delay mode: pauses execution for configured time, emits via output-true
- [ ] **SCHED-06**: Count mode: cycles using canvas_run metadata, emits output-true per cycle, output-completed when done
- [ ] **SCHED-07**: Listen mode: waits for external signal via /api/canvas/[id]/run/[runId]/signal endpoint, emits output-true or output-false on timeout
- [ ] **SCHED-08**: getNextNodeIds helper function extends sourceHandle routing for all nodes (replaces condition-only pattern)
- [ ] **SCHED-09**: POST /api/canvas/[id]/run/[runId]/signal endpoint accepts node_id and signal boolean
- [ ] **SCHED-10**: Node label updates dynamically based on mode (e.g., "Esperar 5 minutos", "Repetir 3 veces", "Esperando señal...")

### Storage Node

- [ ] **STOR-01**: storage node type registered in canvas-editor NODE_TYPES and visible in palette
- [ ] **STOR-02**: StorageNode component with teal-600 colors, input handle, single output handle (continuation)
- [ ] **STOR-03**: Config panel supports storage_mode: local, connector, both
- [ ] **STOR-04**: Filename template with variable substitution ({date}, {time}, {run_id}, {title})
- [ ] **STOR-05**: If use_llm_format enabled, calls LLM with format_instructions before saving
- [ ] **STOR-06**: Local mode writes file to PROJECTS_PATH/storage/{subdir}/{filename}
- [ ] **STOR-07**: Connector mode invokes configured connector with content and filename
- [ ] **STOR-08**: Output passes saved content to next node in flow

### MultiAgent Node

- [x] **MA-01**: multiagent node type registered in canvas-editor NODE_TYPES and visible in palette under "Avanzado"
- [ ] **MA-02**: MultiAgentNode component with purple-600 colors, input handle, output-response and output-error handles
- [x] **MA-03**: Config panel selector loads only tasks with listen_mode=1 via GET /api/catflows/listening
- [x] **MA-04**: If no CatFlows are listening, panel shows clear warning message
- [x] **MA-05**: Payload template with variable substitution ({input}, {context}, {run_id})
- [ ] **MA-06**: Sync mode: creates catflow_trigger, launches target task, polls until completed/failed, emits via output-response or output-error
- [ ] **MA-07**: Async mode: creates catflow_trigger, launches target task, continues immediately with trigger_id via output-response
- [ ] **MA-08**: Timeout emits via output-error with descriptive message
- [ ] **MA-09**: catflow_triggers record updated to completed/failed when target finishes

### Canvas Templates

- [ ] **TMPL-01**: 3 canvas templates seeded in canvas_templates table on startup (if table is empty)
- [ ] **TMPL-02**: Template "Pipeline Multi-Agente": start → agent → agent → output
- [ ] **TMPL-03**: Template "Flujo con Almacenamiento": start → agent → storage → output
- [ ] **TMPL-04**: Template "Flujo Modular": start → agent → multiagent → output/error with sourceHandle edges

### Config Panel Redesign

- [ ] **PANEL-01**: Node config panel renders as fixed right sidebar (w-80) instead of bottom flex child
- [ ] **PANEL-02**: Panel slides in/out with translate-x transition when node is selected/deselected
- [ ] **PANEL-03**: Canvas compresses width (pr-80) when panel is open
- [ ] **PANEL-04**: Panel has fixed header with editable node name, type indicator, and close button
- [ ] **PANEL-05**: Panel body is scrollable for long configurations
- [ ] **PANEL-06**: Panel has fixed footer with "Duplicar" and delete (red) buttons
- [ ] **PANEL-07**: Panel does not open during execution (read-only mode)
- [ ] **PANEL-08**: Click on empty canvas area closes the panel
- [ ] **PANEL-09**: Execution result panel (bottom) remains unchanged

### Copy/Paste

- [ ] **CP-01**: Ctrl+C copies selected node(s) with toast notification
- [ ] **CP-02**: Ctrl+V pastes copied nodes with 60px offset and toast notification
- [ ] **CP-03**: Copy/paste shortcuts are not intercepted when focus is in input/textarea/select elements

### Enhanced START Node

- [ ] **START-01**: START node shows "En escucha" badge with amber pulse animation when data.listen_mode is true
- [ ] **START-02**: Handle type="target" with id="input-external" appears on START when listen_mode enabled
- [ ] **START-03**: Toggle listen_mode in config panel PATCHes the parent task's listen_mode column
- [ ] **START-04**: Canvas executor injects task.external_input as START output when present, then clears it

### Enhanced OUTPUT Node

- [ ] **OUT-01**: OUTPUT config panel has "Al completar" section with notification toggle
- [ ] **OUT-02**: If notify_on_complete enabled, canvas executor inserts notification in notifications table
- [ ] **OUT-03**: OUTPUT config panel has "Activar otros CatFlows" section with add/remove trigger list
- [ ] **OUT-04**: Each trigger has CatFlowSelect (loads listening CatFlows) and payload template
- [ ] **OUT-05**: Canvas executor fires triggers on OUTPUT completion (fire-and-forget, sets external_input on target)

### CatBot Integration

- [ ] **BOT-01**: CatBot tool list_catflows lists all tasks formatted as CatFlows
- [ ] **BOT-02**: CatBot tool execute_catflow executes a CatFlow by name or ID
- [ ] **BOT-03**: CatBot tool toggle_catflow_listen activates/deactivates listen_mode on a CatFlow
- [ ] **BOT-04**: CatBot tool fork_catflow duplicates a CatFlow with new name (task + steps)
- [ ] **BOT-05**: CatBot system prompt updated with CatFlow context paragraph

### Testing

- [ ] **TEST-01**: 8 E2E specs for CatFlow page, sidebar, nodes, interactions
- [ ] **TEST-02**: 3 API specs for catflow-triggers endpoints

### Build + i18n

- [ ] **BUILD-01**: All new UI text uses i18n t() with keys in both es.json and en.json
- [ ] **BUILD-02**: npm run build passes without TypeScript errors after all changes

## Future Requirements

### Marketplace
- **MKTPL-01**: Users can publish task bundles to a shared marketplace
- **MKTPL-02**: Users can browse and install community task bundles

### Advanced Scheduling
- **ASCHD-01**: Cron expression editor for advanced users
- **ASCHD-02**: Conditional scheduling (run only if previous run succeeded)

### Canvas Loops
- **LOOP-01**: Canvas DAG extended to support controlled loops via scheduler count node

## Out of Scope

| Feature | Reason |
|---------|--------|
| New /api/catflows/[id]/execute endpoint | Backend uses /api/tasks/[id]/execute — no duplication |
| Separate CatFlow database table | CatFlow lives in tasks table — no new entity |
| Canvas loop detection at runtime | DAG only, scheduler count handles iteration within bounds |
| WebSocket for inter-CatFlow | Polling and fire-and-forget sufficient for single-server |
| canvases.canvas_type / is_active / draft_data columns | CatFlow lives in tasks, not canvases |
| /tasks redirect to /catflow | /tasks stays for backward compat with bookmarks |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REN-01 | Phase 63 | Complete |
| REN-02 | Phase 63 | Complete |
| REN-03 | Phase 63 | Complete |
| REN-04 | Phase 63 | Complete |
| REN-05 | Phase 63 | Complete |
| REN-06 | Phase 63 | Complete |
| DB-01 | Phase 63 | Complete |
| DB-02 | Phase 63 | Complete |
| DB-03 | Phase 63 | Complete |
| DB-04 | Phase 63 | Complete |
| DB-05 | Phase 63 | Complete |
| API-01 | Phase 63 | Complete |
| API-02 | Phase 63 | Complete |
| API-03 | Phase 63 | Complete |
| API-04 | Phase 63 | Complete |
| PAGE-01 | Phase 64 | Pending |
| PAGE-02 | Phase 64 | Pending |
| PAGE-03 | Phase 64 | Pending |
| PAGE-04 | Phase 64 | Pending |
| PAGE-05 | Phase 64 | Pending |
| PAGE-06 | Phase 64 | Pending |
| PAGE-07 | Phase 64 | Pending |
| PAGE-08 | Phase 64 | Pending |
| PAGE-09 | Phase 64 | Pending |
| PAGE-10 | Phase 64 | Pending |
| SCHED-01 | Phase 65 | Pending |
| SCHED-02 | Phase 65 | Pending |
| SCHED-03 | Phase 65 | Pending |
| SCHED-04 | Phase 65 | Pending |
| SCHED-05 | Phase 65 | Pending |
| SCHED-06 | Phase 65 | Pending |
| SCHED-07 | Phase 65 | Pending |
| SCHED-08 | Phase 65 | Pending |
| SCHED-09 | Phase 65 | Pending |
| SCHED-10 | Phase 65 | Pending |
| STOR-01 | Phase 66 | Pending |
| STOR-02 | Phase 66 | Pending |
| STOR-03 | Phase 66 | Pending |
| STOR-04 | Phase 66 | Pending |
| STOR-05 | Phase 66 | Pending |
| STOR-06 | Phase 66 | Pending |
| STOR-07 | Phase 66 | Pending |
| STOR-08 | Phase 66 | Pending |
| MA-01 | Phase 67 | Complete |
| MA-02 | Phase 67 | Pending |
| MA-03 | Phase 67 | Complete |
| MA-04 | Phase 67 | Complete |
| MA-05 | Phase 67 | Complete |
| MA-06 | Phase 67 | Pending |
| MA-07 | Phase 67 | Pending |
| MA-08 | Phase 67 | Pending |
| MA-09 | Phase 67 | Pending |
| TMPL-01 | Phase 67 | Pending |
| TMPL-02 | Phase 67 | Pending |
| TMPL-03 | Phase 67 | Pending |
| TMPL-04 | Phase 67 | Pending |
| PANEL-01 | Phase 68 | Pending |
| PANEL-02 | Phase 68 | Pending |
| PANEL-03 | Phase 68 | Pending |
| PANEL-04 | Phase 68 | Pending |
| PANEL-05 | Phase 68 | Pending |
| PANEL-06 | Phase 68 | Pending |
| PANEL-07 | Phase 68 | Pending |
| PANEL-08 | Phase 68 | Pending |
| PANEL-09 | Phase 68 | Pending |
| CP-01 | Phase 68 | Pending |
| CP-02 | Phase 68 | Pending |
| CP-03 | Phase 68 | Pending |
| START-01 | Phase 69 | Pending |
| START-02 | Phase 69 | Pending |
| START-03 | Phase 69 | Pending |
| START-04 | Phase 69 | Pending |
| OUT-01 | Phase 69 | Pending |
| OUT-02 | Phase 69 | Pending |
| OUT-03 | Phase 69 | Pending |
| OUT-04 | Phase 69 | Pending |
| OUT-05 | Phase 69 | Pending |
| BOT-01 | Phase 70 | Pending |
| BOT-02 | Phase 70 | Pending |
| BOT-03 | Phase 70 | Pending |
| BOT-04 | Phase 70 | Pending |
| BOT-05 | Phase 70 | Pending |
| TEST-01 | Phase 70 | Pending |
| TEST-02 | Phase 70 | Pending |
| BUILD-01 | Phase 70 | Pending |
| BUILD-02 | Phase 70 | Pending |

**Coverage:**
- v16.0 requirements: 76 total
- Mapped to phases: 76
- Unmapped: 0

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22*
