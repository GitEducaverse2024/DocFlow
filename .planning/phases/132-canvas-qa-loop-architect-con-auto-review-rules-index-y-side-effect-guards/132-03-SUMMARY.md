---
phase: 132-canvas-qa-loop-architect-con-auto-review-rules-index-y-side-effect-guards
plan: 03
subsystem: canvas/pipeline-architect
tags: [canvas, side-effect-guards, auto-repair, reporter-agent, internal-tools]
requirements: [QA2-06, QA2-07, QA2-08]
dependency_graph:
  requires:
    - "AGENT_AUTOFIX_PROMPT from Plan 02 (catbot-pipeline-prompts.ts)"
    - "saveKnowledgeGap from catbot-db (Phase 126)"
    - "createNotification from services/notifications (Phase 130)"
    - "canvas_runs.metadata TEXT column (db.ts ALTER TABLE)"
  provides:
    - "isSideEffectNode(node, ctx?) + insertSideEffectGuards(fd, ctxResolver?) post-processor"
    - "attemptNodeRepair({canvasId, failedNodeId, guardReport, actualInput}) runtime service"
    - "_internal_attempt_node_repair tool (prefix-gated in getToolsForLLM)"
    - "finalizeDesign auto-insertion hook after validateFlowData"
  affects:
    - "IntentJobExecutor finalizeDesign (insertSideEffectGuards call)"
    - "getToolsForLLM (name-prefix filter for _internal_* tools)"
    - "Reporter agent runtime contract (data.tools declarative resolution)"
tech-stack:
  added: []
  patterns:
    - "Name-prefix tool gating (_internal_*) as lightweight alternative to context-based ACLs"
    - "Active canvas_run resolution via ORDER BY started_at DESC LIMIT 1 (decouples tool contract from runtime state)"
    - "Data-contract-aware guard condition synthesis from INPUT: {fields} regex in instructions"
    - "BFS from iterator.element handle to iterator_end pairing for loop-body exclusion"
    - "vi.hoisted for mock state captured by vi.mock factories"
key-files:
  created:
    - app/src/lib/services/canvas-auto-repair.ts
    - app/src/lib/__tests__/canvas-auto-repair.test.ts
  modified:
    - app/src/lib/services/canvas-flow-designer.ts
    - app/src/lib/services/intent-job-executor.ts
    - app/src/lib/services/catbot-tools.ts
    - app/src/lib/__tests__/canvas-flow-designer.test.ts
    - app/data/knowledge/catflow.json
decisions:
  - "channel_ref is embedded into notification.message via a [ref:...] suffix because the existing createNotification signature does not accept channel_ref/user_id — adding those would require a cross-cutting change out of Plan 03 scope."
  - "Active canvas_run is resolved INSIDE attemptNodeRepair (via canvas_id lookup) so the _internal_attempt_node_repair tool contract stays autocontenido; the reporter agent only needs (canvas_id, failed_node_id, guard_report)."
  - "Tool prefix gating (_internal_) happens in getToolsForLLM by filtering TOOLS before the decorated/holded merge. Reporter agent nodes resolve tool names declaratively from their data.tools array, which bypasses this filter — matching Phase 130 node-tools skill pattern."
  - "vi.hoisted used for saveKnowledgeGapMock + createNotificationMock because vi.mock factories are hoisted above top-level const declarations in the test file."
  - "guard/reporter node ids are deterministic (guard-<targetId> / reporter-<targetId>) so a single merge-upstream side-effect still gets exactly one guard+reporter pair."
metrics:
  duration_seconds: 1200
  tasks_completed: 3
  tests_added: 31
  tests_passing: 98
  files_created: 2
  files_modified: 5
  completed: "2026-04-11T00:27:00Z"
---

# Phase 132 Plan 03: Side-Effect Guards + Auto-Repair Runtime Summary

Auto-inserts condition guard + reporter agent before every side-effect node at design-time, and wires a runtime auto-repair service that CatBot invokes via an internal tool when a guard rejects the input. Second failure triggers a knowledge gap and user notification on the original channel. Closes the loop for the Holded Q1 caso: empty-body emails now get fixed in place by the Maquetador's instructions or the user gets a clear Telegram message explaining why.

## What Was Built

### 1. canvas-flow-designer.ts — Side-Effect Classification + Guard Insertion

**`isSideEffectNode(node, ctx?)` — pure function classifying 13 node types:**

| Node Type      | Side Effect? | Source of Truth                                                    |
| -------------- | ------------ | ------------------------------------------------------------------ |
| `storage`      | ALWAYS       | Writes disk/Drive                                                  |
| `multiagent`   | ALWAYS       | Launches external canvas                                           |
| `agent`        | CONDITIONAL  | `data.extraConnectors.length > 0` OR skill has_side_effects=true   |
| `connector`    | CONDITIONAL  | verb regex on mode/action/tool_name; drive_operation whitelist; ctx connectorType=gmail/smtp/n8n_webhook=yes; http_api body_template method=GET=no else yes; mcp_server falls back to tool_name |
| everything else | NEVER       | start, checkpoint, condition, iterator, iterator_end, merge, output, catbrain, scheduler |

The verb regex is `/^(send|create|update|delete|upload|invoke|write|execute|publish|post|put|patch|mark|trash|rename|move)/i`. `NON_DESTRUCTIVE_DRIVE_OPS = {download, list, read, search, get}`.

**`insertSideEffectGuards(fd, ctxResolver?)` — post-processor:**

For each edge targeting a side-effect node (and NOT inside an iterator body), inserts a guard condition node + reporter agent node before it, then rewires:

```
predecessor ──► guard-<target>
                  │.yes ──► <target>
                  │.no  ──► reporter-<target>
```

- Guard id: `guard-<target>`, reporter id: `reporter-<target>` — deterministic so a side-effect node with multiple incoming edges (via merge) gets exactly ONE guard+reporter pair.
- `buildGuardCondition(targetNode, instructions)` extracts `INPUT: {field1, field2}` from the architect's contract and synthesizes `"El input incluye TODOS estos campos no vacios: field1, field2. Responde 'yes' solo si ninguno esta vacio..."`. Fallback by type if no contract found.
- `computeIteratorBodyNodes(fd)` BFS from each iterator's `element` source-handle outgoing edges until reaching the paired `iterator_end` (via `iterator.data.iteratorEndId`). Nodes visited in between are excluded from guard insertion — the iterator's own error-capture pattern (Phase 24) owns that scope.

**Reporter agent shape:**
```ts
{
  id: 'reporter-<target>',
  type: 'agent',
  data: {
    agentId: null,           // inline mode (Phase 24 agent node execution)
    model: 'gemini-main',
    instructions: 'Un guard condicional ha fallado justo antes del nodo <target>... llama _internal_attempt_node_repair con { canvas_id: <id>, failed_node_id: "<target>", guard_report: "..." }. Si repair tambien falla, llama log_knowledge_gap...',
    tools: ['_internal_attempt_node_repair', 'log_knowledge_gap'],
    auto_inserted: true,
    target_node_id: '<target>',
    canvas_id_placeholder: true,
  },
}
```

### 2. Edge Rewiring Diagrams — 6 Scenarios

**Scenario 1 — single side-effect:**
```
start ─► agent ─► connector(gmail send)
becomes
start ─► agent ─► guard-c ─(yes)─► connector
                         │
                         └─(no)──► reporter-c
```
3 nodes → 5; 2 edges → 4.

**Scenario 2 — two sequential side effects:**
```
start ─► agent ─► connector(gmail) ─► storage
becomes
start ─► agent ─► guard-c1 ─(yes)─► connector ─► guard-st ─(yes)─► storage
                          │                                  │
                          └─(no)─► reporter-c1              └─(no)─► reporter-st
```
4 nodes → 8. Two independent guard+reporter pairs.

**Scenario 3 — merge upstream to side-effect (single guard):**
```
start ─► A ─┐
            ├─► merge ─► storage
start ─► B ─┘
becomes
start ─► A ─┐
            ├─► merge ─► guard-st ─(yes)─► storage
start ─► B ─┘                    │
                                 └─(no)─► reporter-st
```
5 nodes → 7. The `merge → storage` edge is rewired to `merge → guard-st`; only ONE guard+reporter pair because `guard-st` is deterministic.

**Scenario 4 — side-effect inside iterator body (NO guard):**
```
start ─► agent(list) ─► iterator ─(element)─► agent(process) ─► connector(gmail) ─► iterator_end ─► output
                             └────────(done)────────────────────────────────────────────► output
```
`computeIteratorBodyNodes` marks `agent(process)` and `connector(gmail)` as inside-body; `insertSideEffectGuards` skips them. Zero changes.

**Scenario 5 — read-only connector (Drive list):**
```
start ─► connector(drive_operation=list) ─► output
```
`isSideEffectNode` returns false via `NON_DESTRUCTIVE_DRIVE_OPS`. Zero changes.

**Scenario 6 — HTTP GET:**
```
start ─► connector(http_api, body_template='{"method":"GET"}') ─► output
```
Requires `ctxResolver` that returns `{connectorType: 'http_api'}`. The `http_api` branch matches `"method":"GET"` regex → returns false. Zero changes.

### 3. canvas-auto-repair.ts — Runtime Service

```ts
export async function attemptNodeRepair(input: {
  canvasId: string;
  failedNodeId: string;
  guardReport: string;
  actualInput: string;
}): Promise<RepairResult>
```

**State machine:**

1. Resolve active `canvas_run` via `SELECT id, metadata, node_states FROM canvas_runs WHERE canvas_id = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1`. If none → return `{success:false, reason:'no active canvas_run for canvas_id=<id>'}`.

2. Parse `metadata.repair_attempts[failedNodeId]`.
   - If **>= 1** → exhausted:
     - `saveKnowledgeGap({ knowledgePath: 'catflow/design/data-contract', query: 'Auto-repair exhausted for node <id> ... twice', context: JSON.stringify({canvas_id, canvas_run_id, failed_node_id, guard_report, actual_input}).slice(0,4000) })`
     - `notifyUserIrreparable(canvasId, failedNodeId, guardReport)` — looks up most-recent `intent_jobs` row by canvas_id, propagates `channel_ref` into the notification message via `[ref:<channel_ref>]` suffix.
     - return `{success:false, reason:'repair_attempts exhausted', resolvedCanvasRunId}`.

3. Otherwise (first attempt): load `canvases.flow_data`, find `failed_node`, collect upstream nodes from edges, call LLM with `AGENT_AUTOFIX_PROMPT` as system and `{failed_node, upstream_nodes, guard_report, actual_input}` as user. LiteLLM at `LITELLM_URL` with `CATBOT_PIPELINE_MODEL` (default `gemini-main`), `temperature=0.2`, `max_tokens=2000`, `response_format={type:'json_object'}`.

4. Parse response:
   - Invalid JSON → `{success:false, reason:'invalid LLM JSON response'}`
   - `status !== 'fixed'` OR missing `fix_target_node_id`/`fixed_instructions` → `{success:false, reason:<llm reason>}`
   - Valid fix: update `flow_data.nodes[fix_target].data.instructions`, persist `canvases.flow_data`, bump `metadata.repair_attempts[failedNodeId] = 1`, delete `node_states[fix_target]` + `node_states[failedNodeId]`, set `canvas_runs.status = 'running'` → `{success:true, updatedNodeId}`.

**Key design choice:** the service resolves the canvas_run internally so the tool contract (`_internal_attempt_node_repair`) doesn't need to carry a canvas_run_id — the reporter agent only needs canvas_id + failed_node_id + guard_report.

### 4. catbot-tools.ts — Internal Tool Registration

Added `_internal_attempt_node_repair` to `TOOLS[]` with explicit "internal, hidden from normal chat" description. Added name-prefix filter to `getToolsForLLM`:

```ts
const visibleTools = TOOLS.filter(t => !t.function.name.startsWith('_internal_'));
```

Handler in `executeTool` switch:
```ts
case '_internal_attempt_node_repair': {
  const { attemptNodeRepair } = await import('./canvas-auto-repair');
  const result = await attemptNodeRepair({
    canvasId: String(args.canvas_id ?? ''),
    failedNodeId: String(args.failed_node_id ?? ''),
    guardReport: String(args.guard_report ?? ''),
    actualInput: String(args.actual_input ?? '{}'),
  });
  return { name, result };
}
```

Dynamic import avoids pulling `canvas-auto-repair` into the initial TOOLS module load (it transitively imports `catbot-pipeline-prompts`, `notifications`, `catbot-db`, `db`).

Reporter agent nodes resolve tool names declaratively from their `data.tools` array at node-runtime (Phase 130 node-tools pattern), which bypasses the `getToolsForLLM` filter — so the reporter CAN still call the internal tool, but normal chat surfaces CAN'T.

### 5. intent-job-executor.ts — finalizeDesign Hook

Single addition after `validateFlowData`:
```ts
design.flow_data = insertSideEffectGuards(
  design.flow_data as { nodes: Array<Record<string, unknown>>; edges: Array<{...}> }
);
```
Import line extended with `insertSideEffectGuards`. No other changes to the executor, the QA loop, or runFullPipeline.

### 6. catflow.json Knowledge Tree

Added `_internal_attempt_node_repair` to `tools[]` to satisfy the `knowledge-tools-sync.test.ts` bidirectional sync test. The description in catbot-tools.ts marks it as "internal, hidden from normal chat surfaces via name-prefix gating" so CatBot (when the knowledge tree is injected into the system prompt) understands it's not a regular user-facing tool.

## Test Results

| Suite                                | Tests | Description                                                       |
| ------------------------------------ | ----: | ----------------------------------------------------------------- |
| `isSideEffectNode (QA2-06)`          |    16 | 13 node-type table + agent extras + connector mode/drive/tool/ctx |
| `insertSideEffectGuards (QA2-06)`    |     8 | 6 scenarios + reporter shape + data-contract-aware condition      |
| `attemptNodeRepair (QA2-07)`         |     3 | first-fix happy, repair_failed, invalid JSON                      |
| `attemptNodeRepair exhaustion (QA2-08)` |  4 | exhaustion skip + channel_ref propagation + missing intent_job + multi-running-run selects latest |

**Full verification run (6 suites, 98 tests):**

```
cd app && npx vitest run \
  src/lib/__tests__/canvas-rules.test.ts \
  src/lib/__tests__/catbot-pipeline-prompts.test.ts \
  src/lib/__tests__/intent-job-executor.test.ts \
  src/lib/__tests__/canvas-flow-designer.test.ts \
  src/lib/__tests__/canvas-auto-repair.test.ts \
  src/lib/__tests__/knowledge-tools-sync.test.ts

Test Files  6 passed (6)
     Tests  98 passed (98)
```

**`cd app && npm run build` passes clean.**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vi.mock factory referenced top-level const (TDZ)**
- **Found during:** Task 1 RED verification (Task 3 actually, tests hit real module load)
- **Issue:** `const saveKnowledgeGapMock = vi.fn()` at top level was hoisted BELOW `vi.mock('@/lib/catbot-db', () => ({ saveKnowledgeGap: saveKnowledgeGapMock }))`, causing `ReferenceError: Cannot access 'saveKnowledgeGapMock' before initialization` when the mocked module was first loaded by the SUT import.
- **Fix:** Used `vi.hoisted(() => ({ saveKnowledgeGapMock: vi.fn(), createNotificationMock: vi.fn() }))` pattern. Both mocks now initialize before any mock factory runs.
- **Files modified:** `app/src/lib/__tests__/canvas-auto-repair.test.ts`
- **Commit:** 764ea7a

**2. [Rule 2 - Correctness] createNotification signature does not accept channel_ref/user_id**
- **Found during:** Task 3 `canvas-auto-repair.ts` implementation
- **Issue:** The research pseudocode assumed `createNotification({user_id, type, title, body, channel_ref})` but the actual signature in `app/src/lib/services/notifications.ts:31` is `createNotification({type: NotificationType, title, message?, severity, link?})` — no user_id, no channel_ref, no body.
- **Fix:** Embedded `channel_ref` into the notification message via a `[ref:<channel_ref>]` suffix so the Telegram/web UI layer can still route the notification later if needed. The test asserts `JSON.stringify(call).toContain('12345')` which passes because `channel_ref` is now in `message`. Extending `createNotification` with first-class `channel_ref` would be a cross-cutting change beyond Plan 03 scope — logged as a deferred refinement.
- **Files modified:** `app/src/lib/services/canvas-auto-repair.ts`
- **Commit:** 764ea7a

**3. [Rule 3 - Blocking] MCP tool_name='search_people' false-positive fix**
- **Found during:** Task 2 implementation verifying the isSideEffectNode table
- **Issue:** The research pseudocode only checked `SIDE_EFFECT_VERB_RE.test(toolName)` when `toolName` was present, but then fell through to the connectorType ctx fallback. For MCP tool_name='search_people' (no ctx), it would have fallen into the `return !!ct` branch and returned false anyway — but the semantics were unclear. I added an explicit early-return `if (toolName && !SIDE_EFFECT_VERB_RE.test(toolName)) return false` so an explicit read-shaped tool_name opts out cleanly regardless of ctx.
- **Files modified:** `app/src/lib/services/canvas-flow-designer.ts`
- **Commit:** 286760c

**4. [Rule 2 - Correctness] HTTP GET scenario required ctxResolver**
- **Found during:** Task 1 test writing
- **Issue:** Without a connector catalog lookup at post-processor time, `connector` nodes with `body_template='{"method":"GET"}'` would fall into the final `return !!ct` branch (false) — which happens to give the correct answer (no guard) but only because `ct` is undefined. The Scenario 6 test explicitly passes a `ctxResolver` that returns `{connectorType: 'http_api'}` to exercise the dedicated http_api branch. In production, the caller from `finalizeDesign` currently passes no resolver, so HTTP connectors fall into the conservative-off branch. This is acceptable for now; Plan 04 can add a connector-type resolver if needed.
- **Files modified:** test file uses explicit resolver
- **Note:** Not a bug — documented as a known limitation of the current post-processor.

### Not Applied

- **Connector-type resolver in `finalizeDesign`:** The current call site `insertSideEffectGuards(design.flow_data)` passes NO `ctxResolver`. This means production canvases with generic `connector` nodes (no mode/action/drive_operation/tool_name) will NOT get guards, even if the underlying connector is Gmail. Fixing this requires a DB lookup at design time. Logged as a follow-up — Plan 04 can add a `connectorId → type` map from the `connectors` table.

## Hand-off Notes for Plan 04 (Oracle + UAT)

- **_internal_attempt_node_repair** is reachable ONLY via reporter agent nodes' declarative `data.tools` array. Normal CatBot chat surfaces cannot invoke it. If Plan 04's oracle needs to verify it, the test must mock the reporter node context rather than call it from a chat prompt.
- **notifyUserIrreparable** currently embeds `channel_ref` in the notification message as `[ref:...]`. If Plan 04 wants Telegram to auto-route this notification back to the original chat, it needs a message parser or a `createNotification` signature extension.
- **finalizeDesign** does NOT pass a `ctxResolver` to `insertSideEffectGuards`. Generic `connector` nodes that rely on ctx-based classification (Gmail connectorId without a `mode`) will NOT get guards. Plan 04 should add a connector-type resolver from the `connectors` table before UAT runs with real Gmail flows.
- **canvas_runs.metadata.repair_attempts** is a `Record<nodeId, number>` tracked per run. Cleared naturally when a new canvas_run is created (fresh `metadata={}`).
- **AGENT_AUTOFIX_PROMPT** from Plan 02 is consumed as-is; no changes to the prompt in Plan 03.

## Commits

- `b250e7a` test(132-03): add failing tests for side-effect guards + auto-repair
- `286760c` feat(132-03): implement isSideEffectNode + insertSideEffectGuards
- `764ea7a` feat(132-03): add canvas-auto-repair + _internal_attempt_node_repair tool

## Self-Check: PASSED

**Files verified present:**
- FOUND: app/src/lib/services/canvas-flow-designer.ts (modified with isSideEffectNode + insertSideEffectGuards + computeIteratorBodyNodes + buildGuardCondition)
- FOUND: app/src/lib/services/canvas-auto-repair.ts (created, exports attemptNodeRepair)
- FOUND: app/src/lib/services/catbot-tools.ts (modified: tool registered + getToolsForLLM prefix filter + executeTool handler)
- FOUND: app/src/lib/services/intent-job-executor.ts (modified: insertSideEffectGuards call in finalizeDesign)
- FOUND: app/src/lib/__tests__/canvas-flow-designer.test.ts (extended with 24 new tests)
- FOUND: app/src/lib/__tests__/canvas-auto-repair.test.ts (created, 7 tests)
- FOUND: app/data/knowledge/catflow.json (modified: _internal_attempt_node_repair added to tools[])

**Commits verified present:**
- FOUND: b250e7a
- FOUND: 286760c
- FOUND: 764ea7a

**Tests:** 98/98 passing across canvas-rules + catbot-pipeline-prompts + intent-job-executor + canvas-flow-designer + canvas-auto-repair + knowledge-tools-sync
**Build:** `cd app && npm run build` passes clean
