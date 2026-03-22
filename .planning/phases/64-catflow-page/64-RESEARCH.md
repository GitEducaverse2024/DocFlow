# Phase 64: CatFlow Page — Research

## Phase Goal
/catflow has its own UX with CatFlowCard components, toggle active/inactive, badges (listen_mode, scheduled), filters, fork dialog, and collapsible "CatFlows a la escucha" section.

## Success Criteria
1. /catflow renders CatFlowCard components with toggle active/inactive that persists
2. Badge "En escucha" visible on cards with listen_mode=1; schedule badge on scheduled tasks
3. Filters (Todos/Activos/Programados/En escucha/Borradores) work with correct counts
4. Fork creates a complete copy (task + all steps) with user-specified name
5. Collapsible "CatFlows a la escucha" section at bottom with per-item listen_mode toggle

## Dependencies (Phase 63 Outputs)
- `/catflow` route exists, renders `<TaskListContent />`
- `listen_mode` INTEGER column in tasks table (0=off, 1=listening)
- `external_input` TEXT column in tasks table
- `catflow_triggers` table with full schema
- `GET /api/catflows/listening` returns tasks with listen_mode=1
- `POST /api/catflow-triggers` creates trigger and launches target
- i18n `catflow` namespace exists with basic keys

## Current State Analysis

### Existing Page: task-list-content.tsx
- **Path**: `app/src/components/tasks/task-list-content.tsx` (363 lines)
- Shared by both `/catflow` and `/tasks` routes
- Detects route via `pathname.startsWith('/catflow')`
- Current filters: all, running, completed, draft (4 buttons)
- Current card: inline `<Link>` block, NOT a separate component
- Shows: name, status badge, description, progress bar, agents, project names, time ago
- Has delete button on hover
- Templates section at bottom
- Uses `useTranslations('tasks')` — shares tasks namespace

### EnrichedTask Interface (current)
```typescript
interface EnrichedTask {
  id, name, description, status, steps_count, steps_completed,
  agents: string[], project_names: string[], created_at, updated_at,
  total_tokens, total_duration
}
```
**Missing for phase 64:** listen_mode, execution_mode, schedule_config, run_count, execution_count

### GET /api/tasks Response
Returns all tasks with enrichment (steps_count, steps_completed, agents, project_names). Does NOT currently return listen_mode, execution_mode, or schedule_config — these exist in DB but are not in the SELECT * enrichment (they ARE returned since it's SELECT *, but not in the EnrichedTask interface).

### PATCH /api/tasks/[id]
Allowed fields: name, description, expected_output, linked_projects, status, execution_mode, execution_count, schedule_config. **listen_mode is NOT in allowedFields** — needs to be added for toggle.

### Task TypeScript Interface (lib/types.ts)
Full Task interface includes listen_mode, execution_mode, schedule_config, etc.

### No Fork/Duplicate Endpoint
No existing API to fork/duplicate a task. Need new endpoint: `POST /api/tasks/[id]/fork`.

### Card Patterns in Codebase
- **CanvasCard**: Separate component, props-based, thumbnail + badges + actions
- **CatPawCard**: Separate component, avatar + mode badge + stats bar
- Both use `bg-zinc-900 border border-zinc-800 rounded-xl` styling

### i18n Structure
- Framework: next-intl, cookie-based locale
- Files: `app/messages/es.json`, `app/messages/en.json`
- `catflow` namespace exists with: title, description, newCatflow, listening, notListening, triggers.*

### UI Components Available
- `Badge` (CVA variants), `Button`, `Switch` (@base-ui/react), `Card` (composable slots)
- `Dialog` for modals, `Input` for text fields
- No Collapsible/Accordion primitive — implement with state + CSS transition

## API Changes Needed

### 1. PATCH /api/tasks/[id] — Add listen_mode to allowedFields
File: `app/src/app/api/tasks/[id]/route.ts` line 39

### 2. POST /api/tasks/[id]/fork — New endpoint
Creates a complete copy of task + all steps with new name.
- Copy all task fields except id, created_at, updated_at, status (set to 'draft'), run_count (0)
- Copy all task_steps with new IDs and task_id reference
- Return new task

### 3. GET /api/tasks — Already returns all fields via SELECT *
EnrichedTask interface in the component needs updating to include listen_mode, execution_mode, schedule_config.

## Component Architecture

### New Components
1. **CatFlowCard** — `app/src/components/catflow/catflow-card.tsx`
   - Props: task data, onToggleActive, onFork, onDelete
   - Status badge, listen_mode badge, schedule badge
   - Active/inactive toggle (Switch)
   - Fork button, delete button

2. **ForkDialog** — `app/src/components/catflow/fork-dialog.tsx`
   - Dialog with name input
   - Calls POST /api/tasks/[id]/fork
   - Shows loading, success toast

3. **CatFlowPageContent** — New page component replacing TaskListContent for /catflow
   - Path: `app/src/components/catflow/catflow-page-content.tsx`
   - 5 filters: Todos, Activos, Programados, En escucha, Borradores
   - CatFlowCard grid
   - Collapsible "CatFlows a la escucha" section at bottom
   - Templates section

## Key Design Decisions
- **Separate component** (CatFlowPageContent) instead of extending TaskListContent — cleaner separation, TaskListContent stays for /tasks backward compat
- **Active/inactive toggle** maps to task status: ready/completed = active, draft = inactive (toggle PATCHes status)
- **Fork dialog** uses Dialog component for user to specify new name
- **Collapsible section** uses simple state toggle + max-height CSS transition (no new dependency)
- **Filters** use same Button pattern as current task list
