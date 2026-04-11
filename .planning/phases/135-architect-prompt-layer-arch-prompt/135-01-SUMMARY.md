---
phase: 135-architect-prompt-layer-arch-prompt
plan: 01
subsystem: canvas-flow-designer
tags: [arch-prompt, validator, role-taxonomy, tdd, phase-135]
requirements: [ARCH-PROMPT-10]
dependency_graph:
  requires:
    - VALID_NODE_TYPES (canvas-flow-designer.ts, Phase 133 FOUND-02)
  provides:
    - ROLE_TAXONOMY constant (7 roles) — consumed by plan 02 (architect prompt) and plan 03 (QA prompt)
    - validateCanvasDeterministic pure function — consumed by plan 03 as pre-LLM gate
    - ValidateCanvasInput / ValidateCanvasActiveSets / ValidateCanvasIssue / ValidateCanvasResult types
  affects:
    - plan 135-02 (will import ROLE_TAXONOMY into architect prompt)
    - plan 135-03 (will import both, build active sets from catbotDb, wire validator before LLM QA)
tech_stack:
  added: []
  patterns:
    - "TDD RED → GREEN (skeleton commit → implementation commit)"
    - "Pure function contract: no DB, no LLM, no side effects"
    - "DFS with color marking (WHITE/GRAY/BLACK) for cycle detection"
    - "QaReport drop-in shape: {ok:false, recommendation:'reject', issues:[{severity,rule_id,node_id,description}]}"
key_files:
  created: []
  modified:
    - app/src/lib/services/canvas-flow-designer.ts
    - app/src/lib/__tests__/canvas-flow-designer.test.ts
decisions:
  - "Validator lives in canvas-flow-designer.ts (not new file) to colocate with VALID_NODE_TYPES and avoid import cycles"
  - "agentId check also applies to multiagent nodes (not only agent) — canvas-executor treats multiagent as agent-group dispatch"
  - "DFS break-on-first-cycle: one cycle issue per canvas is enough signal for the architect retry loop"
  - "issues array never empty on ok:false — each failed check pushes exactly one issue with the offending node_id"
metrics:
  duration_min: 4
  tasks: 2
  files_touched: 2
  tests_added: 10
  completed: 2026-04-11
---

# Phase 135 Plan 01: Role Taxonomy and Validator Summary

**One-liner:** Deterministic pre-LLM canvas validator + shared 7-role taxonomy in canvas-flow-designer.ts, TDD-delivered with zero DB coupling — ready for plans 02/03 to consume.

## What shipped

1. **`ROLE_TAXONOMY`** — frozen 7-tuple `['extractor','transformer','synthesizer','renderer','emitter','guard','reporter']` exported from `canvas-flow-designer.ts`. Single source of truth for plans 02 (architect prompt) and 03 (QA prompt). `CanvasRole` type alias derived from the tuple.

2. **`validateCanvasDeterministic(input, active)`** — pure function that rejects a canvas BEFORE the QA LLM runs, checking in order:
   - `flow_data` shape (nodes[]/edges[] arrays)
   - Exactly one `start` node (rejects 0 and 2+)
   - Every `node.type` is in `VALID_NODE_TYPES` (reused, not duplicated — key_links pattern satisfied)
   - Every `agent`/`multiagent` node's `data.agentId` is in `active.activeCatPaws` (closes Phase 134 soft gap: architect fabricating `analista-financiero-ia` as slug)
   - Every `connector` node's `data.connectorId` is in `active.activeConnectors`
   - The edge graph is a DAG (DFS with color marking; break on first cycle)

   Rejection shape: `{ok:false, recommendation:'reject', issues: ValidateCanvasIssue[]}` — drop-in for plan 03's QaReport consumer path. Every issue is `{severity:'blocker', rule_id:'VALIDATOR', node_id, description}`.

3. **10 new unit tests** in `canvas-flow-designer.test.ts`:
   - ROLE_TAXONOMY shape + length
   - Happy path: minimal single-start canvas
   - Zero start rejection, two starts rejection
   - Invalid node type rejection (`llm_call`)
   - Unknown agentId rejection (holded-q1 regression: `analista-financiero-ia`)
   - Unknown connectorId rejection
   - Cycle detection (n1→n2→n3→n1)
   - 3-node DAG happy path with real uuids
   - QaReport drop-in shape invariant

## Task-by-task

### Task 1 — TDD RED (commit `e55f669`)
- Added `ROLE_TAXONOMY` export + 4 new types (`ValidateCanvasInput`, `ValidateCanvasActiveSets`, `ValidateCanvasIssue`, `ValidateCanvasResult`).
- Added `validateCanvasDeterministic` as SKELETON that always returns `{ok:true}`.
- Added the full test block (`describe('ROLE_TAXONOMY (ARCH-PROMPT-10)', ...)` + `describe('validateCanvasDeterministic (ARCH-PROMPT-10)', ...)`) with 10 tests.
- Ran vitest: **7 rejection tests FAILED** (skeleton says ok:true when they expect ok:false), **53 existing + ROLE_TAXONOMY + 2 happy-path tests PASSED**. RED pattern exactly as expected.

### Task 2 — TDD GREEN (commit `d450293`)
- Replaced skeleton body with real implementation: 5 checks in declared order, DFS cycle detector with color marking.
- Ran vitest: **60/60 GREEN** (53 existing + 7 previously-failing + ROLE_TAXONOMY constant). Zero regressions in the existing `validateFlowData`, `scanCanvasResources`, `isSideEffectNode`, `insertSideEffectGuards` suites.

No REFACTOR commit needed — implementation was already compact and readable.

## Verification evidence

```
Test Files  1 passed (1)
     Tests  60 passed (60)
```

- `grep "ROLE_TAXONOMY\|validateCanvasDeterministic" canvas-flow-designer.ts` → 6 occurrences (export + type + function + comments)
- `grep "catbotDb"` inside the validator → zero (only a comment in the header noting callers build active sets)
- `VALID_NODE_TYPES.includes` reuse → present at line ~152, satisfying key_links `pattern: "VALID_NODE_TYPES\\.includes"`

## Must-haves checklist

- [x] ROLE_TAXONOMY constant exports 7 roles in canonical order
- [x] `validateCanvasDeterministic(design, {activeCatPaws, activeConnectors})` returns `{ok:true}` or `{ok:false, recommendation:'reject', issues:[]}`
- [x] Rejects canvas with agentId not in activeCatPaws without LLM call
- [x] Rejects canvas with connectorId not in activeConnectors
- [x] Rejects canvas with cycle in edge graph
- [x] Rejects canvas with zero or 2+ start nodes
- [x] Rejects canvas with node.type not in VALID_NODE_TYPES
- [x] Returns ok:true for minimal DAG with exactly one start, all-valid types, all ids in active sets
- [x] `app/src/lib/services/canvas-flow-designer.ts` provides ROLE_TAXONOMY + validateCanvasDeterministic
- [x] `app/src/lib/__tests__/canvas-flow-designer.test.ts` provides 10 new unit tests (≥6 required)

## Deviations from Plan

None — plan executed exactly as written. Zero auto-fixes, zero out-of-scope issues discovered.

## Authentication gates

None.

## Commits

| Task | Phase  | Hash      | Message                                                                   |
| ---- | ------ | --------- | ------------------------------------------------------------------------- |
| 1    | RED    | `e55f669` | test(135-01): add failing tests for ROLE_TAXONOMY + validateCanvasDeterministic |
| 2    | GREEN  | `d450293` | feat(135-01): implement validateCanvasDeterministic (GREEN)               |

## Self-Check: PASSED

- FOUND: `app/src/lib/services/canvas-flow-designer.ts` (modified; ROLE_TAXONOMY + validateCanvasDeterministic present)
- FOUND: `app/src/lib/__tests__/canvas-flow-designer.test.ts` (modified; new describe blocks present)
- FOUND commit: `e55f669` (RED)
- FOUND commit: `d450293` (GREEN)
- 60/60 tests passing in canvas-flow-designer.test.ts
