---
phase: 135-architect-prompt-layer-arch-prompt
plan: 03
subsystem: intent-job-executor + catbot-pipeline-prompts
tags: [arch-prompt, qa-role-aware, validator-gate, tdd, phase-135]
requirements:
  - ARCH-PROMPT-11
  - ARCH-PROMPT-12
  - ARCH-PROMPT-13
  - ARCH-PROMPT-14
dependency_graph:
  requires:
    - ROLE_TAXONOMY + validateCanvasDeterministic (canvas-flow-designer.ts, plan 135-01)
    - ARCHITECT_PROMPT v135 with data.role requirement (plan 135-02)
    - catbotDb cat_paws + connectors tables (Phase 132/133)
  provides:
    - CANVAS_QA_PROMPT v135 role-aware (R10 scoped to transformer/synthesizer)
    - Extended QaReport schema (instruction_quality_score, scope, node_role)
    - buildActiveSets private static (reads cat_paws/connectors WHERE is_active=1)
    - validateCanvasDeterministic wired as pre-LLM gate inside runArchitectQALoop
  affects:
    - Phase 136 end-to-end validation gate (runtime architect + reviewer now role-aware)
    - Token cost reduction on fabricated-slug canvases (no QA LLM call when validator rejects)
tech_stack:
  added: []
  patterns:
    - "TDD RED -> GREEN (failing tests first, implementation second) for both tasks"
    - "Prompt-as-code structural tests for CANVAS_QA_PROMPT v135 schema"
    - "Pre-LLM deterministic gate: validator runs between architect parse and QA callLLM"
    - "Synthetic QaReport drop-in on validator rejection (reuses decideQaOutcome)"
    - "Default test fixture spy for buildActiveSets in top-level beforeEach"
key_files:
  created: []
  modified:
    - app/src/lib/services/catbot-pipeline-prompts.ts
    - app/src/lib/services/intent-job-executor.ts
    - app/src/lib/__tests__/catbot-pipeline-prompts.test.ts
    - app/src/lib/__tests__/intent-job-executor.test.ts
decisions:
  - "CANVAS_QA_PROMPT v135 algorithm makes role-read step 1 (explicit) so the LLM treats R10-scope as a precondition, not an afterthought"
  - "buildActiveSets lives in intent-job-executor.ts (not canvas-flow-designer.ts) because the validator is a pure function and the active-sets construction is an I/O concern owned by the executor"
  - "Validator rejection synthesizes a QaReport with recommendation='reject' + data_contract_score=0 + universal-scoped blockers so decideQaOutcome (Phase 134 Plan 04 contract, unchanged) still returns 'revise' and the loop advances without LLM tokens"
  - "Validator failure path persists the synthetic qa_iter{N} JSON so FOUND-06 post-mortem still sees the rejection signal; this preserves the Phase 133 Plan 04 invariant across the new pre-LLM gate"
  - "Default buildActiveSets spy in top-level beforeEach covers all fixture ids — tests needing a narrower set (test d) override locally with mockReturnValue"
  - "Pre-existing fixtures (ARCH_V0_OK, ARCH_V1_OK, ARCHITECT_OK, ARCH_WITH_NODES, archV0/v1, archDraft/Expanded) updated to include a start node + valid agentId — Rule 3 deviation explicitly sanctioned by ARCH-PROMPT-14 ('existing 47 tests stay green; mocks updated where needed')"
  - "Synthesized issues use scope='universal' (not 'validator') so they match the new v135 schema without introducing a special-case scope string"
metrics:
  duration_min: 8
  tasks: 2
  files_touched: 4
  tests_added: 8
  completed: 2026-04-11
---

# Phase 135 Plan 03: QA Role-Aware and Validator Wiring Summary

**One-liner:** CANVAS_QA_PROMPT v135 is now role-aware with R10 scoped to transformer/synthesizer, the extended reviewer schema carries instruction_quality_score + per-issue scope/node_role, and validateCanvasDeterministic runs as a token-saving pre-LLM gate inside runArchitectQALoop — 4 new ARCH-PROMPT-13 tests green, 147/147 across the whole test triangle.

## What shipped

### 1. CANVAS_QA_PROMPT v135 (ARCH-PROMPT-11, ARCH-PROMPT-12)

Full rewrite of the reviewer prompt (catbot-pipeline-prompts.ts). New structure:

- **Principio rector:** "lee `data.role` ANTES de aplicar cualquier regla" — role read is now step 1 of the reviewer algorithm, not an afterthought.
- **Taxonomia inline:** 7 roles listed literally (extractor/transformer/synthesizer/renderer/emitter/guard/reporter) so the reviewer doesn't depend on having the architect prompt in context.
- **7-step algorithm:** (1) read role, reject if missing as `R_ROLE_MISSING` blocker; (2) terminal detection — emitter/reporter never receive R10; (3) scope-gated rule application; (4) **R10 scoped explicitly to `{transformer, synthesizer}`**; (5) R15/R02/SE01 scopes; (6) R13 universal data-chain check; (7) severity + scope + node_role emission per issue.
- **Triple scoring:** data_contract_score, instruction_quality_score (NEW), quality_score (legacy).
- **Output schema extension:** each issue now carries `{severity, scope, rule_id, node_id, node_role, description, fix_hint}`. Top-level `instruction_quality_score` added alongside existing `quality_score`/`data_contract_score`.
- **Anti-patterns DA01-DA04 block** kept as a universal-scope reminder (same pattern as ARCHITECT_PROMPT v135).
- **`{{RULES_INDEX}}` placeholder preserved** — intent-job-executor.ts line 432 still runs `CANVAS_QA_PROMPT.replace('{{RULES_INDEX}}', rulesIndex)` unchanged.
- **Phase 134 Plan 04 deterministic threshold preserved**: prompt still documents `data_contract_score >= 80 AND blockers === 0` as the accept rule and flags that the code owns the accept/revise decision, not the LLM.

### 2. QaReport type extended (ARCH-PROMPT-12)

Extended `interface QaReport` in intent-job-executor.ts with three new optional fields:
- `instruction_quality_score?: number` (top-level)
- `issues[].node_role?: string`
- `issues[].scope?: string`

Existing fields (`quality_score`, `data_contract_score`, `severity`, `rule_id`, `node_id`, `description`, `fix_hint`, `data_contract_analysis`, `recommendation`) unchanged. All 47 pre-existing intent-job-executor tests stayed green without touching their assertions — additive-optional extension as promised in the plan.

### 3. validateCanvasDeterministic wired as pre-LLM gate (ARCH-PROMPT-13)

In `runArchitectQALoop` (intent-job-executor.ts), inserted a new gate **between** the `needs_cat_paws` short-circuit and the QA `callLLM`:

1. `buildActiveSets()` reads `SELECT id FROM cat_paws WHERE is_active = 1` and `SELECT id FROM connectors WHERE is_active = 1` from catbotDb.
2. `validateCanvasDeterministic(flow_data, activeSets)` runs synchronously.
3. On `{ok: true}` → continue to QA callLLM as before.
4. On `{ok: false}` → synthesize a `QaReport`:
   - `quality_score: 0`, `data_contract_score: 0`
   - `issues: validation.issues.map(...)` with `severity: 'blocker'`, `scope: 'universal'`, original `rule_id` (`VALIDATOR`), `description`, and a generated `fix_hint`
   - `recommendation: 'reject'`
5. Persist the synthetic report as `qa_iter{0,1}` so FOUND-06 post-mortem still sees the rejection.
6. Emit the same `QA outcome (deterministic)` log line with `source: 'validator'` for observability.
7. `decideQaOutcome` returns `'revise'` (score 0, blockers > 0 → Phase 134 Plan 04 rule unchanged).
8. `previousDesign`/`previousQaReport` updated and loop `continue`s without calling the QA LLM.

Result: canvases with fabricated `agentId` slugs, unknown `connectorId`, cycles, missing `start` node, or invalid `type` are rejected deterministically and the architect sees the validator issues as feedback on the next iteration — saving 1 QA LLM call per invalid iteration.

### 4. New helper: buildActiveSets (ARCH-PROMPT-13)

Added as `private static` in intent-job-executor.ts:

```ts
private static buildActiveSets(): {
  activeCatPaws: Set<string>;
  activeConnectors: Set<string>;
}
```

Wraps both SQL reads in a single try/catch. On DB failure logs `buildActiveSets failed — validator will reject everything` and returns empty sets. Exposed via the same `as unknown as ...` trick already used for `decideQaOutcome`/`qaInternals` so tests can spy on it without breaking the `private` modifier.

### 5. 4 new tests in runArchitectQALoop — ARCH-PROMPT-13 (ARCH-PROMPT-13)

In `intent-job-executor.test.ts`, new describe block `runArchitectQALoop — ARCH-PROMPT-13 (role-aware + validator gate)`:

- **(a) emitter without R10 → no R10 issue, accept outcome**: architect returns a start+connector(emitter) canvas, QA returns accept, validator passes (active sets contain `conn-gmail`), `callLLM` called exactly 2 times, result is the canvas.
- **(b) transformer drops fields → R10 blocker → exhaustion**: architect returns a start+agent(transformer) canvas with instructions that drop fields, QA returns an R10 blocker with `node_role: 'transformer'` and `scope: 'transformer,synthesizer'`, loop exhausts after 4 calls, result null, persisted qa_iter0 has `issues[0].rule_id === 'R10'` and `issues[0].node_role === 'transformer'`.
- **(c) exhaustion → notifyProgress fires force=true with top-2 issue descriptions**: same as (b) but spies on notifyProgress and asserts an exhaustion call with `force === true` and `msg.includes('drops')` (from the blocker description). Reuses `extractTop2Issues` from Phase 133 FOUND-10 without modification.
- **(d) validator rejects ghost-slug → architect-only calls, zero QA calls**: architect returns a start+agent canvas with `agentId: 'ghost-slug'`, active set contains only `paw-real-uuid`. Assertion: `callSpy.mock.calls.length === 2` (both iterations only run architect, never QA). Persisted `qa_iter0` is the synthetic validator report with `recommendation: 'reject'` and at least one issue mentioning `ghost-slug`.

### 6. Fixture updates (ARCH-PROMPT-14)

Rule 3 deviation explicitly sanctioned by ARCH-PROMPT-14: updated 6 pre-existing fixtures so they pass the validator gate:

- `ARCH_V0_OK` / `ARCH_V1_OK`: now include a start node + agent node with `agentId: 'cp-test-1'`.
- `ARCHITECT_OK`: now includes a start node + agent(cp-1) + connector(conn-test-1) — and the test assertion about FOUND-07 last_flow_data node count updated from 2 to 3 (one inline assertion change).
- `ARCH_WITH_NODES` (inside FOUND-07 test): updated from 2 nodes to 3 nodes (start added).
- `archV0` / `archV1` (inside the "revise iter0 then accept iter1" persistence test): same update.
- `archDraft` / `archExpanded` (inside the "needs_rule_details expansion persists final output" persistence test): same update.
- `ARCH_NEEDS_RULE_DETAILS` / `ARCH_NEEDS_UNKNOWN_RULE`: start node + cp-test-1 agentId added.

Added default `vi.spyOn(..., 'buildActiveSets').mockReturnValue({activeCatPaws: new Set([...]), activeConnectors: new Set([...])})` in the top-level `beforeEach`. Covers all fixture ids in a single place. Tests needing a narrower active set (test d) override this with their own `mockReturnValue`.

All 47 pre-existing intent-job-executor tests stay green. Net tests: 51 (47 pre-existing + 4 new ARCH-PROMPT-13).

## Task-by-task

### Task 1 — CANVAS_QA_PROMPT rewrite + QaReport extension + prompt tests

**RED (commit `29a38f1`):**
- Added 4 new tests in `CANVAS_QA_PROMPT v135 (ARCH-PROMPT-11..12)` describe block.
- Ran vitest: 4 failed / 32 passed (36 total). RED confirmed.

**GREEN (commit `88fce4d`):**
- Rewrote `CANVAS_QA_PROMPT` in `catbot-pipeline-prompts.ts`.
- Extended `QaReport` interface in `intent-job-executor.ts` with `instruction_quality_score?`, `scope?`, `node_role?` (all optional).
- Ran both test files: 83/83 green (36 catbot-pipeline-prompts + 47 intent-job-executor). GREEN confirmed.

### Task 2 — validateCanvasDeterministic wiring + 4 new tests

**RED (commit `10eb78b`):**
- Added 4 new tests in `runArchitectQALoop — ARCH-PROMPT-13` describe block.
- Introduced 3 new architect fixtures (`ARCH_EMITTER_OK`, `ARCH_TRANSFORMER_DROPS`, `ARCH_WITH_GHOST_SLUG`) + 2 new QA fixtures (`QA_R10_BLOCKER`, `QA_ACCEPT_ROLEAWARE`).
- Ran vitest: 4 failed / 47 passed (51 total). RED confirmed (`buildActiveSets` does not exist yet).

**GREEN (commit `357c8b3`):**
- Added `validateCanvasDeterministic` + `ValidateCanvasResult` imports.
- Added `buildActiveSets` private static in intent-job-executor.ts.
- Wired the validator gate in `runArchitectQALoop` between the needs_cat_paws short-circuit and the QA callLLM.
- Updated 6 pre-existing fixtures (start node + valid agentId/connectorId) to pass the validator.
- Added default `buildActiveSets` spy in top-level `beforeEach` covering all fixture ids.
- Updated FOUND-07 node-count assertion from 2 to 3.
- Ran all three test files: 147/147 green (51 intent-job-executor + 36 catbot-pipeline-prompts + 60 canvas-flow-designer). GREEN confirmed.

## Verification evidence

```
 Test Files  3 passed (3)
      Tests  147 passed (147)
```

- `grep "validateCanvasDeterministic" intent-job-executor.ts` → 4 hits: import (line 42), call site inside loop (line 568/572/573)
- `grep "buildActiveSets" intent-job-executor.ts` → 3 hits: call site (line 568), method definition (line 892), error log (line 914)
- `grep "data.role" catbot-pipeline-prompts.ts` → multiple hits inside CANVAS_QA_PROMPT (algorithm step 1, IMPORTANTE section)
- `grep "R10" catbot-pipeline-prompts.ts` → hits inside CANVAS_QA_PROMPT scoped-to-transformer/synthesizer language
- needs_cat_paws short-circuit still present: lines 546-552 (unchanged, before validator gate)
- `decideQaOutcome` body unchanged (Phase 134 Plan 04 contract preserved)

## Must-haves checklist

- [x] CANVAS_QA_PROMPT instructs reviewer to read data.role from each node BEFORE applying any rule
- [x] CANVAS_QA_PROMPT says R10 applies ONLY to transformer/synthesizer and NEVER to terminal/emitter/guard/reporter nodes
- [x] CANVAS_QA_PROMPT output schema includes instruction_quality_score and each issue carries {severity, scope, rule_id, node_id, node_role, description, fix_hint}
- [x] runArchitectQALoop calls validateCanvasDeterministic with active catPaw/connector id sets from catbotDb BEFORE the QA LLM
- [x] Validator ok:false → synthetic QaReport with recommendation:'reject' feeds decideQaOutcome WITHOUT calling QA LLM
- [x] 4 new intent-job-executor tests pass: (a) emitter without R10, (b) transformer drops fields → R10 blocker → revise, (c) exhaustion notifyProgress top-2 issues spy, (d) validator rejects unknown agentId without LLM call
- [x] All existing catbot-pipeline-prompts and intent-job-executor tests stay green
- [x] `{{RULES_INDEX}}` placeholder preserved in CANVAS_QA_PROMPT
- [x] needs_cat_paws short-circuit path unchanged (fires BEFORE validator)
- [x] decideQaOutcome body unchanged (Phase 134 Plan 04 contract preserved)

## Deviations from Plan

**Rule 3 (blocking issues fix) — sanctioned by ARCH-PROMPT-14 (`Update existing mocks to the new reviewer schema`):**

- **Fixture start-node updates**: the plan text promised "No change should be needed" to existing fixtures because QaReport extension is additive-optional. That held for Task 1. But Task 2 (wiring the validator) surfaced a deeper incompatibility: the pre-existing fixtures never had start nodes, and the validator enforces `exactly one start node`. 6 fixtures updated (ARCH_V0_OK, ARCH_V1_OK, ARCHITECT_OK, ARCH_WITH_NODES, archV0/v1, archDraft/Expanded). One assertion tweaked (FOUND-07 last_flow_data node count 2 → 3). The plan explicitly names ARCH-PROMPT-14 as "update existing mocks to the new reviewer schema where needed" so this falls inside plan intent.
- **Default buildActiveSets spy in top-level beforeEach**: rather than spying inside every pre-existing test, added one default spy covering all fixture ids (`cp-1`, `cp-new`, `cp-test-1`, `paw-real-1`, `conn-test-1`, `conn-gmail`). Tests needing a narrower active set override it locally with `mockReturnValue`. Cleaner than 15+ repeated spy setups.

No architectural changes. No new DB tables. No touches to `canvas-executor.ts` or `decideQaOutcome`.

## Authentication gates

None.

## Commits

| Task | Phase | Hash      | Message                                                                                        |
| ---- | ----- | --------- | ---------------------------------------------------------------------------------------------- |
| 1    | RED   | `29a38f1` | test(135-03): add failing tests for CANVAS_QA_PROMPT v135 role-aware schema                    |
| 1    | GREEN | `88fce4d` | feat(135-03): rewrite CANVAS_QA_PROMPT role-aware + extend QaReport                            |
| 2    | RED   | `10eb78b` | test(135-03): add failing tests for runArchitectQALoop validator gate (ARCH-PROMPT-13)         |
| 2    | GREEN | `357c8b3` | feat(135-03): wire validateCanvasDeterministic into runArchitectQALoop (GREEN)                 |

## Self-Check: PASSED

- FOUND: `app/src/lib/services/catbot-pipeline-prompts.ts` (modified; CANVAS_QA_PROMPT v135 role-aware)
- FOUND: `app/src/lib/services/intent-job-executor.ts` (modified; buildActiveSets + validator wiring)
- FOUND: `app/src/lib/__tests__/catbot-pipeline-prompts.test.ts` (modified; 4 new CANVAS_QA_PROMPT v135 tests)
- FOUND: `app/src/lib/__tests__/intent-job-executor.test.ts` (modified; 4 new ARCH-PROMPT-13 tests + 6 fixture updates + default buildActiveSets spy)
- FOUND commit: `29a38f1` (Task 1 RED)
- FOUND commit: `88fce4d` (Task 1 GREEN)
- FOUND commit: `10eb78b` (Task 2 RED)
- FOUND commit: `357c8b3` (Task 2 GREEN)
- 147/147 tests passing across the three affected test files
