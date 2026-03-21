# Phase 59: Cascade Wizard - Research

**Researched:** 2026-03-21
**Domain:** React UI wizard component, task creation flow, schedule configuration
**Confidence:** HIGH

## Summary

Phase 59 replaces the existing horizontal 4-step task creation wizard (`/tasks/new/page.tsx`, ~1100 lines) with a vertical cascade wizard featuring 5 sections that reveal sequentially. The current wizard uses a numbered stepper with Anterior/Siguiente navigation and manages all state locally in a single `WizardContent` component. The new wizard must add two new step types (Canvas, Fork) to the pipeline builder, add a new "Ciclo de Ejecucion" section for scheduling, and change the visual layout from horizontal step navigation to vertical collapsible sections.

Phase 57 has already landed the schema changes: `tasks` table has `execution_mode`, `execution_count`, `run_count`, `schedule_config` columns; `task_steps` has `canvas_id`, `fork_group`, `branch_index`, `branch_label` columns; `TaskSchedule` table exists. Phase 58 landed canvas step execution and fork/join execution in the task executor. However, the task PATCH API (`/api/tasks/[id]/route.ts`) does NOT yet accept the v15 fields (`execution_mode`, `schedule_config`, `execution_count`) -- its allowedFields array is limited to `['name', 'description', 'expected_output', 'linked_projects', 'status']`. This must be extended.

**Primary recommendation:** Rewrite `/tasks/new/page.tsx` as a vertical cascade with section-level state management. Reuse existing `SortableStepCard` pattern for agent/checkpoint/merge steps. Add canvas/fork step types with new sub-components. Extend task PATCH API to accept v15 fields. Add i18n keys for all new UI text.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WIZD-01 | Vertical cascade wizard with 5 sections revealing sequentially | Replace horizontal stepper in `/tasks/new/page.tsx`; use custom section expand/collapse pattern |
| WIZD-02 | Completed sections collapse to one-line summary; can reopen | Implement with local state tracking `expandedSection` and `completedSections` |
| WIZD-03 | Pipeline "+" button dropdown: Agente, Canvas, Checkpoint, Merge, Fork | Extend existing `AddStepButton` component which already handles agent/checkpoint/merge |
| WIZD-04 | Canvas selection via Sheet panel with search | Sheet component exists at `components/ui/sheet.tsx`; canvas list API at `GET /api/canvas` |
| WIZD-05 | "Crear nuevo canvas" navigates to `/canvas/new?from_task={taskId}&step_index={n}` | Canvas creation API at `POST /api/canvas`; return URL handling needed |
| WIZD-06 | Canvas step shows name, node count, last execution, link | Canvas list API returns `name`, `node_count`, `updated_at`; need to fetch per-canvas data |
| WIZD-07 | Fork shows inline configurator: branch count (2/3), editable labels | New UI component; writes `fork_group`, `branch_index`, `branch_label` to task_steps |
| WIZD-08 | Fork displays as visual parallel columns with per-branch "+" and Join | New visual layout component; conceptually a sub-pipeline per branch |
| WIZD-09 | Section 4 "Ciclo" with radio: Unico, Variable (spinner 2-100), Programado | RadioGroup component exists; maps to `execution_mode` + `execution_count` fields |
| WIZD-10 | Programado: time picker, day selector, optional date range | Maps to `schedule_config` JSON field; native HTML time input + custom day selector |
| WIZD-11 | Real-time "Proxima ejecucion calculada" preview | Pure client-side calculation from schedule config; no API needed |
| WIZD-12 | Section 5 "Revisar y Lanzar" full config summary | Extends existing step 4 review section with execution cycle info |
| WIZD-13 | "Guardar borrador" activates schedule without execution | Must create task + steps + schedule_config via API, set status to 'ready' |
| WIZD-14 | "Lanzar ahora" activates schedule AND executes immediately | Same as WIZD-13 but also calls `POST /api/tasks/{id}/execute` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18 | UI framework | Already used throughout |
| next-intl | ^3.26.5 | i18n | Already used for all translations |
| @dnd-kit/core | ^6.3.1 | Drag and drop | Already used in pipeline step reordering |
| @dnd-kit/sortable | ^10.0.0 | Sortable lists | Already used in pipeline builder |
| lucide-react | ^0.577.0 | Icons | Already used throughout |
| sonner | (installed) | Toasts | Already used for notifications |
| @base-ui/react | ^1.2.0 | Headless UI primitives | Already used by shadcn/ui sheet, radio, dialog |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui Sheet | installed | Canvas selector side panel | WIZD-04 canvas picker |
| shadcn/ui RadioGroup | installed | Execution mode selector | WIZD-09 Unico/Variable/Programado |
| shadcn/ui Select | installed | Various dropdowns | Agent selection, day selector |
| shadcn/ui Input | installed | Text fields | Name, labels, time picker |
| shadcn/ui Badge | installed | Status badges | Step type indicators |

### Not Needed / Avoid
| Component | Why Not |
|-----------|---------|
| Accordion (shadcn) | Cascade sections need custom expand/collapse logic with summary rendering; a plain div + state toggle is simpler and matches existing patterns |
| Collapsible (shadcn) | Same reason -- custom section component is more appropriate |
| react-hook-form / zod | Current wizard uses plain useState; keep consistent |

## Architecture Patterns

### Recommended Component Structure
```
app/src/
  app/tasks/new/page.tsx           # Rewrite: CascadeWizard replaces WizardContent
  components/tasks/
    cascade-section.tsx            # Generic collapsible section with summary
    objetivo-section.tsx           # Section 1: task name/description
    catbrains-section.tsx          # Section 2: CatBrains selector
    pipeline-section.tsx           # Section 3: pipeline builder (heaviest)
    pipeline-step-card.tsx         # Refactored from SortableStepCard
    canvas-step-config.tsx         # Canvas step type configuration
    canvas-picker-sheet.tsx        # Sheet panel for canvas selection (WIZD-04)
    fork-step-config.tsx           # Fork configurator + visual columns
    ciclo-section.tsx              # Section 4: execution cycle
    schedule-configurator.tsx      # Programado sub-form
    next-execution-preview.tsx     # Real-time schedule preview
    revisar-section.tsx            # Section 5: review and launch
```

### Pattern 1: Cascade Section Component
**What:** A reusable wrapper for each wizard section that handles expand/collapse, sequential reveal, and summary display.
**When to use:** All 5 sections use this pattern.
**Example:**
```typescript
interface CascadeSectionProps {
  index: number;
  title: string;
  isCompleted: boolean;
  isActive: boolean;
  isLocked: boolean;     // sections after current are locked
  summary: string;       // one-line summary when collapsed
  onToggle: () => void;
  children: React.ReactNode;
}

function CascadeSection({ index, title, isCompleted, isActive, isLocked, summary, onToggle, children }: CascadeSectionProps) {
  const isExpanded = isActive || (isCompleted && /* user clicked to reopen */);
  return (
    <div className={`border rounded-lg ${isActive ? 'border-violet-500/40' : 'border-zinc-800'}`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={onToggle}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium ${
          isCompleted ? 'bg-emerald-500/20 text-emerald-400' :
          isActive ? 'bg-violet-500 text-white' :
          'bg-zinc-800 text-zinc-500'
        }`}>
          {isCompleted ? <Check className="w-4 h-4" /> : index + 1}
        </div>
        <span className="text-sm font-medium text-zinc-200">{title}</span>
        {isCompleted && !isExpanded && (
          <span className="text-xs text-zinc-500 ml-auto">{summary}</span>
        )}
        <ChevronDown className={`w-4 h-4 text-zinc-500 ml-auto transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </div>
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-zinc-800">
          {children}
        </div>
      )}
    </div>
  );
}
```

### Pattern 2: Fork Visual Layout
**What:** Fork steps display as parallel columns within the pipeline.
**When to use:** When user adds a Fork step type.
**Example:**
```
  [Previous Step]
       |
  [--- Fork ---]
  |      |      |
  [A]   [B]   [C]    <-- each column has its own "+" button
  [+]   [+]   [+]
  |      |      |
  [--- Join ---]
       |
  [Next Step]
```
The fork is stored as multiple task_steps sharing the same `fork_group` UUID, with `branch_index` differentiating branches. The Fork step itself has `type: 'fork'`, each branch step has the fork_group + branch_index, and the Join step has `type: 'join'` with the same fork_group.

### Pattern 3: State Management
**What:** All wizard state lives in the parent CascadeWizard component, passed down to sections.
**When to use:** Matches the existing pattern where WizardContent holds all state.
**Key state shape:**
```typescript
// Section tracking
const [activeSection, setActiveSection] = useState(0);
const [completedSections, setCompletedSections] = useState<Set<number>>(new Set());

// Section 1: Objetivo (same as current step 1)
const [taskName, setTaskName] = useState('');
const [taskDescription, setTaskDescription] = useState('');
const [expectedOutput, setExpectedOutput] = useState('');

// Section 2: CatBrains (same as current step 2)
const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

// Section 3: Pipeline (extended from current step 3)
const [pipelineSteps, setPipelineSteps] = useState<WizardPipelineStep[]>([]);
// WizardPipelineStep extends PipelineStep with canvas_id, fork_group, branch_index, branch_label

// Section 4: Ciclo (NEW)
const [executionMode, setExecutionMode] = useState<'single' | 'variable' | 'scheduled'>('single');
const [executionCount, setExecutionCount] = useState(1);
const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig | null>(null);

// Section 5: computed from above
```

### Anti-Patterns to Avoid
- **Do NOT use useReducer or context:** The current wizard works fine with useState; adding complexity is unjustified for a single-page form.
- **Do NOT make sections independent components that fetch their own data:** Keep data fetching at the top level (matches existing pattern where WizardContent calls fetchInitialData).
- **Do NOT use the router for wizard navigation:** Sections are on a single page, not separate routes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop reordering | Custom drag handlers | @dnd-kit (already used) | Edge cases with touch, keyboard accessibility |
| Side panel overlay | Custom portal + backdrop | Sheet component (already exists) | Animation, z-index, scroll locking handled |
| Schedule next-run calculation | Custom date math | Simple function with Date API | Not complex enough for a library; just needs day-of-week + time matching |
| Toast notifications | Custom notification system | sonner (already used) | Already integrated throughout |

## Common Pitfalls

### Pitfall 1: Task PATCH API Missing v15 Fields
**What goes wrong:** The wizard tries to save `execution_mode`, `schedule_config`, etc. but the PATCH endpoint only allows `['name', 'description', 'expected_output', 'linked_projects', 'status']`.
**Why it happens:** Phase 57 added schema but no API updates.
**How to avoid:** Extend the `allowedFields` array in `/api/tasks/[id]/route.ts` to include: `execution_mode`, `execution_count`, `schedule_config`.
**Warning signs:** 400 error on save; "No se proporcionaron campos para actualizar" error.

### Pitfall 2: Task POST API Missing v15 Fields
**What goes wrong:** The POST endpoint (`/api/tasks/route.ts`) only inserts `name`, `description`, `expected_output`. New fields like `execution_mode` are not passed.
**Why it happens:** POST was written before v15 fields existed.
**How to avoid:** Extend the INSERT statement to include `execution_mode`, `execution_count`, `schedule_config`.

### Pitfall 3: Fork Step Ordering Complexity
**What goes wrong:** Fork branches create multiple steps that must maintain correct `order_index` values and share a `fork_group`.
**Why it happens:** Linear pipeline becomes branching. The API inserts steps one at a time with sequential order_index.
**How to avoid:** Generate all fork/branch/join steps client-side with correct order_index values, then POST them in sequence. The fork_group UUID ties them together.
**Warning signs:** Steps appearing in wrong order after save; branches mixed up.

### Pitfall 4: Canvas Return Flow (WIZD-05)
**What goes wrong:** User navigates away to `/canvas/new`, creates a canvas, but the wizard state is lost when they return.
**Why it happens:** Next.js App Router doesn't preserve component state across navigation.
**How to avoid:** Two approaches: (a) Save wizard draft to localStorage before navigating, restore on return; or (b) Open canvas creation in a new tab. Option (a) is more seamless. The `from_task` and `step_index` query params help identify the return context.
**Warning signs:** User creates canvas but returns to an empty wizard.

### Pitfall 5: Schedule Config JSON Structure
**What goes wrong:** schedule_config stored inconsistently or missing required fields.
**Why it happens:** JSON schema is not enforced at DB level.
**How to avoid:** Define a strict TypeScript interface:
```typescript
interface ScheduleConfig {
  time: string;        // "HH:MM" format
  days: 'always' | 'weekdays' | 'weekends' | 'custom';
  custom_days?: number[]; // 0-6 (Sunday-Saturday)
  start_date?: string;    // ISO date, optional
  end_date?: string;      // ISO date, optional
  is_active: boolean;
}
```
Validate before saving. The `schedule_config` column on tasks is TEXT (JSON string).

### Pitfall 6: i18n Key Namespace Collision
**What goes wrong:** New wizard keys conflict with existing `tasks.wizard.*` keys.
**Why it happens:** The existing wizard already uses `tasks.wizard.step1` through `tasks.wizard.step4`.
**How to avoid:** Restructure keys: keep existing keys for backward compatibility but add new ones like `tasks.wizard.section4` (Ciclo), `tasks.wizard.section5` (Revisar), `tasks.wizard.pipeline.canvas`, `tasks.wizard.pipeline.fork`, etc. The wizard step labels array changes from 4 to 5 items.

## Code Examples

### Existing Save Flow (reference for extending)
```typescript
// Source: /tasks/new/page.tsx lines 717-801
// Current: POST /api/tasks → POST /api/tasks/{id}/steps (loop) → PATCH linked_projects → POST execute
// New flow must also:
// 1. Include execution_mode, execution_count, schedule_config in POST or PATCH
// 2. For fork steps: POST fork step, then branch steps with fork_group, then join step
// 3. For canvas steps: POST step with canvas_id and type='canvas'
```

### Canvas List API Response Shape
```typescript
// Source: GET /api/canvas
// Returns: { id, name, emoji, description, mode, status, thumbnail, tags, is_template, node_count, created_at, updated_at }[]
// Filterable by: ?mode=agents|catbrains|mixed and ?status=idle|running|completed
```

### Task Steps POST with v15 Fields
```typescript
// Source: /api/tasks/[id]/steps/route.ts
// Already accepts: canvas_id, fork_group, branch_index, branch_label
// Already validates: canvas_id required for type='canvas', max 5 steps per branch
// Already shifts order_index when inserting at a position
```

### Next Execution Calculation (client-side)
```typescript
function calculateNextExecution(config: ScheduleConfig): Date | null {
  if (!config.time) return null;
  const [hours, minutes] = config.time.split(':').map(Number);
  const now = new Date();
  let next = new Date();
  next.setHours(hours, minutes, 0, 0);

  // If time has passed today, start from tomorrow
  if (next <= now) next.setDate(next.getDate() + 1);

  // Find next valid day
  const maxDays = 8;
  for (let i = 0; i < maxDays; i++) {
    const day = next.getDay();
    const isValid =
      config.days === 'always' ||
      (config.days === 'weekdays' && day >= 1 && day <= 5) ||
      (config.days === 'weekends' && (day === 0 || day === 6)) ||
      (config.days === 'custom' && config.custom_days?.includes(day));

    if (isValid) {
      // Check date range
      if (config.start_date && next < new Date(config.start_date)) {
        next.setDate(next.getDate() + 1);
        continue;
      }
      if (config.end_date && next > new Date(config.end_date)) return null;
      return next;
    }
    next.setDate(next.getDate() + 1);
  }
  return null;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Horizontal 4-step stepper | Vertical 5-section cascade | Phase 59 | Complete rewrite of `/tasks/new/page.tsx` |
| 3 step types (agent/checkpoint/merge) | 6 step types (+canvas/fork/join) | Phase 57 schema, Phase 59 UI | Pipeline builder needs new step type UI |
| Single execution only | Single/Variable/Scheduled | Phase 57 schema, Phase 59 UI | New section 4 + API extensions |
| `PipelineStep` local type | Extended with v15 fields | Phase 59 | Add canvas_id, fork_group, branch_index, branch_label to local type |

## API Gaps That Must Be Fixed

### 1. Task POST (`/api/tasks/route.ts`)
Current INSERT only includes: `id, name, description, expected_output`
Must add: `execution_mode`, `execution_count`, `schedule_config`

### 2. Task PATCH (`/api/tasks/[id]/route.ts`)
Current allowedFields: `['name', 'description', 'expected_output', 'linked_projects', 'status']`
Must add: `execution_mode`, `execution_count`, `schedule_config`

### 3. Task Schedules API (does not exist)
The `task_schedules` table exists from Phase 57 but there is no API to create/read/update schedules. WIZD-13 and WIZD-14 need to create schedule records.
**Option:** Either create a dedicated `/api/tasks/[id]/schedule` endpoint, or handle schedule creation inline within the task creation flow (create task_schedules row when saving a scheduled task).

## i18n Strategy

The project uses `next-intl` with JSON message files at `/messages/{es,en}.json`. The `tasks` namespace contains all wizard text under `tasks.wizard.*`. New keys needed:

- `tasks.wizard.steps` array: change from 4 to 5 items: ["Objetivo", "CatBrains", "Pipeline", "Ciclo", "Revisar"]
- `tasks.wizard.pipeline.canvas*`: Canvas step labels
- `tasks.wizard.pipeline.fork*`: Fork step labels
- `tasks.wizard.section4.*`: Ciclo de Ejecucion labels
- `tasks.wizard.section5.*`: Revisar y Lanzar labels (partially exists as step4)
- `tasks.stepTypes.canvas`, `tasks.stepTypes.fork`, `tasks.stepTypes.join`: New step type labels

Both `es.json` and `en.json` must be updated.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (e2e) + Vitest (unit) |
| Config file | `app/playwright.config.ts` + `app/vitest.config.ts` |
| Quick run command | `cd /home/deskmath/docflow/app && npx vitest run` |
| Full suite command | `cd /home/deskmath/docflow/app && npx playwright test e2e/specs/tasks.spec.ts` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WIZD-01 | 5 cascade sections visible | e2e | `npx playwright test e2e/specs/tasks.spec.ts` | Needs update |
| WIZD-02 | Section collapse/expand | e2e | same | Needs update |
| WIZD-03 | Pipeline "+" dropdown with 5 types | e2e | same | Needs update |
| WIZD-04 | Canvas Sheet opens with search | e2e | same | Needs update |
| WIZD-09 | Execution mode radio selection | e2e | same | Needs update |
| WIZD-11 | Next execution preview | unit | `npx vitest run` | Wave 0 |
| WIZD-13 | Save draft with schedule | e2e | same | Needs update |
| WIZD-14 | Launch with schedule | e2e | same | Needs update |

### Wave 0 Gaps
- [ ] `app/src/lib/schedule-utils.test.ts` -- unit test for next execution calculation (WIZD-11)
- [ ] Update `app/e2e/specs/tasks.spec.ts` -- existing "create task from wizard" test needs update for new cascade layout

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `/app/src/app/tasks/new/page.tsx` (~1100 lines, current wizard)
- Codebase inspection: `/app/src/app/api/tasks/route.ts`, `/api/tasks/[id]/route.ts` (task CRUD)
- Codebase inspection: `/app/src/app/api/tasks/[id]/steps/route.ts` (already accepts v15 fields)
- Codebase inspection: `/app/src/app/api/canvas/route.ts` (canvas list/create)
- Codebase inspection: `/app/src/lib/types.ts` (Task, TaskStep interfaces with v15 fields)
- Codebase inspection: `/app/src/lib/db.ts` (schema with v15 columns)
- Codebase inspection: `/app/src/components/ui/sheet.tsx` (Sheet component)
- Codebase inspection: `/app/src/components/ui/radio-group.tsx` (RadioGroup component)
- Codebase inspection: `/app/messages/es.json` (existing i18n structure)
- Phase 57 plan: `/.planning/phases/57-data-model-foundations/57-01-PLAN.md`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, no new dependencies needed
- Architecture: HIGH - clear existing patterns to follow and extend
- Pitfalls: HIGH - found concrete API gaps (PATCH/POST missing v15 fields) and state persistence issue for canvas navigation
- i18n: HIGH - clear pattern from existing implementation

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable -- no external dependency changes expected)
