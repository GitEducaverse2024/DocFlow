---
phase: 132-canvas-qa-loop-architect-con-auto-review-rules-index-y-side-effect-guards
plan: 02
subsystem: canvas/pipeline-architect
tags: [canvas, architect, qa-loop, rules-index, knowledge-gap]
requirements: [QA2-02, QA2-03, QA2-04, QA2-05]
dependency_graph:
  requires:
    - "loadRulesIndex() / getCanvasRule() from Plan 01 (canvas-rules.ts)"
  provides:
    - "ARCHITECT_PROMPT with {{RULES_INDEX}} placeholder + needs_rule_details mechanism"
    - "CANVAS_QA_PROMPT with strict JSON schema (quality_score, issues, data_contract_analysis, recommendation)"
    - "AGENT_AUTOFIX_PROMPT (consumed by canvas-auto-repair.ts in Plan 03)"
    - "IntentJobExecutor.runArchitectQALoop private static method"
    - "IntentJobExecutor.MAX_QA_ITERATIONS = 2 hard cap"
  affects:
    - "Plan 132-03 (canvas-auto-repair.ts consumes AGENT_AUTOFIX_PROMPT)"
    - "Plan 132-03 (insertSideEffectGuards runs after QA loop accepts design)"
tech-stack:
  added: []
  patterns:
    - "Placeholder substitution ({{RULES_INDEX}}) at call-time, not in source"
    - "Intra-iteration expansion pass (does not consume QA iteration budget)"
    - "Short-circuit on needs_cat_paws preserves Phase 130 CatPaw approval flow"
    - "Bounded for-loop (MAX_QA_ITERATIONS) guarantees no infinite iteration"
    - "saveKnowledgeGap on exhaustion instead of silent failure"
key-files:
  created: []
  modified:
    - app/src/lib/services/catbot-pipeline-prompts.ts
    - app/src/lib/services/intent-job-executor.ts
    - app/src/lib/__tests__/catbot-pipeline-prompts.test.ts
    - app/src/lib/__tests__/intent-job-executor.test.ts
decisions:
  - "Used saveKnowledgeGap (existing export) instead of logKnowledgeGap (doesn't exist) — research pseudocode referenced a non-existent function"
  - "Expansion pass detects unknown rule ids silently (logs warn via try/catch around getCanvasRule) — avoids hard failure when architect hallucinates rule IDs"
  - "previousDesign/previousQaReport only included in architect input when non-null — keeps iter 0 input clean and tests assertions precise"
  - "Existing happy-path + parseJSON-fallback state-machine tests updated to mock a 4th LLM response (QA accept) instead of skipping QA"
metrics:
  duration_seconds: 260
  tasks_completed: 3
  tests_added: 24
  tests_passing: 51
  files_created: 0
  files_modified: 4
  completed: "2026-04-11T00:12:00Z"
---

# Phase 132 Plan 02: Canvas QA Loop + Architect Rewrite Summary

Pipeline architect now emits designs with explicit data contracts (R01/R10/R13) and receives feedback from an automatic LLM-based QA reviewer. Max 2 iterations; on exhaustion the job fails cleanly and a knowledge gap is persisted at `catflow/design/quality` for later review.

## What Was Built

### catbot-pipeline-prompts.ts — 3 prompts (7.8KB total source)

**ARCHITECT_PROMPT (rewritten, ~70 lines):**
- `{{RULES_INDEX}}` placeholder replaced at runtime by `loadRulesIndex()` (Plan 01)
- Mandates `INPUT:`/`OUTPUT:` data contracts on every node's `instructions`
- References anti-patterns DA01–DA04 explicitly by ID
- Warns about downstream QA review and lists the checklist items it will apply
- Preserves `needs_cat_paws` escape hatch (Phase 130 CatPaw approval flow)
- Documents `needs_rule_details` mechanism: architect can request expanded detail
  for up to N rule IDs in its first pass, receives them under `expanded_rules` in
  a second call, then returns the definitive `flow_data`

**CANVAS_QA_PROMPT (new, ~40 lines):**
- Same `{{RULES_INDEX}}` substitution
- 5-item checklist (data contracts, arrays/loops, responsibilities, side effects, anti-patterns)
- Strict JSON schema: `quality_score` (0–100), `issues[]` (severity blocker/major/minor, rule_id, node_id, description, fix_hint), `data_contract_analysis` (edge-keyed ok/broken), `recommendation` (accept/revise/reject)
- Decision rules: `accept` iff score ≥ 80 AND no blocker

**AGENT_AUTOFIX_PROMPT (new, ~25 lines):**
- Consumed by Plan 03's `canvas-auto-repair.ts`
- Returns either `{status:"fixed", fix_target_node_id, fixed_instructions, reason}` or `{status:"repair_failed", reason}`

### intent-job-executor.ts — runArchitectQALoop

```typescript
private static readonly MAX_QA_ITERATIONS = 2;

private static async runArchitectQALoop(
  job: IntentJobRow,
  goal: unknown,
  tasks: unknown,
  resources: CanvasResources,
): Promise<ArchitectDesign | null>
```

State machine per iteration:

1. Architect call (system = ARCHITECT_PROMPT with rulesIndex substituted, user = {goal, tasks, resources, qa_report?, previous_design?})
2. **Expansion pass** (if `design.needs_rule_details` is non-empty):
   - `getCanvasRule(id)` for each requested id; missing ids silently skipped
   - Re-call architect once with `expanded_rules` + `previous_draft` in input
   - Result replaces `design`; does NOT consume an iteration slot
3. **Short-circuit:** if `design.needs_cat_paws` is non-empty → return design (skip QA, caller will route to awaiting_user phase)
4. QA call (system = CANVAS_QA_PROMPT substituted, user = {canvas_proposal, tasks, resources})
5. If `recommendation === 'accept'` → return design
6. Otherwise store design + qaReport for next iteration's feedback

On exhaustion (2 non-accept iterations):
- `saveKnowledgeGap({ knowledgePath: 'catflow/design/quality', query, context })`
- `updateIntentJob(status='failed', error='QA loop exhausted after 2 iterations; last recommendation=...')`
- `markTerminal(jobId)`
- Return null

### Integration into runFullPipeline

Replaced the inline architect block at line 191–202 with a single call to `runArchitectQALoop`. If it returns `null`, runFullPipeline exits early (job already marked terminal). Otherwise the design flows into `finalizeDesign` unchanged.

The `runArchitectRetry` branch (architect_retry resume path after user approves CatPaws) was intentionally left using the single architect call — resume path comes from a state where CatPaws are already resolved and the design shape is fixed; adding QA loop there would be out of scope for this plan.

## LLM Call Budget

| Scenario                              | Calls |
| ------------------------------------- | ----- |
| accept on iter 0                      | 2     |
| revise on iter 0 + accept on iter 1   | 4     |
| revise/reject both iters (exhaustion) | 4     |
| needs_cat_paws short-circuit          | 1     |
| expansion pass + accept               | 3     |
| expansion pass + revise + accept      | 5     |

Max observed in tests: **5 LLM calls** (expansion pass + 1 QA iteration). Well within the 30 s tick cadence of IntentJobExecutor.

## Prompt Byte Sizes

| File / constant              | Source bytes | After substitution (≈) |
| ---------------------------- | -----------: | ----------------------: |
| canvas-rules-index.md        |         2970 |                       — |
| ARCHITECT_PROMPT (source)    |      ~3400   |         ~6400 (+2.9 KB) |
| CANVAS_QA_PROMPT (source)    |      ~1800   |         ~4800 (+2.9 KB) |
| AGENT_AUTOFIX_PROMPT         |      ~1300   |                   ~1300 |
| **catbot-pipeline-prompts.ts total** | **7783** | — |

All fit comfortably within LiteLLM / gemini-main context.

## Test Results

**Tests added:** 24 new + 2 updated (existing state-machine tests got a 4th QA mock response).

| Suite                          | Tests | Description                                                   |
| ------------------------------ | ----: | ------------------------------------------------------------- |
| ARCHITECT_PROMPT (QA2-03)      |     7 | placeholder, data contracts, DA01-DA04, QA mention, flow_data, needs_rule_details, needs_cat_paws |
| CANVAS_QA_PROMPT (QA2-04)      |     5 | exists, placeholder, schema fields, severities, recommendations |
| AGENT_AUTOFIX_PROMPT           |     2 | exists, status field shape                                    |
| STRATEGIST/DECOMPOSER baseline |     2 | unchanged sanity                                              |
| runArchitectQALoop (QA2-02, QA2-05) | 8 | accept iter 0, revise→accept iter 1, exhaustion (revise+revise), reject iter 1, needs_cat_paws short-circuit, loadRulesIndex called once, needs_rule_details happy path, unknown rule id graceful |

**All 51 tests in canvas-rules + catbot-pipeline-prompts + intent-job-executor pass.**
**`npm run build` passes.**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `logKnowledgeGap` doesn't exist in catbot-db.ts**
- **Found during:** Task 3 implementation
- **Issue:** Research pseudocode referenced `import('@/lib/catbot-db').logKnowledgeGap()` but the actual exported function is `saveKnowledgeGap` with signature `{ query, knowledgePath?, context? }`.
- **Fix:** Imported `saveKnowledgeGap` at top-level (no dynamic import needed since catbot-db is already in the import graph) and adapted the call.
- **Files modified:** app/src/lib/services/intent-job-executor.ts
- **Commit:** e6c53fd

**2. [Rule 3 - Blocking] Existing state-machine tests broke due to QA loop adding a 4th LLM call**
- **Found during:** Task 3 verification
- **Issue:** The existing "happy path" and "parseJSON fallback" tests mocked only 3 LLM responses (strategist/decomposer/architect). With the QA loop now calling a 4th time after architect, mocks were exhausted, parseJSON received undefined, and tests failed with stale expected call counts.
- **Fix:** Updated both tests to mock a 4th `{quality_score:90, recommendation:'accept'}` response and bumped the expected call count from 3 to 4.
- **Files modified:** app/src/lib/__tests__/intent-job-executor.test.ts
- **Commit:** e6c53fd
- **Note:** This change is strictly additive to test expectations — the tests still verify the happy path ends in `awaiting_approval` with a `canvas_id`.

**3. [Rule 2 - Robustness] Expansion pass wraps `getCanvasRule` in try/catch**
- **Found during:** Task 3 — writing the unknown-rule-id test
- **Issue:** The research pseudocode assumed `getCanvasRule` never throws, but it reads the filesystem (cached) and an IO error during first-call cache population would crash the entire architect iteration.
- **Fix:** Individual `try/catch` per rule lookup; failures logged as warn and the id is silently skipped (same behavior as a null return).
- **Files modified:** app/src/lib/services/intent-job-executor.ts
- **Commit:** e6c53fd

### Not Applied

**`runArchitectRetry` branch NOT wrapped with QA loop.** The plan only requires replacing the architect block in `runFullPipeline`. The retry branch is an explicit user-approved resume path after CatPaw creation — adding QA review there would second-guess the user and is out of scope for Plan 02.

## Commits

- `25a1253` test(132-02): add failing tests for CANVAS_QA_PROMPT + runArchitectQALoop
- `1e4b65c` feat(132-02): rewrite ARCHITECT_PROMPT + add CANVAS_QA_PROMPT + AGENT_AUTOFIX_PROMPT
- `e6c53fd` feat(132-02): implement runArchitectQALoop with expansion pass + QA review

## Hand-off Notes for Plan 03

- `AGENT_AUTOFIX_PROMPT` is already exported from `catbot-pipeline-prompts.ts` — Plan 03's `canvas-auto-repair.ts` only needs to import it.
- Plan 03 should use `saveKnowledgeGap` (NOT `logKnowledgeGap`) with `knowledgePath` param (camelCase, not `knowledge_path`) when persisting irreparable failures.
- Canvas-rules module (Plan 01) currently doesn't catch filesystem errors in its cache population — Plan 03's `insertSideEffectGuards` should be aware if it needs to look up rule details at canvas-mutation time.

## Self-Check: PASSED

**Files verified present:**
- FOUND: app/src/lib/services/catbot-pipeline-prompts.ts (modified)
- FOUND: app/src/lib/services/intent-job-executor.ts (modified)
- FOUND: app/src/lib/__tests__/catbot-pipeline-prompts.test.ts (created)
- FOUND: app/src/lib/__tests__/intent-job-executor.test.ts (modified)

**Commits verified present:**
- FOUND: 25a1253
- FOUND: 1e4b65c
- FOUND: e6c53fd

**Tests:** 51/51 passing across canvas-rules + catbot-pipeline-prompts + intent-job-executor
**Build:** `cd app && npm run build` passes
