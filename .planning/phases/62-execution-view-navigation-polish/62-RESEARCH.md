# Phase 62 Research: Execution View + Navigation + Polish

## Phase Goal
The execution view shows canvas/fork/cycle progress, canvas is removed from the sidebar, and all new text is internationalized.

## Requirements
- EXEC-01 to EXEC-06: Execution view for canvas/fork/cycle
- NAV-01 to NAV-06: Navigation changes (sidebar cleanup, redirects, i18n, build)

## Success Criteria
1. Canvas step: show canvas name, progress bar (node X/Y), current node name, "Ver canvas en tiempo real" link → read-only React Flow modal with live node colors
2. Fork: side-by-side columns with per-step status indicators, "Esperando..." message
3. Variable mode: "Ciclo N/M" in progress bar — format "Ciclo N/M · Paso X/Y · [bar] Z% · time · tokens"
4. Canvas removed from sidebar; `/canvas` redirects 301 to `/tasks` with toast; `/canvas/[id]` still works
5. All new UI text uses i18n t() with keys in both es.json and en.json; `npm run build` passes

---

## Current State Analysis

### Task Detail Page (`app/src/app/tasks/[id]/page.tsx` — 1088 lines)
- **Types**: `TaskStepDetail.type` only declares `'agent' | 'checkpoint' | 'merge'` — missing `canvas`, `fork`, `join`
- **Step icons**: `getStepIcon()` only handles `checkpoint` and `merge`, defaults to `Bot` for everything else — needs `canvas` (Workflow), `fork` (GitFork), `join` (GitMerge) icons
- **No canvas execution progress**: Step card shows name/status/tokens but NO canvas node progress, no link to canvas viewer
- **No fork branch layout**: Fork steps render as flat sequential cards — no side-by-side column view
- **Cycle progress**: `run_count`/`execution_count` available in task data but not rendered as "Ciclo N/M" progress bar
- **Polling**: 2s interval via `GET /api/tasks/[id]/status` — works but returns no canvas_run or fork branch metadata

### Status API (`app/src/app/api/tasks/[id]/status/route.ts`)
- Returns: `{ status, current_step_index, elapsed_time, total_tokens, total_duration, steps[] }`
- Steps include: `id, order_index, type, name, agent_name, status, tokens_used, duration_seconds, output_preview`
- **Missing**: No canvas_run progress (node_states, current_node_id, canvas name, node count)
- **Missing**: No fork branch grouping or branch metadata
- **Missing**: No run_count/execution_count for cycle display

### Task Executor (`app/src/lib/services/task-executor.ts` — 1031 lines)
- **Canvas step** (lines 595-730): Creates canvas_run, polls every 2s, 30min timeout, extracts OUTPUT node result
- **Fork/Join** (lines 732-908): Promise.allSettled parallel branches, join concatenation with `--- Rama X ---` separators
- **Variable cycles** (lines 958-1007): Sequential N-cycle execution, resets steps between cycles
- All execution data persisted in DB — available for API queries

### Canvas Executor (`app/src/lib/services/canvas-executor.ts` — 785 lines)
- Stores `node_states` JSON in `canvas_runs` table with per-node status, output, tokens, timestamps
- `execution_order` array of topologically sorted node IDs
- `current_node_id` tracks active node
- Node statuses: `pending | running | completed | failed | waiting | skipped`

### Canvas Runs DB Schema
```sql
canvas_runs: id, canvas_id, status, node_states (JSON), current_node_id,
             execution_order (JSON), total_tokens, total_duration, metadata (JSON)
```
- `metadata.parent_task_id` and `metadata.parent_step_id` link back to task

### Sidebar (`app/src/components/layout/sidebar.tsx`)
- Canvas entry at line 52: `{ href: '/canvas', labelKey: 'canvas', icon: Workflow }`
- Active detection: `pathname === item.href || pathname.startsWith(item.href)`
- Simple array-based nav — removing canvas = delete one array entry

### Canvas Pages
- `/canvas` — `app/src/app/canvas/page.tsx` — list page with filters, grid cards, templates
- `/canvas/[id]` — `app/src/app/canvas/[id]/page.tsx` — editor with ReactFlow (dynamic import, SSR disabled)
- Existing redirect pattern: `/projects` → `/catbrains` using `redirect()` from `next/navigation`
- API redirect pattern: `NextResponse.redirect(url, 301)` in route handlers

### i18n Setup
- Library: `next-intl` (v3.26.5)
- Files: `app/messages/es.json` and `app/messages/en.json` (~2516 lines each)
- Usage: `useTranslations('tasks')` → `t('detail.pipeline')`
- Existing execution keys: `tasks.status.*`, `tasks.stepStatus.*`, `tasks.stepTypes.*`, `tasks.detail.cycleProgress`, `tasks.detail.cycleCount`

### React Flow
- Already in project for canvas editor — `@xyflow/react` package
- Canvas editor component: `app/src/components/canvas/canvas-editor.tsx`
- Node type components in `app/src/components/canvas/nodes/`
- Can reuse for read-only modal with `nodesDraggable={false}`, `nodesConnectable={false}`, `elementsSelectable={false}`

---

## Key Gaps to Address

### 1. Status API Enhancement
- Add canvas_run data when step type is `canvas` and step is `running`: canvas name, node count, completed node count, current node name, canvas_run_id
- Add fork branch grouping: fork_group, branch_index, branch_label per step
- Add run_count + execution_count to status response for cycle progress

### 2. TypeScript Types
- Extend `TaskStepDetail.type` union to include `'canvas' | 'fork' | 'join'`
- Add `canvas_id`, `fork_group`, `branch_index`, `branch_label` fields to `TaskStepDetail`

### 3. Canvas Step UI
- Progress bar showing completed nodes / total nodes
- Current node name display
- "Ver canvas en tiempo real" link → opens read-only React Flow modal

### 4. Read-Only Canvas Modal
- Reuse React Flow with read-only flags
- Load canvas flow_data for layout
- Overlay node_states colors: pending=zinc, running=violet+pulse, completed=emerald, failed=red
- Poll canvas_run status to update node colors live

### 5. Fork Branch Display
- Detect fork_group in steps array, group branches
- Render as side-by-side columns (CSS grid: `grid-cols-2` or `grid-cols-3`)
- Per-step status indicator within each branch column
- "Esperando que finalicen todas las ramas..." message when fork is running

### 6. Cycle Progress
- When `execution_mode === 'variable'`: show "Ciclo N/M" progress bar
- Format: "Ciclo N/M · Paso X/Y · [bar] Z% · time · tokens"
- Needs run_count from status API

### 7. Navigation Changes
- Remove `{ href: '/canvas', ... }` from sidebar navItems array
- `/canvas` page: `redirect('/tasks')` + need toast mechanism (toast on redirect target)
- `/canvas/[id]` page: keep working for direct editing
- Consider: URL param `?from=canvas` on redirect to trigger toast on `/tasks` page

---

## Plan Breakdown (4 plans)

### 62-01: Status API + Types + Canvas Step UI
- Extend status API with canvas_run progress and cycle data
- Update TypeScript types for all step types
- Canvas step card with progress bar, node info, link placeholder
- i18n keys for canvas execution

### 62-02: Read-Only Canvas Execution Modal
- React Flow modal component with read-only canvas view
- Live node color updates from polling data
- "Ver canvas en tiempo real" link opens modal

### 62-03: Fork Branch View + Cycle Progress
- Extend status API with fork branch metadata
- Side-by-side branch columns layout
- Cycle "Ciclo N/M" progress bar
- i18n keys

### 62-04: Navigation + Sidebar + i18n Audit + Build
- Remove canvas from sidebar
- /canvas redirect to /tasks with toast
- Final i18n audit
- npm run build validation
