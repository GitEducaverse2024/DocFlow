# Phase 67: MultiAgent Node + Templates - Research

**Researched:** 2026-03-22
**Domain:** Canvas node architecture, inter-CatFlow triggering, template seeding
**Confidence:** HIGH

## Summary

Phase 67 adds a MultiAgent node type to the canvas editor and 3 new seed templates. The MultiAgent node triggers other CatFlows (tasks with listen_mode=1) in sync or async mode, using the catflow_triggers infrastructure built in Phase 63. The project has a well-established pattern for adding nodes: component file, config panel form, executor case, NODE_TYPES registration, palette entry, and i18n keys. Storage Node (Phase 66) and Scheduler Node (Phase 65) are the most recent examples and provide the exact blueprint to follow.

The existing catflow triggers API (`POST /api/catflow-triggers`, `GET /api/catflow-triggers/[id]`, `GET /api/catflows/listening`) provides everything the executor needs. The sync mode will poll `GET /api/catflow-triggers/[id]` until status becomes completed/failed. The async mode creates the trigger and continues immediately. Templates are seeded in `db.ts` using the exact pattern of the 4 existing templates (INSERT OR IGNORE when table is empty).

**Primary recommendation:** Follow the Storage Node pattern exactly for component/config/palette/i18n, adapt the Scheduler's multi-handle pattern for output-response/output-error handles, and add a new `case 'multiagent'` in the executor's dispatchNode switch that calls the catflow-triggers API internally.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MA-01 | multiagent node type registered in canvas-editor NODE_TYPES and visible in palette under "Avanzado" | NODE_TYPES map in canvas-editor.tsx line 47, PALETTE_ITEMS array in node-palette.tsx line 16, MODE_ALLOWED_TYPES line 30 |
| MA-02 | MultiAgentNode component with purple-600 colors, input handle, output-response and output-error handles | SchedulerNode multi-handle pattern (lines 88-132), ConditionNode dual-handle pattern |
| MA-03 | Config panel selector loads only tasks with listen_mode=1 via GET /api/catflows/listening | API endpoint at app/src/app/api/catflows/listening/route.ts returns {id, name, description, status} |
| MA-04 | If no CatFlows are listening, panel shows clear warning message | Config panel pattern in node-config-panel.tsx, useEffect fetch on mount |
| MA-05 | Payload template with variable substitution ({input}, {context}, {run_id}) | resolveFilenameTemplate pattern in canvas-executor.ts lines 240-268 |
| MA-06 | Sync mode: creates trigger, polls until done, emits via output-response/output-error | POST /api/catflow-triggers creates trigger + launches target; GET /api/catflow-triggers/[id] for polling; CatFlowTrigger.status in types.ts |
| MA-07 | Async mode: creates trigger, continues immediately with trigger_id | Same POST endpoint, but return immediately with trigger_id as output |
| MA-08 | Timeout emits via output-error with descriptive message | Scheduler listen timeout pattern for reference |
| MA-09 | catflow_triggers record updated to completed/failed when target finishes | POST /api/catflow-triggers/[id]/complete endpoint exists; need to wire target completion to call this |
| TMPL-01 | 3 canvas templates seeded on startup (if table is empty) | Existing seed pattern in db.ts lines 1032-1146; canvas_templates table schema at line 1017 |
| TMPL-02 | Template "Pipeline Multi-Agente": start -> agent -> agent -> output | Follow existing template JSON format with nodes/edges arrays |
| TMPL-03 | Template "Flujo con Almacenamiento": start -> agent -> storage -> output | Storage node default data pattern in getDefaultNodeData line 121 |
| TMPL-04 | Template "Flujo Modular": start -> agent -> multiagent -> output/error with sourceHandle edges | MultiAgent node needs sourceHandle on edges like condition/scheduler nodes |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @xyflow/react | (installed) | Canvas node rendering, handles, edges | Already used for all canvas nodes |
| next-intl | (installed) | i18n translation keys | Already used project-wide |
| lucide-react | (installed) | Node icons | Already used for all node icons |
| better-sqlite3 | (installed) | Database for catflow_triggers, canvas_templates | Project's DB layer |

### No New Dependencies
This phase requires zero new libraries. Everything builds on existing infrastructure.

## Architecture Patterns

### Recommended File Structure
```
app/src/
  components/canvas/
    nodes/
      multiagent-node.tsx          # NEW: MultiAgentNode component
    canvas-editor.tsx              # MODIFY: add multiagent to NODE_TYPES + NODE_DIMENSIONS + getDefaultNodeData + getMiniMapNodeColor
    node-palette.tsx               # MODIFY: add multiagent to PALETTE_ITEMS + MODE_ALLOWED_TYPES
    node-config-panel.tsx          # MODIFY: add multiagent to NODE_TYPE_ICON + NODE_TYPE_LABEL_KEYS + formRenderers + renderMultiAgentForm
  lib/
    services/
      canvas-executor.ts           # MODIFY: add case 'multiagent' in dispatchNode + branch skipping logic
    db.ts                          # MODIFY: add 3 new seed templates to canvas_templates
  app/messages/
    es.json                        # MODIFY: add multiagent i18n keys
    en.json                        # MODIFY: add multiagent i18n keys
```

### Pattern 1: Node Component (follow StorageNode/SchedulerNode)
**What:** React component with @xyflow/react Handle components
**When to use:** Every canvas node
**Key details:**
- Import `Handle, Position, type NodeProps` from `@xyflow/react`
- Use `useTranslations('canvas')` for i18n
- Cast `data` to typed interface
- Extract `executionStatus` from data for visual feedback
- Multiple source handles need unique `id` props (like SchedulerNode: `output-true`, `output-completed`, `output-false`)
- For MultiAgent: `output-response` (green, top: 35%) and `output-error` (red, top: 65%)

```typescript
// Source: scheduler-node.tsx pattern
<Handle type="source" position={Position.Right} id="output-response"
  style={{ top: '35%', background: '#16a34a', width: 10, height: 10 }} />
<Handle type="source" position={Position.Right} id="output-error"
  style={{ top: '65%', background: '#dc2626', width: 10, height: 10 }} />
```

### Pattern 2: Config Panel Form (follow renderStorageForm)
**What:** Function inside node-config-panel.tsx returning JSX form
**When to use:** Every node's configuration UI
**Key details:**
- Fetch external data in the `useEffect` block (line 126-142) based on `selectedNode.type`
- For multiagent: fetch from `/api/catflows/listening`
- Add new state: `const [listeningCatflows, setListeningCatflows] = useState([])`
- Register in `formRenderers` object (line 672)
- Register icon in `NODE_TYPE_ICON` and label in `NODE_TYPE_LABEL_KEYS`

### Pattern 3: Executor Dispatch (follow case 'storage')
**What:** New case in dispatchNode switch statement
**When to use:** Every node type's execution logic
**Key details:**
- `dispatchNode` returns `Promise<{ output: string; tokens?; input_tokens?; output_tokens?; duration_ms? }>`
- For multiagent sync: make internal fetch to catflow-triggers API, poll until done
- For multiagent async: make internal fetch, return trigger_id immediately
- The `output` string is the chosen sourceHandle name for branch routing (like condition returns 'yes'/'no')
- For sync success: output = response data, handle = 'output-response'
- For sync failure/timeout: output = error message, handle = 'output-error'

**CRITICAL:** The multiagent executor MUST NOT use `fetch()` to call its own API routes (server-side calling client-facing API creates issues). Instead, it should directly use the DB operations that the API routes perform:
1. Insert into catflow_triggers table
2. Set external_input on target task
3. Call executeTaskWithCycles (imported from task-executor)
4. Poll the catflow_triggers table directly with db.prepare()

### Pattern 4: Branch Skipping (follow condition/scheduler)
**What:** After multiagent node completes, skip nodes on the non-chosen branch
**When to use:** Any node with multiple source handles
**Key details in canvas-executor.ts:**
```typescript
// After dispatchNode returns, around line 852:
if (node.type === 'multiagent') {
  const chosenBranch = result.output.startsWith('ERROR:') ? 'output-error' : 'output-response';
  const skippedNodeIds = getSkippedNodes(nodeId, chosenBranch, nodes, edges, nodeStates);
  for (const skippedId of skippedNodeIds) {
    nodeStates[skippedId] = { status: 'skipped' };
  }
}
```

### Pattern 5: Template Seeding (follow existing db.ts seeds)
**What:** INSERT OR IGNORE into canvas_templates when table is empty
**Key details:**
- Seeds run at db.ts module load time (runs on every server start)
- Check `SELECT COUNT(*) FROM canvas_templates` - only seed if 0
- Problem: existing check is `ctCount === 0`, so new templates won't be added if existing 4 templates are present
- Solution: Use `INSERT OR IGNORE` with unique IDs to add new templates even if table is not empty, OR change the seed block to insert individually with INSERT OR IGNORE regardless of count

### Anti-Patterns to Avoid
- **Never define NODE_TYPES inside component body** (causes remount storm - noted in canvas-editor.tsx line 46)
- **Never call own API routes from server-side executor** (use direct DB operations instead)
- **Never forget to add node to ALL registration points** (NODE_TYPES, NODE_DIMENSIONS, getDefaultNodeData, getMiniMapNodeColor, PALETTE_ITEMS, MODE_ALLOWED_TYPES, NODE_TYPE_ICON, NODE_TYPE_LABEL_KEYS, formRenderers)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CatFlow triggering | Custom trigger system | Existing catflow_triggers table + API | Phase 63 already built this |
| Task execution | Custom execution launcher | `executeTaskWithCycles` from task-executor | Already handles all task types |
| Branch skipping | Custom branch logic | `getSkippedNodes()` helper | Already handles N-branch nodes generically |
| Topo sort | Custom ordering | `topologicalSort()` | Already handles DAG ordering |
| Template storage | File-based templates | `canvas_templates` table in SQLite | Already exists with seed pattern |

## Common Pitfalls

### Pitfall 1: Sync Mode Polling in Executor Thread
**What goes wrong:** The executor runs in a single async function per canvas run. If sync mode polls indefinitely, it blocks the entire canvas execution.
**Why it happens:** The catflow_triggers POST endpoint fires executeTaskWithCycles as fire-and-forget, but the target may take minutes.
**How to avoid:** Implement a max timeout (configurable, e.g., 300 seconds default). Use a polling loop with `await new Promise(resolve => setTimeout(resolve, 2000))` between checks. The executor thread is already async so this is fine.
**Warning signs:** Canvas execution hangs indefinitely on multiagent node.

### Pitfall 2: Calling Own API Routes from Server
**What goes wrong:** Using `fetch('http://localhost:3500/api/catflow-triggers')` from within canvas-executor.ts may fail in Docker or during build.
**Why it happens:** Server-side code calling its own HTTP endpoints is fragile (wrong port, network issues, auth issues).
**How to avoid:** Directly perform DB operations and call `executeTaskWithCycles()` from the executor, bypassing the HTTP API layer entirely.

### Pitfall 3: Template Seeds Not Running on Existing Installs
**What goes wrong:** The current seed block only runs when `canvas_templates` table has 0 rows. Existing installs with 4 templates won't get new ones.
**How to avoid:** Add new templates with `INSERT OR IGNORE` using unique IDs outside the `if (ctCount === 0)` block, or add a separate seed block that runs `INSERT OR IGNORE` for each new template unconditionally.

### Pitfall 4: Missing sourceHandle on Template Edges
**What goes wrong:** The "Flujo Modular" template has a multiagent node with output-response/output-error handles. If edges don't include `sourceHandle`, React Flow won't connect to the correct handle.
**Why it happens:** Regular edges default to the single source handle. Multi-handle nodes need explicit sourceHandle.
**How to avoid:** Include `sourceHandle: 'output-response'` on edges from multiagent to success path.

### Pitfall 5: Forgetting Registration Points
**What goes wrong:** Node appears in palette but crashes, or doesn't render, or has wrong dimensions.
**Why it happens:** There are 10+ places a new node type must be registered.
**How to avoid:** Checklist:
1. `NODE_TYPES` in canvas-editor.tsx
2. `NODE_DIMENSIONS` in canvas-editor.tsx
3. `getDefaultNodeData` in canvas-editor.tsx
4. `getMiniMapNodeColor` in canvas-editor.tsx
5. `PALETTE_ITEMS` in node-palette.tsx
6. `MODE_ALLOWED_TYPES` in node-palette.tsx
7. `NODE_TYPE_ICON` in node-config-panel.tsx
8. `NODE_TYPE_LABEL_KEYS` in node-config-panel.tsx
9. `formRenderers` in node-config-panel.tsx
10. `case 'multiagent'` in canvas-executor.ts dispatchNode
11. Branch skipping block in canvas-executor.ts executeCanvas
12. i18n keys in es.json and en.json

## Code Examples

### MultiAgent Node Component Structure
```typescript
// Based on: scheduler-node.tsx + storage-node.tsx patterns
export function MultiAgentNode({ data, selected }: NodeProps) {
  const t = useTranslations('canvas');
  const nodeData = data as {
    label?: string;
    target_task_id?: string;
    target_task_name?: string;
    execution_mode?: 'sync' | 'async';
    payload_template?: string;
    timeout?: number;
  };
  // ... execution status handling identical to StorageNode
  // Purple color scheme: border-purple-600, bg-purple-950/80, text-purple-400
  // Input handle: left, background: '#9333ea'
  // Output-response handle: right top 35%, green #16a34a
  // Output-error handle: right bottom 65%, red #dc2626
}
```

### Executor Sync Mode Logic
```typescript
// Based on: catflow-triggers API + polling pattern
case 'multiagent': {
  const targetTaskId = data.target_task_id as string;
  const mode = (data.execution_mode as string) || 'sync';
  const payloadTemplate = (data.payload_template as string) || '{input}';
  const timeout = (data.timeout as number) || 300;

  // Resolve payload template
  const payload = payloadTemplate
    .replace(/\{input\}/g, predecessorOutput)
    .replace(/\{context\}/g, predecessorOutput)
    .replace(/\{run_id\}/g, runId);

  // Get source task from canvas
  const canvasRow = db.prepare('SELECT task_id FROM canvases WHERE id = ?').get(canvasId);
  const sourceTaskId = canvasRow?.task_id || canvasId;

  // Create trigger directly in DB
  const triggerId = generateId();
  db.prepare(`INSERT INTO catflow_triggers (id, source_task_id, source_run_id, source_node_id, target_task_id, payload, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`)
    .run(triggerId, sourceTaskId, runId, node.id, targetTaskId, payload);

  // Set external_input on target
  db.prepare('UPDATE tasks SET external_input = ? WHERE id = ?').run(payload, targetTaskId);

  // Update to running
  db.prepare("UPDATE catflow_triggers SET status = 'running' WHERE id = ?").run(triggerId);

  // Launch target (fire-and-forget for async, await for sync)
  const execPromise = executeTaskWithCycles(targetTaskId);

  if (mode === 'async') {
    execPromise.catch(() => {}); // fire-and-forget
    return { output: JSON.stringify({ trigger_id: triggerId, status: 'running' }) };
  }

  // Sync: poll until done
  const startTime = Date.now();
  const timeoutMs = timeout * 1000;
  while (true) {
    await new Promise(r => setTimeout(r, 2000));
    const trigger = db.prepare('SELECT status, response FROM catflow_triggers WHERE id = ?').get(triggerId);
    if (trigger?.status === 'completed') {
      return { output: trigger.response || 'Completed' };
    }
    if (trigger?.status === 'failed') {
      return { output: `ERROR: ${trigger.response || 'Target CatFlow failed'}` };
    }
    if (Date.now() - startTime > timeoutMs) {
      db.prepare("UPDATE catflow_triggers SET status = 'timeout' WHERE id = ?").run(triggerId);
      return { output: `ERROR: Timeout after ${timeout}s waiting for CatFlow response` };
    }
  }
}
```

### Default Node Data for MultiAgent
```typescript
// In getDefaultNodeData, canvas-editor.tsx
case 'multiagent': return {
  label: t('nodeDefaults.multiagent'),
  target_task_id: null,
  target_task_name: null,
  execution_mode: 'sync',
  payload_template: '{input}',
  timeout: 300,
};
```

### Template Seed Pattern
```typescript
// In db.ts, add after existing seed block or modify seed logic
seedTmpl.run(
  'tmpl-multiagent-pipeline',
  'Pipeline Multi-Agente',
  'Encadena multiples agentes con un nodo MultiAgent que dispara otro CatFlow.',
  '🔗',
  'advanced',
  'mixed',
  JSON.stringify([
    { id: 'tmpl-start-ma', type: 'start', position: { x: 0, y: 150 }, data: { label: 'Inicio', initialInput: '' } },
    { id: 'tmpl-agent-ma1', type: 'agent', position: { x: 250, y: 120 }, data: { label: 'Preparador', agentId: null, model: '', instructions: 'Prepara el input para el siguiente CatFlow.', useRag: false, skills: [] } },
    { id: 'tmpl-agent-ma2', type: 'agent', position: { x: 550, y: 120 }, data: { label: 'Procesador', agentId: null, model: '', instructions: 'Procesa y refina el resultado.', useRag: false, skills: [] } },
    { id: 'tmpl-output-ma', type: 'output', position: { x: 850, y: 155 }, data: { label: 'Resultado', outputName: 'Pipeline Result', format: 'markdown' } },
  ]),
  JSON.stringify([
    { id: 'tmpl-ema1', source: 'tmpl-start-ma', target: 'tmpl-agent-ma1' },
    { id: 'tmpl-ema2', source: 'tmpl-agent-ma1', target: 'tmpl-agent-ma2' },
    { id: 'tmpl-ema3', source: 'tmpl-agent-ma2', target: 'tmpl-output-ma' },
  ]),
  null,
  now
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single source handle per node | Multi-handle with sourceHandle routing | Phase 65 (Scheduler) | Enables branching patterns for condition/scheduler/multiagent |
| API-based inter-CatFlow | Direct DB + executeTaskWithCycles | Phase 63 | Server-side code should use DB directly, not HTTP |

## Critical Implementation Detail: MA-09 Wiring

**The catflow_triggers table has a `response` column and `status` field, but the existing `POST /api/catflow-triggers` endpoint does NOT automatically mark the trigger as completed when the target task finishes.** The target task is launched fire-and-forget.

For sync mode, the executor needs to detect completion. Options:
1. **Poll the trigger table** (trigger status stays 'running' until something marks it completed)
2. **Poll the task execution status** (check if target task's latest run is completed/failed)

The simplest approach: after `executeTaskWithCycles` resolves (for sync mode, we await it), mark the trigger as completed/failed based on the task's final status. For async mode, the trigger stays in 'running' state.

## Open Questions

1. **How does executeTaskWithCycles signal completion?**
   - What we know: It's imported from task-executor and called fire-and-forget by the triggers API
   - What's unclear: Whether it returns a promise that resolves with the task result
   - Recommendation: Check its return type; if it returns void, poll the tasks table for status change instead

2. **Canvas task_id linkage**
   - What we know: Canvas runs reference canvas_id, but catflow_triggers need source_task_id
   - What's unclear: Whether canvases table has a task_id foreign key
   - Recommendation: Check canvases table schema; may need to use canvas_id as source identifier

3. **Template seed idempotency for upgrades**
   - What we know: Current seed only runs when table has 0 rows
   - What's unclear: Whether users have manually deleted templates, changing the count
   - Recommendation: Use INSERT OR IGNORE with fixed IDs for new templates in a separate block

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (inferred from existing .test.ts files) |
| Config file | Needs investigation |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npm run build` (TypeScript + build validation) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MA-01 | multiagent in NODE_TYPES | build | `npm run build` | N/A (compile check) |
| MA-02 | Component renders with handles | manual | Visual inspection in canvas editor | N/A |
| MA-03 | Selector loads listening CatFlows | manual | Check dropdown populates from API | N/A |
| MA-06 | Sync mode creates trigger and polls | integration | Manual execution test | N/A |
| MA-07 | Async mode returns trigger_id | integration | Manual execution test | N/A |
| TMPL-01 | 3 templates seeded | smoke | Check canvas_templates table after startup | N/A |
| BUILD | TypeScript compiles | build | `npm run build` | N/A |

### Sampling Rate
- **Per task commit:** `npm run build` (catches TypeScript errors)
- **Per wave merge:** Full build + manual canvas editor test
- **Phase gate:** `npm run build` clean + manual verification of all 5 success criteria

### Wave 0 Gaps
- None critical -- existing build validation covers TypeScript correctness
- Manual testing covers UI/UX requirements (no E2E framework currently configured for canvas)

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of all referenced files
- `app/src/components/canvas/nodes/storage-node.tsx` - StorageNode component pattern
- `app/src/components/canvas/nodes/scheduler-node.tsx` - Multi-handle node pattern
- `app/src/components/canvas/canvas-editor.tsx` - NODE_TYPES, NODE_DIMENSIONS, getDefaultNodeData, getMiniMapNodeColor
- `app/src/components/canvas/node-palette.tsx` - PALETTE_ITEMS, MODE_ALLOWED_TYPES
- `app/src/components/canvas/node-config-panel.tsx` - NODE_TYPE_ICON, NODE_TYPE_LABEL_KEYS, formRenderers
- `app/src/lib/services/canvas-executor.ts` - dispatchNode, getSkippedNodes, executeCanvas
- `app/src/lib/db.ts` - canvas_templates table schema and seed pattern
- `app/src/app/api/catflow-triggers/route.ts` - POST trigger creation
- `app/src/app/api/catflow-triggers/[id]/route.ts` - GET trigger status
- `app/src/app/api/catflow-triggers/[id]/complete/route.ts` - POST trigger completion
- `app/src/app/api/catflows/listening/route.ts` - GET listening CatFlows
- `app/src/lib/types.ts` - CatFlowTrigger interface

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project, zero new deps
- Architecture: HIGH - direct analysis of existing node patterns, exact file paths and line numbers
- Pitfalls: HIGH - identified from actual code patterns and architectural constraints
- Templates: HIGH - existing seed mechanism fully analyzed

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable internal patterns)
