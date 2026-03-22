# Phase 69 Research: Enhanced START + Enhanced OUTPUT

## Current State

### START Node
- **Component**: `app/src/components/canvas/nodes/start-node.tsx` (45 lines)
  - 100x100 rounded-full, emerald color, Play icon
  - Single source handle (Position.Right)
  - No badges, no target handle
- **Config**: `node-config-panel.tsx` lines 131-148 — only `initialInput` textarea
- **Executor**: `canvas-executor.ts` line 293-295 — returns `initialInput || ''`
- **Defaults**: `{ label, initialInput: '' }` in canvas-editor.tsx line 108

### OUTPUT Node
- **Component**: `app/src/components/canvas/nodes/output-node.tsx` (70 lines)
  - 120x80 rounded-full, emerald border, Flag icon
  - Single target handle (Position.Left), NO source handle
  - Shows `outputName`, `format` label, "View Result" badge
- **Config**: `node-config-panel.tsx` lines 420-447 — `outputName` + `format` dropdown
- **Executor**: `canvas-executor.ts` lines 593-604 — passes predecessor output, formats JSON
- **Defaults**: `{ label, outputName, format: 'markdown' }` in canvas-editor.tsx line 142

### Infrastructure
- **listen_mode** column: `tasks.listen_mode` (0/1), toggled via PATCH `/api/tasks/[id]`
- **external_input** column: `tasks.external_input` (JSON string), set by MultiAgent trigger
- **catflow_triggers** table: id, source_task_id, source_run_id, source_node_id, target_task_id, payload, status, response, created_at, completed_at
- **Notifications**: `createNotification()` in `notifications.ts` — type, title, message, severity, link
- **MultiAgent trigger flow**: validate listen_mode → resolve payload → INSERT trigger → SET external_input → executeTaskWithCycles()
- **Config panel loads**: `listeningCatflows` via `fetch('/api/catflows/listening')` for multiagent type

### Badge Patterns
- Scheduler: mode icon + label inline (amber)
- MultiAgent: execution_mode pill badge (purple)
- Storage: mode label pill badge (teal)
- CatBrain: RAG dot + connectors count + search engine badges

## Requirements Mapping

### START-01: Badge + handle
START shows amber "En escucha" badge when `listen_mode` enabled on parent task.
Add `input-external` Handle (Position.Left) visible only when listen_mode active.

### START-02: Config toggle
Toggle listen_mode in config panel PATCHes parent task.
Need to: fetch parent task's listen_mode, add toggle, call PATCH on change.

### START-03: Executor injects external_input
When executing, if task has external_input, use it as START output instead of initialInput.

### START-04: Input handle wiring
The input-external handle allows edges from other flows (visual only — actual data comes via external_input column).

### OUT-01: Notification toggle
OUTPUT config panel has notification toggle (create notification on completion).

### OUT-02: Trigger list
"Activar otros CatFlows" section in OUTPUT config — multi-select from listening CatFlows.

### OUT-03: Executor creates notification
When OUTPUT completes and notification enabled, call createNotification().

### OUT-04: Executor fires trigger chain
When OUTPUT completes and trigger targets configured, create triggers and fire-and-forget executeTaskWithCycles() for each.

### OUT-05: Trigger chain is fire-and-forget
No waiting, no sync mode — just fire triggers and continue.
