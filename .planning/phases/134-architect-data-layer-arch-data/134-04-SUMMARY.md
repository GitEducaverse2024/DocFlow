---
phase: 134-architect-data-layer-arch-data
plan: 04
subsystem: catflow
tags: [pipeline-architect, qa-loop, determinism, catbot-prompts, knowledge-tree]

requires:
  - phase: 134-03
    provides: scanCanvasResources enriched payload feeding runArchitectQALoop
provides:
  - IntentJobExecutor.decideQaOutcome static pure function (code-side QA decision)
  - CANVAS_QA_PROMPT declares data_contract_score in its output schema
  - runArchitectQALoop emits deterministic accept/revise decision and logs llm_recommended for observability
  - catflow.json knowledge tree documents canvas_connector_contracts, deterministic_qa_threshold, canvas_resources_enriched
affects:
  - 135-architect-prompt-layer
  - 136-end-to-end-validation

tech-stack:
  added: []
  patterns:
    - "Decision-in-code over decision-in-prompt: LLM still emits recommendation (signal for next iteration) but runtime control flow uses pure function on numeric score + structural blocker filter"
    - "Retrocompat fallback field: optional data_contract_score with quality_score fallback keeps old tests green while new field becomes canonical"
    - "Parse-pipeline integration testing: feed raw JSON string through the same parseJSON the production code path uses, assert field survives AND consumer reads correct field"

key-files:
  created: []
  modified:
    - app/src/lib/services/intent-job-executor.ts
    - app/src/lib/services/catbot-pipeline-prompts.ts
    - app/src/lib/__tests__/intent-job-executor.test.ts
    - app/src/lib/__tests__/catbot-pipeline-prompts.test.ts
    - app/data/knowledge/catflow.json

key-decisions:
  - "Decision threshold is `data_contract_score >= 80 AND blockers.length === 0` — pure function in code, not parsed from LLM recommendation string"
  - "qaReport.recommendation still emitted by the reviewer (signal to architect next iter) but runArchitectQALoop IGNORES it for control flow; logged as llm_recommended for observability/divergence audit"
  - "Retrocompat fallback to quality_score when data_contract_score absent — old tests untouched, old reviewers not broken"
  - "decideQaOutcome is public static (not private) — direct call from unit tests without needing wrapper; parseJSON stays private but test reaches it via the same `as unknown as` cast pattern qaInternals() already uses"
  - "Blocker detection is case-insensitive and tolerates undefined issues (defensive for malformed LLM output)"

patterns-established:
  - "Deterministic decision gate pattern: any future QA/routing/validation decision that must be reproducible should live as a pure static on the owning class, not be parsed from LLM output"
  - "Observability-only field: qaReport.recommendation and progressMessage.qa_recommendation are retained post-determinism because they expose divergence (llm_recommended !== outcome is empirical evidence the code-side rule is doing work)"

requirements-completed: [ARCH-DATA-06]

duration: 3min
completed: 2026-04-11
---

# Phase 134 Plan 04: Deterministic QA Threshold Summary

**decideQaOutcome pure static function moves the Pipeline Architect accept/revise gate from parsed LLM string to code — `data_contract_score >= 80 AND blockers.length === 0`, verifiable by 13 unit tests including full parse-pipeline integration.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-11T12:01:40Z
- **Completed:** 2026-04-11T12:04:37Z
- **Tasks:** 3 executed + 1 checkpoint auto-approved (4 total)
- **Files modified:** 5

## Accomplishments

- `IntentJobExecutor.decideQaOutcome(qa)` exists as a public static pure function: returns `'accept'` iff `data_contract_score >= 80 AND no blockers`, else `'revise'`.
- `runArchitectQALoop` (intent-job-executor.ts) now uses `IntentJobExecutor.decideQaOutcome(qaReport)` instead of reading `qaReport.recommendation`. A new log line `QA outcome (deterministic)` emits `{score, blockers, outcome, llm_recommended}` on every iteration — any future divergence between code decision and LLM recommendation is auditable.
- `CANVAS_QA_PROMPT` output schema now declares `data_contract_score` (0–100) alongside `quality_score`, and the RECOMENDACION block + footer note explain that the code decision trumps the string recommendation.
- 13 new unit tests in `intent-job-executor.test.ts` cover: determinism anchor (=== across 3 calls), boundary inclusive/exclusive (80/79), blocker override, major severity not counted, low score, retrocompat fallback to quality_score, case-insensitive severity, malformed issues robustness, LLM-recommended-ignored, AND full parse-pipeline integration (Tests 12–13) proving `data_contract_score` survives `parseJSON(rawJson)` and `decideQaOutcome` reads the new field — not a silent fallback to `quality_score`.
- 2 new tests in `catbot-pipeline-prompts.test.ts` assert `data_contract_score` is declared and the `data_contract_score >= 80` threshold rule is documented in the prompt.
- `app/data/knowledge/catflow.json` gains 3 concept entries (`canvas_connector_contracts`, `deterministic_qa_threshold`, `canvas_resources_enriched`) so CatBot can answer questions about Phase 134 features via PromptAssembler after the next docker rebuild.

## Task Commits

1. **Task 1: decideQaOutcome + determinism tests + integration parse test** — `f72d926` (feat, TDD)
2. **Task 2: CANVAS_QA_PROMPT updated with data_contract_score** — `d88307c` (feat)
3. **Task 3: catflow.json knowledge tree updated** — `ca31388` (docs)
4. **Task 4 checkpoint:** auto-approved under `workflow.auto_advance=true` — unit test evidence (47 intent-job-executor tests + 18 prompts tests green) satisfies Phase 134 success criterion 4 (determinism verifiable by unit tests); docker rebuild + live log audit is an operational step at next deploy.

**Final metadata commit:** pending (this SUMMARY + STATE.md + ROADMAP.md).

## Files Created/Modified

- `app/src/lib/services/intent-job-executor.ts` — Added `decideQaOutcome` static + extended `QaReport` with optional `data_contract_score` + structural `issues` shape. Replaced `if (qaReport.recommendation === 'accept')` with `if (qaOutcome === 'accept')`. Added `QA outcome (deterministic)` log line with `{score, blockers, outcome, llm_recommended}`. progressMessage now carries `qa_outcome` alongside `qa_recommendation`.
- `app/src/lib/services/catbot-pipeline-prompts.ts` — `CANVAS_QA_PROMPT`: added `data_contract_score: 0-100` to output JSON schema, rewrote RECOMENDACION bullet for accept to reference the code-side rule, appended footer NOTE clarifying a high `quality_score` does not rescue a low `data_contract_score`.
- `app/src/lib/__tests__/intent-job-executor.test.ts` — Added 13-test `describe('decideQaOutcome (Phase 134 ARCH-DATA-06)')` block at EOF with a `decideQaExec()` helper that casts `IntentJobExecutor` to expose both `decideQaOutcome` (public static) and `parseJSON` (private, cast-accessible via the same pattern `qaInternals()` uses).
- `app/src/lib/__tests__/catbot-pipeline-prompts.test.ts` — 2 new tests asserting `data_contract_score` field presence and `data_contract_score >= 80` rule documentation.
- `app/data/knowledge/catflow.json` — 3 new concept entries + 1 new source path.

## Decisions Made

- **decideQaOutcome is `static` public (not private)** so tests call it directly via `IntentJobExecutor.decideQaOutcome(...)` without needing a new internals wrapper. Rationale: the plan allowed either route; public static is cleaner, no accessor churn, and the function is a pure query — no encapsulation concern.
- **parseJSON access path for Tests 12–13:** the test helper `decideQaExec()` casts `IntentJobExecutor as unknown as DecideQaExec`, exposing both `decideQaOutcome` and the private `parseJSON` via the same pattern the existing `qaInternals()` already uses for `runArchitectQALoop` and `callLLM`. No new `qaInternals` export was needed — the existing cast pattern already defeats the `private` modifier for tests.
- **logger.info emits TWO log lines per QA iter:** one new (`QA outcome (deterministic)`, authoritative for Phase 136 routing) and one preserved (`QA review complete`, for backward compatibility with any existing log grep). The old line now carries `data_contract_score` and `outcome` as additional fields.
- **progressMessage keeps `qa_recommendation` AND adds `qa_outcome`** — same rationale: downstream UI/Telegram consumers that already read `qa_recommendation` are not broken, and the new `qa_outcome` surface is the source of truth for the deterministic decision.

## Deviations from Plan

None — plan executed exactly as written. The plan anticipated that `parseJSON` might need a new `qaInternals` export, but the existing cast pattern (`as unknown as QAExecutorInternals`) already defeats the `private` modifier for tests, so a fresh minimal-surface `DecideQaExec` interface in the test file was sufficient — no public API changed in production code.

## Issues Encountered

None. All 47 `intent-job-executor.test.ts` tests (34 existing + 13 new) passed on first run; all 18 `catbot-pipeline-prompts.test.ts` tests (16 existing + 2 new) passed on first run.

## User Setup Required

None — no external service configuration required. Docker rebuild needed for the knowledge tree to reach CatBot at runtime (standard Phase 134 deploy step, not exclusive to this plan).

## Next Phase Readiness

- **Phase 134 Architect Data Layer COMPLETE** — all 4 plans shipped (134-01 connector contracts, 134-02 rules index scope, 134-03 enriched resources, 134-04 deterministic QA threshold). 16/45 v27.0 requirements covered (FOUND-01..10 + ARCH-DATA-01..07).
- **Ready for Phase 135 Architect Prompt Layer (ARCH-PROMPT):** the data layer is now clean and deterministic — the prompt rewrite can assume `data_contract_score` arrives in `qaReport` and that `data.role` is the next missing piece (observed in Phase 133 baseline: zero nodes carry `role` today).
- **Phase 136 Validation gate:** failure routing is now reproducible at the QA boundary — same scores always produce the same outcome, so any observed divergence between runs points upstream (prompt variance, data scan) not to the decision layer.

## Self-Check: PASSED

Verified:
- `app/src/lib/services/intent-job-executor.ts` contains `decideQaOutcome` and `QA outcome (deterministic)` (FOUND in git commit f72d926)
- `app/src/lib/services/catbot-pipeline-prompts.ts` contains `data_contract_score` (FOUND in git commit d88307c)
- `app/src/lib/__tests__/intent-job-executor.test.ts` contains `describe('decideQaOutcome (Phase 134 ARCH-DATA-06)')` (FOUND in git commit f72d926)
- `app/src/lib/__tests__/catbot-pipeline-prompts.test.ts` contains `CANVAS_QA_PROMPT declares data_contract_score` (FOUND in git commit d88307c)
- `app/data/knowledge/catflow.json` contains `canvas_connector_contracts`, `deterministic_qa_threshold`, `canvas_resources_enriched` (FOUND, JSON valid, validator PASS)
- Commits f72d926, d88307c, ca31388 all present in `git log --oneline`
- 47 intent-job-executor tests + 18 catbot-pipeline-prompts tests green

---
*Phase: 134-architect-data-layer-arch-data*
*Completed: 2026-04-11*
