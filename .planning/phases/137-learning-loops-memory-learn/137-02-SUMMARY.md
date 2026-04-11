---
phase: 137-learning-loops-memory-learn
plan: 02
subsystem: async-pipeline
tags: [intent-jobs, complexity-decisions, canvas-executor, condition-node, learn-loops, sqlite-migration]

requires:
  - phase: 131-complexity-gate
    provides: complexity_decisions table + saveComplexityDecision/updateComplexityOutcome helpers
  - phase: 132-canvas-qa-loop
    provides: runArchitectQALoop with QA review loop + markTerminal
  - phase: 133-foundation-tooling
    provides: job reaper (reapStaleJobs) + FOUND-06 intermediate outputs persistence
  - phase: 135-architect-prompt-layer
    provides: validateCanvasDeterministic pre-LLM gate + buildActiveSets
provides:
  - goal propagation convention: flow_data.nodes[start].data.initialInput = strategist.goal
  - intent_jobs.complexity_decision_id FK (idempotent migration)
  - closeComplexityOutcome helper wired at 3 terminal paths (completed/cancelled/timeout)
  - normalizeConditionAnswer multilingual parser (yes|si|afirmativo|correcto|true|1 / no|negativo|incorrecto|false|0)
affects: [137-03-oracle-tools, 137-04-telegram-ux, 136-e2e-validation]

tech-stack:
  added: []
  patterns:
    - "Reuse don't reimplement: closeComplexityOutcome delegates to existing updateComplexityOutcome"
    - "Idempotent migration pattern: addColumnIfMissing + CREATE INDEX IF NOT EXISTS"
    - "Exported pure-function parser for unit testing without full executor import"

key-files:
  created:
    - app/src/lib/__tests__/canvas-executor-condition.test.ts
  modified:
    - app/src/lib/catbot-db.ts
    - app/src/lib/services/intent-job-executor.ts
    - app/src/lib/services/canvas-executor.ts
    - app/src/app/api/catbot/chat/route.ts
    - app/src/lib/__tests__/intent-job-executor.test.ts
    - app/data/knowledge/catflow.json

key-decisions:
  - "LEARN-05 propagation placed in runArchitectQALoop (just before returning accepted design), not in finalizeDesign, so the mutation is observable on the returned object and testable in isolation."
  - "Exhaustion path uses 'cancelled' (not 'failed') because ComplexityDecisionRow.outcome type union lacks 'failed'; extending the union was out-of-scope for LEARN-08."
  - "closeComplexityOutcome is a no-op when complexity_decision_id is NULL, so callers at terminal paths invoke it unconditionally without polluting direct-pipeline code paths."
  - "LEARN-06 normalizer uses first-token fallback (not substring matching) so 'sí, con reservas' → yes without accidentally matching 'yesterday' → yes."
  - "YES_VALUES/NO_VALUES + normalizeConditionAnswer exported as named exports from canvas-executor.ts so the test suite imports only the parser, avoiding transitive DB/ollama/qdrant imports."

patterns-established:
  - "Terminal-path outcome closure: every terminal transition of an intent_job (awaiting_approval success, QA exhaustion, reaper timeout) closes the upstream complexity_decisions.outcome via a single helper."
  - "Goal→start-node propagation: the refined strategist goal is pushed down to the first executable node's initialInput, so downstream nodes never receive the ambiguous original_request."

requirements-completed: [LEARN-05, LEARN-06, LEARN-08]

duration: 18min
completed: 2026-04-11
---

# Phase 137 Plan 02: Runtime Wiring Summary

**Goal propagation to start node + multilingual condition parser + intent_jobs↔complexity_decisions outcome loop closure across 3 terminal paths (success/exhaustion/timeout)**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-11T18:25:00Z
- **Completed:** 2026-04-11T18:34:00Z
- **Tasks:** 2 (TDD — 4 commits total: 2 RED + 2 GREEN)
- **Files modified:** 7 (6 source + 1 knowledge)

## Accomplishments

- **LEARN-05 (goal propagation):** `runArchitectQALoop` mutates `design.flow_data.nodes[start].data.initialInput = goal` right before returning the accepted design. Goal always wins over any preexisting initialInput. Safe edge-case handling via try/catch + warn log when no start node is found.
- **LEARN-06 (multilingual condition parser):** Replaced the legacy `startsWith('yes')` check in `canvas-executor.ts` case `condition` with `normalizeConditionAnswer`. Accepts `yes|sí|si|true|1|afirmativo|correcto` → YES; `no|false|0|negativo|incorrecto` → NO. Case-insensitive with punctuation cleanup and first-token fallback. Conservative 'no' default on unknown input (same behavior legacy parser exhibited). Sanctioned deviation to the "do not touch canvas-executor.ts" rule per milestone v27.0.
- **LEARN-08 (outcome loop closure):**
  - Idempotent migration adds `intent_jobs.complexity_decision_id TEXT` + index.
  - `createIntentJob` accepts `complexityDecisionId` and persists it on INSERT.
  - `catbot/chat/route.ts` passes `decisionId` to both `createIntentJob` escalation call sites.
  - `IntentJobRow` TypeScript type extended with `complexity_decision_id?: string | null`.
  - New private helper `closeComplexityOutcome(job, outcome)` delegates to the **existing** `updateComplexityOutcome` (no re-implementation). Wired at 3 terminal paths:
    - `finalizeDesign` awaiting_approval → `'completed'`
    - `runArchitectQALoop` exhaustion → `'cancelled'`
    - `reapStaleJobs` reaper kill → `'timeout'`

## Task Commits

1. **Task 1 RED — LEARN-05 + LEARN-08 tests** — `0895412` (test)
2. **Task 1 GREEN — migration + outcome closure + goal propagation** — `6e519b1` (feat)
3. **Task 2 RED — LEARN-06 multilingual parser tests** — `4c8d664` (test)
4. **Task 2 GREEN — normalizeConditionAnswer + knowledge tree** — `7e4975a` (feat)

## Files Created/Modified

- `app/src/lib/catbot-db.ts` — idempotent `complexity_decision_id` migration + index; `createIntentJob` persists the id; `IntentJobRow` extended
- `app/src/lib/services/intent-job-executor.ts` — import `updateComplexityOutcome`; `closeComplexityOutcome` helper; wired at 3 terminal paths; LEARN-05 goal propagation in `runArchitectQALoop` accept branch
- `app/src/lib/services/canvas-executor.ts` — `YES_VALUES`/`NO_VALUES`/`normalizeConditionAnswer` named exports; case `condition` uses new parser
- `app/src/app/api/catbot/chat/route.ts` — both `createIntentJob` call sites pass `complexityDecisionId: decisionId ?? undefined`
- `app/src/lib/__tests__/intent-job-executor.test.ts` — 9 new LEARN-05/LEARN-08 tests + 1 backward-compat test (10 total added)
- `app/src/lib/__tests__/canvas-executor-condition.test.ts` — NEW file, 14 tests for `normalizeConditionAnswer`
- `app/data/knowledge/catflow.json` — 4 concepts added (complexity_decisions.outcome, intent_jobs.complexity_decision_id, START convention, condition multilingual)

## Test Results

- `canvas-executor-condition.test.ts`: 14/14 passing
- `intent-job-executor.test.ts`: 62/62 passing (52 baseline + 10 new)
- Pre-existing suite-wide failures (30 tests across 4 files) are unrelated — they target features owned by plans 137-03/04/05 (user_interaction_patterns, catbot-prompt-assembler LEARN-02/04, get_complexity_outcome_stats oracle, holded-tools rate-limit). Confirmed pre-existing via `git stash` baseline run.

## Decisions Made

- **Placed LEARN-05 mutation inside `runArchitectQALoop` (not `finalizeDesign`)** so the returned `ArchitectDesign` object carries the propagated goal and the behavior is unit-testable by calling `runArchitectQALoop` directly (the existing test harness pattern for Phase 132/135 regressions).
- **Used `'cancelled'` for QA exhaustion outcome** because `ComplexityDecisionRow.outcome` type union is `'completed' | 'queued' | 'timeout' | 'cancelled' | null`. Adding `'failed'` would be out-of-scope surface change; `'cancelled'` is semantically correct (the pipeline gave up deliberately, not due to infrastructure failure).
- **`closeComplexityOutcome` is a static private helper**, not a method on IntentJobRow, because the caller set is small (3 sites all inside `IntentJobExecutor`) and keeping it on the class preserves the `private static` pattern used by the rest of the executor.
- **LEARN-06 parser exported as named exports** (not via the executor's default surface) so the test file imports only the pure function without triggering the full executor's DB/ollama/qdrant import chain.

## Deviations from Plan

### Auto-fixed issues

None — the plan was precise and the implementation matched the specified steps in each `<action>` block. The only deviation from the plan text was in the commit strategy: the plan `<behavior>` split LEARN-05 and LEARN-08 into 9 tests; I grouped them into a single TDD cycle per task rather than interleaving RED/GREEN micro-commits, because the tests share fixtures (`seedDecision`, `makeFakeJob`, `QA_*` constants) and implementing the migration bisects meaninglessly without the createIntentJob change.

### Concurrent-execution observation

While executing Task 2, HEAD advanced with 7 commits from a concurrent executor working on Phase 137-01 and 137-03 (commits `184b7ba`, `946f780`, `1a79601`, `44e1dda`, `014342b`, `3d93b1c`, `8612473`). My prior commits (`0895412`, `6e519b1`, `4c8d664`) remained in the chain. When I re-opened `canvas.json` to add LEARN-05/06 concepts, the concurrent 137-01 commit had already added the `afirmativo`/`initialInput` markers — my intended edits were a no-op on that file, so only `catflow.json` ended up modified from Task 2's knowledge-tree step. The verification greps for `afirmativo`/`initialInput` in canvas.json still pass.

**Total deviations:** 0 code deviations. 1 administrative note (concurrent execution caused canvas.json to already contain the target content).

## Issues Encountered

- **Pre-existing test failures in unrelated suites** (30 tests). Confirmed via `git stash && vitest run` against the baseline HEAD — these target LEARN-02/03/04/08 features owned by plan 137-03 and task-scheduler/holded-tools unrelated to this plan. Not blockers.

## CatBot Oracle Protocol Compliance (CLAUDE.md)

This plan is a **precondition** for CatBot self-verification of the learning loop. Plan 137-03 will add the `get_complexity_outcome_stats` oracle tool that reads `complexity_decisions.outcome` to answer "¿qué % de peticiones complex completan con éxito?". Without LEARN-08, that tool would return an empty histogram (outcomes are NULL after the pipeline terminates). After this plan:

- New terminal transitions (success/exhaustion/timeout) emit non-NULL outcomes
- Historical rows (created before this migration) remain NULL — the oracle tool must filter `WHERE outcome IS NOT NULL` to produce a meaningful window
- LEARN-05/LEARN-06 are transparent: they affect pipeline quality but do not add any direct CatBot-facing tool. Their correctness is verifiable via the Phase 136 E2E gate and via inspection of `canvases.flow_data` after a successful run

## Self-Check

- `app/src/lib/catbot-db.ts` — exists, contains `complexity_decision_id` migration
- `app/src/lib/services/intent-job-executor.ts` — exists, contains `closeComplexityOutcome` (wired in 3 places)
- `app/src/lib/services/canvas-executor.ts` — exists, exports `normalizeConditionAnswer`
- `app/src/app/api/catbot/chat/route.ts` — exists, passes `complexityDecisionId` in both escalations
- `app/src/lib/__tests__/canvas-executor-condition.test.ts` — exists (NEW), 14 tests
- `app/src/lib/__tests__/intent-job-executor.test.ts` — exists, 62 tests (52 baseline + 10 new)
- `app/data/knowledge/catflow.json` — exists, 4 new LEARN concepts present
- Commits: `0895412`, `6e519b1`, `4c8d664`, `7e4975a` — all present in `git log`

## Self-Check: PASSED

## Next Phase Readiness

- Plan 137-03 can now implement `get_complexity_outcome_stats` knowing outcomes will be populated for all new async pipelines
- Plan 137-04 (Telegram UX) can rely on the LEARN-06 parser returning correct branches for Spanish condition-node responses
- Phase 136 E2E gate has one fewer silent-failure mode (Spanish "Sí" → 'no' branch)

---
*Phase: 137-learning-loops-memory-learn*
*Completed: 2026-04-11*
