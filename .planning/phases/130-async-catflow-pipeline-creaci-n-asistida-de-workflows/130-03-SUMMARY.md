---
phase: 130-async-catflow-pipeline-creaci-n-asistida-de-workflows
plan: 03
subsystem: catbot
tags: [catbot, intent-jobs, async-pipeline, canvas, flow-validation, architect]
requires:
  - 130-02 (IntentJobExecutor singleton + 3-phase state machine + architect_retry)
  - canvas-executor.ts (source of truth for valid node types)
provides:
  - canvas-flow-designer.ts module with VALID_NODE_TYPES const + validateFlowData helper + scanCanvasResources helper
  - CanvasResources typed interface reused by intent-job-executor
  - Architect output gate in finalizeDesign (rejects invalid flow_data BEFORE INSERT canvases)
  - Full needs_cat_paws pause path with persisted cat_paws_needed[] in progress_message
  - notifyUserCatPawApproval async stub (logs names) — Plan 04 Task 4 replaces body
affects:
  - app/src/lib/services/intent-job-executor.ts
tech_stack:
  added: []
  patterns:
    - "extract-and-delegate refactor (helpers live in their own module with a minimal DbLike interface, executor becomes a one-line passthrough)"
    - "validation gate BEFORE mutation (validateFlowData runs before INSERT canvases to avoid half-created state)"
    - "per-table try/catch in resource scan (one missing/broken table yields [] instead of failing the whole scan)"
    - "minimal structural-typed DbLike interface (so unit tests can pass a plain {prepare:vi.fn()} without mocking the whole better-sqlite3 module)"
key_files:
  created:
    - app/src/lib/services/canvas-flow-designer.ts
    - app/src/lib/__tests__/canvas-flow-designer.test.ts
  modified:
    - app/src/lib/services/intent-job-executor.ts
decisions:
  - "VALID_NODE_TYPES frozen as `as const` tuple to get literal-type union + runtime array in one declaration (CanvasNodeType derives from it)"
  - "validateFlowData accumulates errors instead of fail-fast so the architect phase can log ALL problems in one pass (useful for LLM prompt debugging)"
  - "scanCanvasResources uses per-table try/catch rather than one big outer try so a single missing table does not zero out every resource list (addresses the mocked-db test that throws only on the second prepare call)"
  - "validation gate placed AFTER the needs_cat_paws short-circuit: if the architect asks to pause for new CatPaws, its flow_data is expected to be empty/partial, so validation would be noise"
  - "DbLike interface kept as a local type alias (not exported) — external callers should pass the real better-sqlite3 Database which structurally satisfies it"
  - "notifyUserCatPawApproval bumped to async so finalizeDesign can await it without warnings; Plan 04 will swap the body for createNotification + Telegram inline keyboard without touching the call site"
  - "intent-job-executor scanResources() kept as a private static passthrough (instead of inlining scanCanvasResources(db) at each caller) so the class retains a stable test seam if Plan 04 needs to override it"
metrics:
  duration_minutes: 3
  completed_date: "2026-04-10"
  tasks_total: 2
  tasks_completed: 2
  tests_added: 12
  tests_passing: 20
requirements_covered:
  - PIPE-04 (fully for validation + pause persistence side — Plan 04 Task 4 still owns the resume trigger via approve_catpaw_creation)
---

# Phase 130 Plan 03: Canvas Flow Designer + Architect Output Validation Summary

Extracted resource-scanning and flow_data validation out of IntentJobExecutor into a standalone `canvas-flow-designer.ts` module, wired it back into the executor so the architect phase's output is validated BEFORE the canvas is inserted, and fleshed out the `needs_cat_paws` pause path so Plan 04 has a clean persisted state to resume from.

## What was built

### 1. `canvas-flow-designer.ts` (new, 117 lines)

Three exports, each with a single responsibility:

**`VALID_NODE_TYPES` (as-const tuple):** The nine canonical canvas node types matching the switch in `canvas-executor.ts` lines 461-600:

```
agent | catpaw | catbrain | condition | iterator | multiagent | scheduler | checkpoint | connector
```

Exported as both a runtime array (for `includes()` checks) and a derived type (`CanvasNodeType`) via `typeof VALID_NODE_TYPES[number]`.

**`validateFlowData(fd: unknown): { valid, errors }`:** Accumulates errors instead of fail-fast:

1. `fd` must be a non-null object; otherwise `valid: false, errors: ['flow_data is not an object']` and early return.
2. `fd.nodes` and `fd.edges` must both be arrays; if either missing, the function returns early with the structural error (no point validating deeper).
3. For each node: must have a string `id`, must have a `type` in `VALID_NODE_TYPES`. Invalid type emits `node {id} has invalid type {type}`.
4. For each edge: must have string `source` AND `target`; both must reference a node id that actually exists in the scanned set. Missing refs emit `edge source/target {id} does not reference an existing node`.

Accumulated errors mean the architect phase can log the full list of problems in a single LLM-debugging pass instead of just the first one.

**`scanCanvasResources(db: DbLike): CanvasResources`:** Replaces the inline scan from 130-02. Four tables (`cat_paws WHERE is_active=1`, `catbrains`, `skills`, `connectors`), each wrapped in its own try/catch via a `safe(sql)` helper so a single missing/broken table yields `[]` without zeroing out the other three. All four queries use `LIMIT 50` consistently (enforced by the test).

`DbLike` is a minimal structural interface (`{ prepare(sql: string): { all(...): unknown } }`) so unit tests pass a plain `{ prepare: vi.fn() }` without mocking the whole better-sqlite3 module. The real `better-sqlite3` `Database` instance structurally satisfies it.

### 2. `intent-job-executor.ts` wiring (modified)

Three surgical changes to the 385-line executor:

1. **Import added:** `validateFlowData`, `scanCanvasResources`, `type CanvasResources` from `./canvas-flow-designer`.
2. **`scanResources()` collapsed** from a 15-line inline scan with its own try/catch + logger.warn into a one-line delegate: `return scanCanvasResources(db);`. Kept as a private static method (not inlined at callers) so the class retains a test seam if Plan 04 needs to override it for canvas resource injection.
3. **`finalizeDesign()` gains a validation gate AFTER the needs_cat_paws short-circuit but BEFORE the INSERT INTO canvases call:**

```ts
const validation = validateFlowData(design.flow_data);
if (!validation.valid) {
  logger.error('intent-job-executor', 'Architect output invalid', {
    jobId: job.id,
    errors: validation.errors,
  });
  updateIntentJob(job.id, {
    status: 'failed',
    error: `Architect output invalid: ${validation.errors.join('; ')}`,
  });
  return;
}
```

Placement matters: the gate runs AFTER the `needs_cat_paws` short-circuit because when the architect asks to pause for new CatPaws, its `flow_data` is expected to be empty/partial and validation would just generate noise. Only the "proceed to canvas" branch needs the gate.

4. **`needs_cat_paws` branch enriched:** `progress_message` now carries the full `cat_paws_needed` array (unchanged from 130-02) plus a clearer pause message. `notifyUserCatPawApproval(job, design.needs_cat_paws)` is now `await`ed and bumped to async; its body logs the full list of CatPaw names alongside the count so operators tracing a pause can see exactly what the LLM wants to create. Plan 04 Task 4's `approve_catpaw_creation` tool will swap the stub body for a real `createNotification` + `TelegramBotService.sendMessageWithInlineKeyboard` call — the signature is stable so the call site will not change.

### 3. Test coverage

**`canvas-flow-designer.test.ts` (161 lines, 12 tests):**

- **VALID_NODE_TYPES (1):** asserts all 9 canonical types present and length exactly 9
- **validateFlowData (8):** valid happy path; `type='pipeline'` rejection with error containing `pipeline`; missing id; edge missing source/target; edge referencing non-existent node (`ghost`); missing nodes array; missing edges array; non-object inputs (null, string, number)
- **scanCanvasResources (3):** structure + data from happy-path mocked db; every prepared SQL contains `LIMIT 50`; per-table resilience — second `db.prepare` call throws but the first still yields data and the erroring table yields `[]`

All 12 tests pass, running in ~126ms.

**Regression check:** The existing `intent-job-executor.test.ts` (8 tests from Plan 02 covering happy/pause/resume/invariant/error/guard/orphan/fence-fallback) also runs green — no behavior changed for the paths that already had valid architect output or that paused for CatPaws.

## Verification

```
$ npx vitest run src/lib/__tests__/canvas-flow-designer.test.ts src/lib/__tests__/intent-job-executor.test.ts
Test Files  2 passed (2)
     Tests  20 passed (20)
```

```
$ npm run build
✓ Compiled successfully
✓ Linting and checking validity of types
```

Grep sanity checks:

- `grep -c "canvas-flow-designer" app/src/lib/services/intent-job-executor.ts` → **1** (single import block)
- `grep -c "validateFlowData" app/src/lib/services/intent-job-executor.ts` → **2** (import + call in finalizeDesign)
- `grep -c "scanCanvasResources" app/src/lib/services/intent-job-executor.ts` → **2** (import + delegate in scanResources)
- `grep -c "VALID_NODE_TYPES" app/src/lib/services/canvas-flow-designer.ts` → **3** (export const + type derivation + includes check)

## Deviations from Plan

None — plan executed exactly as written. Both tasks (RED test scaffold + GREEN module + integration) completed in order, verification passed, no rule-1/2/3 auto-fixes triggered, no architectural decisions required.

Minor interpretation choices (not deviations):

- **scanCanvasResources error handling granularity:** The plan said "try/catch por tabla (independiente)". Implemented via a single internal `safe(sql)` helper rather than four inline try/catches — DRYer and makes the four query lines readable as a single "what tables do we scan" declaration. Semantics identical: one failing table does not affect the other three, verified by the test that throws only on the second `prepare` call.
- **DbLike interface kept local (not exported):** The plan's `type DbLike = { prepare(sql: string): { all(...params: unknown[]): unknown[] } }` is implementation detail. Kept it unexported so consumers just pass a real `better-sqlite3` Database instance and the structural check happens at compile time without polluting the public API.
- **validateFlowData accumulates errors instead of fail-fast:** The plan did not specify the behavior explicitly. Chose accumulation because the architect phase will benefit from seeing every problem at once (better LLM debugging loop) rather than just the first one — tests verify this by asserting specific errors are present while not asserting the exact count.

## Commits

| Hash     | Task | Message                                                                 |
| -------- | ---- | ----------------------------------------------------------------------- |
| 2298a9c  | 1    | `test(130-03): add failing canvas-flow-designer tests (RED)`           |
| 2eb8e6f  | 2    | `feat(130-03): canvas-flow-designer module + architect output validation` |

## Requirements Coverage

- **PIPE-04 (fully on validation + pause side):** The plan-level requirement "Canvas Flow Designer valida node types, rechaza invalid, maneja needs_cat_paws pause con persistencia completa" is satisfied in both directions — `validateFlowData` rejects any node type outside the whitelist and rejects malformed edges, and the `needs_cat_paws` pause path persists the full list in `progress_message.cat_paws_needed` with `cat_paws_resolved: false`, primed for Plan 04 Task 4 (`approve_catpaw_creation`) to flip the phase back to `architect_retry`. The closing-the-loop side (the tool that creates the CatPaws + flips the phase + sends the real notification) remains owned by Plan 04.

## Oracle Verification (CatBot Protocol)

Code-complete. The CatBot oracle check for Phase 130 as a whole (asking CatBot to `queue_intent_job` a dummy async task, observe strategist → decomposer → architect transitions, intentionally trigger a `needs_cat_paws` pause with a prompt that references unknown tools, verify `list_my_jobs` surfaces the `awaiting_user` state) is deferred to the phase-level `checkpoint:human-verify` scheduled after Plan 05 — same pattern as Plans 01 and 02.

## Self-Check: PASSED

- `app/src/lib/services/canvas-flow-designer.ts` — FOUND (created, 117 lines, VALID_NODE_TYPES + validateFlowData + scanCanvasResources + CanvasResources type)
- `app/src/lib/__tests__/canvas-flow-designer.test.ts` — FOUND (created, 161 lines, 12 tests all green)
- `app/src/lib/services/intent-job-executor.ts` — FOUND (modified, scanResources delegates + finalizeDesign validation gate + needs_cat_paws enriched + notifyUserCatPawApproval async)
- Commit 2298a9c — FOUND (Task 1 RED)
- Commit 2eb8e6f — FOUND (Task 2 GREEN)
