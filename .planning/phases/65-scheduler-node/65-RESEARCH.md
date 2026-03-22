# Phase 65: Scheduler Node - Research

**Researched:** 2026-03-22
**Domain:** Canvas node system (React Flow + server-side executor)
**Confidence:** HIGH

## Summary

The Scheduler Node adds flow-control timing to the DoCatFlow canvas editor. It requires a new React Flow node component with 3 output handles (TRUE, COMPLETADO, FALSE), a config panel supporting 3 modes (delay, count, listen), server-side executor logic with a new `getNextNodeIds` helper, and a signal API endpoint. The implementation follows well-established patterns already in the codebase -- the condition node and checkpoint node serve as direct templates for multi-handle routing and execution pausing respectively.

The main architectural challenge is SCHED-08: replacing the current linear topological-sort iteration with a `getNextNodeIds` helper that uses `sourceHandle` to route execution. Currently, the executor iterates all nodes in topological order, using `getSkippedNodes` to mark condition branches as skipped. The scheduler node needs the same pattern extended: after a scheduler node completes, the executor must determine which output handle was used and skip nodes on other branches.

**Primary recommendation:** Follow the condition-node pattern for multi-handle routing, the checkpoint-node pattern for execution pausing (listen mode), and add a new `case 'scheduler'` block in `dispatchNode` plus handle-aware skipping logic in `executeCanvas`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCHED-01 | scheduler node type registered in NODE_TYPES and visible in palette under "Control de flujo" | NODE_TYPES map in canvas-editor.tsx (line 45), PALETTE_ITEMS array in node-palette.tsx (line 16), MODE_ALLOWED_TYPES (line 28) |
| SCHED-02 | SchedulerNode component with amber-600 colors, 3 output handles | Condition node (condition-node.tsx) is the template for multi-handle nodes; checkpoint node uses amber color scheme |
| SCHED-03 | output-false handle visible only when schedule_type is 'listen' | Conditional rendering based on node data -- read `schedule_type` from data prop |
| SCHED-04 | Config panel supports 3 modes: delay, count, listen | node-config-panel.tsx formRenderers pattern (line 472); add `renderSchedulerForm` |
| SCHED-05 | Delay mode pauses execution for configured time, emits via output-true | `dispatchNode` in canvas-executor.ts -- add `case 'scheduler'` with `setTimeout`/`await` |
| SCHED-06 | Count mode cycles using canvas_run metadata | canvas_runs table has `metadata TEXT` column (db.ts line 201); store/read cycle counter there |
| SCHED-07 | Listen mode waits for signal via signal endpoint | Checkpoint pattern: set status='waiting', pause execution, resume on signal API call |
| SCHED-08 | getNextNodeIds helper extends sourceHandle routing for all nodes | Currently no such helper exists; executor uses topologicalSort + getSkippedNodes. New helper needed |
| SCHED-09 | POST /api/canvas/[id]/run/[runId]/signal endpoint | New API route; pattern matches existing checkpoint approve/reject routes |
| SCHED-10 | Node label updates dynamically based on mode | Node component reads `schedule_type`, `delay_value`, `delay_unit`, `count_value` from data |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @xyflow/react | (in use) | React Flow canvas + Handle components | Already used for all canvas nodes |
| next-intl | (in use) | i18n for node labels, config panel | Already used across all components |
| better-sqlite3 | (in use) | canvas_runs metadata storage | Already used for all DB operations |
| lucide-react | (in use) | Node icons (Timer/Clock for scheduler) | Already used for all node icons |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sonner | (in use) | Toast notifications on signal timeout | Already imported in canvas-editor |

## Architecture Patterns

### Recommended File Structure
```
app/src/
  components/canvas/
    nodes/
      scheduler-node.tsx          # SCHED-01, SCHED-02, SCHED-03, SCHED-10
    node-palette.tsx              # SCHED-01 (add entry + category)
    node-config-panel.tsx         # SCHED-04 (add renderSchedulerForm)
    canvas-editor.tsx             # SCHED-01 (add to NODE_TYPES, NODE_DIMENSIONS, getDefaultNodeData, getMiniMapNodeColor)
  lib/services/
    canvas-executor.ts            # SCHED-05, SCHED-06, SCHED-07, SCHED-08
  app/api/canvas/[id]/run/[runId]/
    signal/
      route.ts                    # SCHED-09
  messages/
    es.json                       # i18n keys for scheduler
    en.json                       # i18n keys for scheduler
```

### Pattern 1: Multi-Handle Node Component (from condition-node.tsx)
**What:** Node with multiple named source handles and conditional visibility
**When to use:** Any node that routes to different downstream paths based on execution result
**Example:**
```typescript
// Source: app/src/components/canvas/nodes/condition-node.tsx lines 50-76
// Condition node has 2 source handles: "yes" (green) and "no" (red)
// Each handle has an id prop, positioned at different vertical offsets
<Handle type="source" position={Position.Right} id="yes"
  style={{ top: '35%', background: '#16a34a', width: 10, height: 10 }} />
<Handle type="source" position={Position.Right} id="no"
  style={{ top: '65%', background: '#dc2626', width: 10, height: 10 }} />
```

For scheduler, use 3 handles:
- `output-true` (green, top: '25%')
- `output-completed` (blue, top: '50%')
- `output-false` (red, top: '75%') -- conditionally rendered when `schedule_type === 'listen'`

### Pattern 2: Execution Pausing (from checkpoint node)
**What:** Node that pauses the executor and waits for external input
**When to use:** Listen mode -- wait for signal API call
**Example:**
```typescript
// Source: canvas-executor.ts lines 610-619
// Checkpoint sets status='waiting', saves state, updates run to 'waiting', returns
if (node.type === 'checkpoint') {
  nodeStates[nodeId] = { ...nodeStates[nodeId], status: 'waiting', output: result.output };
  saveNodeStates(runId, nodeId, nodeStates);
  db.prepare("UPDATE canvas_runs SET status = 'waiting' WHERE id = ?").run(runId);
  runningExecutors.delete(runId);
  return; // Pause -- resume via approve/reject
}
```

### Pattern 3: Branch Skipping (from condition node)
**What:** After a multi-handle node executes, mark nodes on non-chosen branches as skipped
**When to use:** Scheduler output routing -- only one handle fires per execution
**Example:**
```typescript
// Source: canvas-executor.ts lines 623-629
if (node.type === 'condition') {
  const chosenBranch = result.output; // 'yes' or 'no'
  const skippedNodeIds = getSkippedNodes(nodeId, chosenBranch, nodes, edges, nodeStates);
  for (const skippedId of skippedNodeIds) {
    nodeStates[skippedId] = { status: 'skipped' };
  }
}
```

### Pattern 4: NODE_TYPES Registration
**What:** Adding a new node type to the canvas editor
**When to use:** Every new node type
**Example (changes needed in canvas-editor.tsx):**
```typescript
// 1. Import the component
import { SchedulerNode } from './nodes/scheduler-node';

// 2. Add to NODE_TYPES constant (line 45)
const NODE_TYPES = {
  // ...existing...
  scheduler: SchedulerNode,
} as const;

// 3. Add to NODE_DIMENSIONS (line 58)
scheduler: { width: 240, height: 130 },

// 4. Add to getDefaultNodeData (line 97)
case 'scheduler': return {
  label: t('nodeDefaults.scheduler'),
  schedule_type: 'delay',
  delay_value: 5,
  delay_unit: 'minutes',
  count_value: 3,
  listen_timeout: 300,
};

// 5. Add to getMiniMapNodeColor (line 112)
case 'scheduler': return '#d97706'; // amber
```

### Pattern 5: Config Panel Registration
**What:** Adding a config form for a new node type
**When to use:** Every new node type with configurable properties
**Example (changes needed in node-config-panel.tsx):**
```typescript
// 1. Add to NODE_TYPE_ICON
scheduler: { icon: <Timer className="w-4 h-4" />, color: 'text-amber-400' },

// 2. Add to NODE_TYPE_LABEL_KEYS
scheduler: 'nodes.scheduler',

// 3. Add renderSchedulerForm function
// 4. Add to formRenderers map
scheduler: renderSchedulerForm,
```

### Pattern 6: Palette with Category Separator
**What:** Node palette currently has a flat list. SCHED-01 requires "Control de flujo" category.
**When to use:** Grouping palette items by category
**Current structure:** PALETTE_ITEMS is a flat array of `{ type, icon, customIcon, color }`.
**Approach:** Add an optional `category` field to PaletteItem, render category headers between groups.

### Anti-Patterns to Avoid
- **Creating a separate getNextNodeIds that replaces topological sort:** The existing executor iterates in topological order. SCHED-08 says "extends sourceHandle routing for all nodes" -- this means generalizing `getSkippedNodes` to handle both condition and scheduler sourceHandle routing, NOT replacing the iteration model.
- **Using setInterval for delay mode:** Use `await new Promise(resolve => setTimeout(resolve, ms))` inside `dispatchNode` instead. The executor is already async.
- **Storing count state in node data:** Count mode cycles need persistent state across re-executions. Use `canvas_runs.metadata` column (already exists, TEXT type) to store `{ scheduler_counts: { [nodeId]: currentCycle } }`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-handle routing | Custom edge routing logic | Existing `getSkippedNodes` pattern extended | Already handles convergence points (merge nodes) |
| Execution pausing | Custom polling mechanism | Existing checkpoint pause/resume pattern | Battle-tested, handles edge cases |
| Signal API | Custom WebSocket system | HTTP POST endpoint + polling (existing pattern) | Matches how checkpoint approve/reject works |

**Key insight:** Every scheduler mode maps to an existing executor pattern: delay = simple async wait in dispatchNode, count = metadata + re-entry, listen = checkpoint-style pause + signal API resume.

## Common Pitfalls

### Pitfall 1: NODE_TYPES Inside Component Body
**What goes wrong:** React remounts all nodes on every render if NODE_TYPES is recreated
**Why it happens:** Putting the constant inside the component function creates new object identity each render
**How to avoid:** NODE_TYPES is already a module-level constant (line 44 comment: "NEVER inside component body"). Add `scheduler: SchedulerNode` there.
**Warning signs:** All nodes flash/reset when clicking anything

### Pitfall 2: Count Mode Re-entry Without Metadata
**What goes wrong:** Count mode needs to remember which cycle it's on across the same run
**Why it happens:** The executor processes each node once in topological order; no built-in loop
**How to avoid:** Store cycle counter in `canvas_runs.metadata`. On each scheduler node execution: read metadata, increment counter, if counter < target emit output-true AND re-queue predecessor chain, else emit output-completed.
**Warning signs:** Count mode always runs once and stops
**Design decision:** Count mode is the most complex. Two approaches:
  1. **Loop within dispatchNode:** The scheduler node's dispatchNode handler loops N times, re-executing predecessor nodes each cycle. Simpler but tightly coupled.
  2. **Metadata + re-entry:** Store cycle count in metadata, mark upstream nodes as pending, resume execution. More complex but consistent with checkpoint pattern.
  Recommendation: Approach 2 -- it's consistent with the existing pause/resume model and allows the frontend to show progress per cycle.

### Pitfall 3: sourceHandle Routing Only Works for Direct Edges
**What goes wrong:** `getSkippedNodes` currently only checks `e.sourceHandle !== chosenBranch` for condition nodes
**Why it happens:** The function is condition-specific (hardcoded `conditionNodeId` parameter)
**How to avoid:** SCHED-08 requires generalizing this. Rename/refactor to work with any multi-handle node type. The `chosenBranch` concept applies identically to scheduler output handles.
**Warning signs:** Scheduler routes to wrong downstream nodes

### Pitfall 4: Listen Mode Timeout Without Cleanup
**What goes wrong:** If no signal arrives and there's no timeout, the run hangs forever in 'waiting' status
**Why it happens:** Checkpoint nodes rely on human interaction (always comes); listen mode might never receive a signal
**How to avoid:** When entering waiting state for listen mode, store `listen_timeout` and `waiting_since` in metadata. The signal API or a polling check should compare elapsed time and auto-resolve with output-false on timeout.
**Warning signs:** Runs stuck in 'waiting' state indefinitely

### Pitfall 5: Dynamic Label Not Updating in Real-Time
**What goes wrong:** SCHED-10 requires label updates based on mode configuration
**Why it happens:** The node component receives data as props; if label is static it won't reflect mode changes
**How to avoid:** Compute display label in the component based on `schedule_type`, `delay_value`, `delay_unit`, `count_value`. Don't rely solely on `data.label`.
**Warning signs:** Label shows "Scheduler" even after configuring "delay 5 minutes"

## Code Examples

### Scheduler Node Component (SCHED-02, SCHED-03, SCHED-10)
```typescript
// Pattern derived from condition-node.tsx and checkpoint-node.tsx
"use client";
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Timer, Check, X, Clock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function SchedulerNode({ data, selected }: NodeProps) {
  const t = useTranslations('canvas');
  const nodeData = data as {
    label?: string;
    schedule_type?: 'delay' | 'count' | 'listen';
    delay_value?: number;
    delay_unit?: string;
    count_value?: number;
  };

  // Dynamic label (SCHED-10)
  const displayLabel = computeSchedulerLabel(nodeData, t);

  const isListen = nodeData.schedule_type === 'listen';

  // ... execution status styling (same pattern as condition-node) ...
  // Use amber-600 colors (SCHED-02)

  return (
    <div className="w-[240px] min-h-[100px] rounded-xl bg-amber-950/80 border-2 ...">
      <Handle type="target" position={Position.Left}
        style={{ background: '#d97706', width: 10, height: 10 }} />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Timer className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-sm font-semibold text-amber-100 truncate">{displayLabel}</span>
      </div>

      {/* Output handles */}
      <Handle type="source" position={Position.Right} id="output-true"
        style={{ top: isListen ? '25%' : '35%', background: '#16a34a', width: 10, height: 10 }} />

      <Handle type="source" position={Position.Right} id="output-completed"
        style={{ top: isListen ? '50%' : '65%', background: '#2563eb', width: 10, height: 10 }} />

      {/* FALSE handle -- only visible in listen mode (SCHED-03) */}
      {isListen && (
        <Handle type="source" position={Position.Right} id="output-false"
          style={{ top: '75%', background: '#dc2626', width: 10, height: 10 }} />
      )}
    </div>
  );
}
```

### Scheduler Executor Logic (SCHED-05, SCHED-06, SCHED-07)
```typescript
// In canvas-executor.ts dispatchNode switch
case 'scheduler': {
  const scheduleType = (data.schedule_type as string) || 'delay';

  if (scheduleType === 'delay') {
    // SCHED-05: pause for configured time
    const value = (data.delay_value as number) || 5;
    const unit = (data.delay_unit as string) || 'minutes';
    const ms = convertToMs(value, unit);
    await new Promise(resolve => setTimeout(resolve, ms));
    return { output: 'output-true' }; // Emit via output-true handle
  }

  if (scheduleType === 'count') {
    // SCHED-06: read cycle from metadata
    const run = db.prepare('SELECT metadata FROM canvas_runs WHERE id = ?').get(runId);
    const metadata = JSON.parse(run.metadata || '{}');
    const counts = metadata.scheduler_counts || {};
    const currentCycle = (counts[node.id] || 0) + 1;
    const targetCount = (data.count_value as number) || 3;

    // Update metadata
    counts[node.id] = currentCycle;
    metadata.scheduler_counts = counts;
    db.prepare('UPDATE canvas_runs SET metadata = ? WHERE id = ?')
      .run(JSON.stringify(metadata), runId);

    if (currentCycle >= targetCount) {
      return { output: 'output-completed' }; // All cycles done
    }
    return { output: 'output-true' }; // More cycles to go
  }

  if (scheduleType === 'listen') {
    // SCHED-07: pause execution, wait for signal
    // Similar to checkpoint -- return predecessor output, main loop handles 'waiting'
    return { output: predecessorOutput };
  }

  return { output: predecessorOutput };
}
```

### Signal API Endpoint (SCHED-09)
```typescript
// app/api/canvas/[id]/run/[runId]/signal/route.ts
// Pattern matches checkpoint approve/reject routes
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id, runId } = params;
  const { node_id, signal } = await req.json();

  // Load run, validate it's in 'waiting' status
  // Update nodeStates[node_id] to completed with output = signal ? 'output-true' : 'output-false'
  // Resume execution (same pattern as resumeAfterCheckpoint)
}
```

### getNextNodeIds Helper (SCHED-08)
```typescript
// Generalized helper that works for condition, scheduler, and simple nodes
function getNextNodeIds(
  nodeId: string,
  sourceHandle: string | null,
  edges: CanvasEdge[]
): string[] {
  if (sourceHandle) {
    // Multi-handle node: only follow edges from the chosen handle
    return edges
      .filter(e => e.source === nodeId && e.sourceHandle === sourceHandle)
      .map(e => e.target);
  }
  // Simple node: follow all outgoing edges
  return edges
    .filter(e => e.source === nodeId)
    .map(e => e.target);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Condition-only sourceHandle routing | Generalized sourceHandle routing (SCHED-08) | This phase | All multi-handle nodes use same pattern |
| No flow control nodes | Scheduler node for timing | This phase | Enables delay, repeat, and signal-based flows |

## Open Questions

1. **Count Mode Re-execution Strategy**
   - What we know: Count mode needs to cycle N times, running predecessor nodes each cycle
   - What's unclear: Should the entire upstream subgraph re-execute per cycle, or just the immediate predecessor? Should the run restart from the beginning or from the scheduler node?
   - Recommendation: Re-execute only the predecessor chain (nodes between the previous scheduler/start and this scheduler). Store cycle count in metadata. After each cycle, if not done, reset upstream nodes to 'pending' and re-run executeCanvas.

2. **Listen Mode Timeout Mechanism**
   - What we know: The signal API endpoint resumes execution. Timeout should emit output-false.
   - What's unclear: Who enforces the timeout? The executor pauses (returns). A background timer? The status polling endpoint?
   - Recommendation: Store `waiting_since` and `listen_timeout` in node state. The status polling endpoint checks elapsed time and auto-triggers timeout resolution if exceeded. This avoids needing a background timer process.

3. **Palette Category Rendering**
   - What we know: SCHED-01 requires "Control de flujo" category. Current palette is flat.
   - What's unclear: Should existing nodes (condition, checkpoint) also move under categories, or just scheduler?
   - Recommendation: Add category support to palette. Group scheduler (and optionally condition, checkpoint, merge) under "Control de flujo". This is a UI enhancement that doesn't affect functionality.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | app/vitest.config.ts |
| Quick run command | `cd app && npx vitest run --reporter=verbose` |
| Full suite command | `cd app && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHED-01 | Scheduler in NODE_TYPES and palette | unit | `cd app && npx vitest run src/components/canvas/__tests__/scheduler-registration.test.ts` | No - Wave 0 |
| SCHED-02 | SchedulerNode renders with amber colors and 3 handles | unit | `cd app && npx vitest run src/components/canvas/nodes/__tests__/scheduler-node.test.ts` | No - Wave 0 |
| SCHED-03 | output-false visible only in listen mode | unit | `cd app && npx vitest run src/components/canvas/nodes/__tests__/scheduler-node.test.ts` | No - Wave 0 |
| SCHED-05 | Delay mode pauses then emits output-true | unit | `cd app && npx vitest run src/lib/services/__tests__/canvas-executor-scheduler.test.ts` | No - Wave 0 |
| SCHED-06 | Count mode cycles with metadata | unit | `cd app && npx vitest run src/lib/services/__tests__/canvas-executor-scheduler.test.ts` | No - Wave 0 |
| SCHED-07 | Listen mode waits for signal | unit | `cd app && npx vitest run src/lib/services/__tests__/canvas-executor-scheduler.test.ts` | No - Wave 0 |
| SCHED-08 | getNextNodeIds routes by sourceHandle | unit | `cd app && npx vitest run src/lib/services/__tests__/canvas-executor-scheduler.test.ts` | No - Wave 0 |
| SCHED-09 | Signal API endpoint | integration | `cd app && npx vitest run src/app/api/canvas/__tests__/signal.test.ts` | No - Wave 0 |
| SCHED-10 | Dynamic label based on mode | unit | `cd app && npx vitest run src/components/canvas/nodes/__tests__/scheduler-node.test.ts` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd app && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd app && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `app/src/lib/services/__tests__/canvas-executor-scheduler.test.ts` -- covers SCHED-05, SCHED-06, SCHED-07, SCHED-08
- [ ] `app/src/components/canvas/nodes/__tests__/scheduler-node.test.ts` -- covers SCHED-02, SCHED-03, SCHED-10
- [ ] No test infrastructure setup needed -- vitest already configured

## Sources

### Primary (HIGH confidence)
- `app/src/components/canvas/canvas-editor.tsx` -- NODE_TYPES registration, getDefaultNodeData, NODE_DIMENSIONS patterns
- `app/src/components/canvas/nodes/condition-node.tsx` -- Multi-handle node component pattern (2 source handles with ids)
- `app/src/components/canvas/nodes/checkpoint-node.tsx` -- Amber color scheme, execution-pause pattern
- `app/src/components/canvas/node-palette.tsx` -- PALETTE_ITEMS, MODE_ALLOWED_TYPES
- `app/src/components/canvas/node-config-panel.tsx` -- formRenderers pattern, NODE_TYPE_ICON, NODE_TYPE_LABEL_KEYS
- `app/src/lib/services/canvas-executor.ts` -- dispatchNode, executeCanvas, getSkippedNodes, checkpoint pause/resume, NodeStates
- `app/src/lib/db.ts` -- canvas_runs schema (line 1003), metadata column (line 201)
- `app/src/app/api/canvas/[id]/execute/route.ts` -- Run creation pattern
- `app/src/app/api/canvas/[id]/run/[runId]/status/route.ts` -- Status polling pattern
- `app/messages/es.json` -- Existing i18n key structure for canvas namespace

### Secondary (MEDIUM confidence)
- `app/src/app/api/catflow-triggers/route.ts` -- Inter-CatFlow trigger pattern (relevant for understanding signal-based execution)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, patterns verified from source code
- Architecture: HIGH - Every pattern has a direct existing analogue in the codebase
- Pitfalls: HIGH - Derived from actual code analysis of executor behavior
- Count mode design: MEDIUM - Re-execution strategy has multiple valid approaches, recommendation based on existing checkpoint pattern

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable internal codebase)
