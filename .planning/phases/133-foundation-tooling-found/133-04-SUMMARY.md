---
phase: 133-foundation-tooling-found
plan: 04
subsystem: catbot-pipeline
tags: [intent_jobs, persistence, post-mortem, FOUND-06]
requires:
  - Phase 133 Plan 02 (QA loop with knowledge_gap persistence)
  - Phase 133 Plan 03 (job reaper)
provides:
  - "intent_jobs now persists 6 intermediate pipeline outputs (strategist, decomposer, architect_iter0/1, qa_iter0/1)"
  - "Phase 134/135/136 post-mortem can inspect raw stage outputs without re-running the pipeline"
  - "test-pipeline.mjs (Plan 05) can dump raw LLM outputs per stage to stdout"
affects:
  - app/src/lib/catbot-db.ts
  - app/src/lib/services/intent-job-executor.ts
tech-stack:
  patterns:
    - "Idempotent SQLite ADD COLUMN via PRAGMA table_info introspection (addColumnIfMissing helper)"
    - "Dynamic UPDATE builder over a stageColumns allowlist inside updateIntentJob"
key-files:
  created:
    - .planning/phases/133-foundation-tooling-found/133-04-SUMMARY.md
  modified:
    - app/src/lib/catbot-db.ts
    - app/src/lib/services/intent-job-executor.ts
    - app/src/lib/__tests__/intent-job-executor.test.ts
decisions:
  - "Columns live in catbot-db.ts (real home of intent_jobs) instead of the plan's outdated @/lib/db + @/lib/intent-jobs paths — Rule 3 deviation, no behaviour impact"
  - "Persist expandedRaw, not architectRaw, when needs_rule_details expansion runs — Phase 134 must audit the architect output that actually reached QA, not the discarded draft"
  - "Hardcode iter0/iter1 column mapping inside runArchitectQALoop rather than dynamic key building — keeps TypeScript strict and honours MAX_QA_ITERATIONS=2 invariant declared in Phase 132"
  - "Stage columns are opt-in in the updateIntentJob patch, not positional — preserves backwards compatibility with 30+ existing call sites"
metrics:
  duration_s: 260
  tasks_completed: 2
  files_modified: 3
  tests_added: 3
  tests_total_after: 34
  completed_at: "2026-04-11T09:53:33Z"
---

# Phase 133 Plan 04: Intermediate Outputs Persistence Summary

Six new TEXT columns on `intent_jobs` (`strategist_output`, `decomposer_output`, `architect_iter0`, `qa_iter0`, `architect_iter1`, `qa_iter1`) persist the raw LLM output of each pipeline stage so Phases 134/135/136 can post-mortem exactly what each stage produced without re-running the pipeline, and so `test-pipeline.mjs` (Plan 05) can dump them to stdout.

## What Was Built

### Columns Added (catbot-db.ts)

All six are `TEXT NULL DEFAULT NULL`, added via a new `addColumnIfMissing(table, column, type)` helper that introspects `PRAGMA table_info` before running `ALTER TABLE ADD COLUMN` (SQLite does not support `IF NOT EXISTS` on `ADD COLUMN`). The migration runs right after the main `CREATE TABLE IF NOT EXISTS intent_jobs (...)` block so it is idempotent on every process boot.

The `IntentJobRow` type gained the same 6 optional fields, and `updateIntentJob` now accepts them in its patch via a small `stageColumns` loop that extends the dynamic UPDATE — old call sites are untouched because the new fields are all optional.

### Persistence Sites (intent-job-executor.ts)

| Column              | Call site                                              |
| ------------------- | ------------------------------------------------------ |
| `strategist_output` | Immediately after `callLLM(STRATEGIST_PROMPT, …)`      |
| `decomposer_output` | Immediately after `callLLM(DECOMPOSER_PROMPT, …)`      |
| `architect_iter0`   | Inside `runArchitectQALoop`, `iter===0`, AFTER expansion pass |
| `qa_iter0`          | Inside `runArchitectQALoop`, `iter===0`, after QA `callLLM` |
| `architect_iter1`   | Inside `runArchitectQALoop`, `iter===1`, AFTER expansion pass |
| `qa_iter1`          | Inside `runArchitectQALoop`, `iter===1`, after QA `callLLM` |

The loop tracks `architectRawFinal = architectRaw` initially and overwrites it with `expandedRaw` when the `needs_rule_details` expansion pass fires, so the persisted `architect_iterN` is always the string that actually reached the QA reviewer (critical for Phase 134 data-contract auditing).

### Tests Added

Three new tests in the new `intermediate output persistence (Phase 133 Plan 04)` describe block:

1. **Full pipeline accept iter0** — runs `IntentJobExecutor.tick()` with strategist/decomposer/architect/qa mocks; asserts all 4 early columns are populated and `architect_iter1` / `qa_iter1` remain `NULL`.
2. **Revise iter0 → accept iter1** — invokes `runArchitectQALoop` directly with 4 mocked `callLLM` responses; asserts all 4 iter columns are populated with the correct raw strings and the untouched strategist/decomposer columns remain `NULL`.
3. **Expansion pass preserves the final output** — seeds `needs_rule_details` in the draft; asserts `architect_iter0` equals the expanded (second) architect response, not the draft.

TDD order: RED commit `61ef4e0` (all 3 new tests failing) → GREEN commit `e70311f` (34/34 passing). No refactor commit needed.

## Deviations from Plan

### Rule 3 - Correct File Routing

The plan directed edits at `app/src/lib/db.ts` and `app/src/lib/intent-jobs.ts`, but `intent_jobs` lives in `app/src/lib/catbot-db.ts` (the `catbotDb` connection). The executor already imports `updateIntentJob`, `IntentJobRow`, etc. from `@/lib/catbot-db`. All Task 1 work landed there instead; no functional difference, and this matches the Plan 03 hand-off note ("intent_jobs table lives in catbotDb, NOT the default db"). Recorded here for traceability but no user decision needed.

No auto-fixes, no architectural deviations, no auth gates.

## Verification

```bash
# 1. Test suite: 34/34 green
cd app && npm run test:unit -- intent-job-executor.test
# → Test Files 1 passed (1); Tests 34 passed (34)

# 2. Grep: 6 persistence sites in executor
grep -c "strategist_output\|architect_iter\|decomposer_output\|qa_iter" \
  app/src/lib/services/intent-job-executor.ts
# → 6

# 3. Grep: 6 idempotent migrations in catbot-db
grep -c "addColumnIfMissing.*intent_jobs" app/src/lib/catbot-db.ts
# → 6

# 4. tsc: no new errors (pre-existing 8 unrelated errors unchanged)
cd app && npx tsc --noEmit 2>&1 | grep -c "error TS"
# → 8 (same count before/after plan)
```

## Commits

| Hash      | Type | Description                                                   |
| --------- | ---- | ------------------------------------------------------------- |
| `b5c6239` | feat | Add 6 intermediate output columns to intent_jobs (FOUND-06)   |
| `61ef4e0` | test | Add failing tests for intermediate output persistence (RED)   |
| `e70311f` | feat | Persist 6 intermediate pipeline outputs on intent_jobs (GREEN)|

## Follow-ups

- Plan 05 `test-pipeline.mjs` must `SELECT` the 6 columns and print them to stdout alongside `flow_data` and `qa_report`.
- Phase 134 Architect Data Layer should read `architect_iter0` / `architect_iter1` as the ground-truth "what the architect actually produced" signal for its data_contract_score calculation.
- Phase 136 post-mortem tooling can now diff `architect_iter0` vs `architect_iter1` to understand what QA feedback actually changed between iterations.

## Self-Check: PASSED

- FOUND: app/src/lib/catbot-db.ts (addColumnIfMissing + 6 ADD COLUMN + IntentJobRow stage fields + updateIntentJob stageColumns loop)
- FOUND: app/src/lib/services/intent-job-executor.ts (6 updateIntentJob call sites for stage outputs)
- FOUND: app/src/lib/__tests__/intent-job-executor.test.ts (3 new tests in Phase 133 Plan 04 describe block, all passing)
- FOUND commit: b5c6239 (Task 1)
- FOUND commit: 61ef4e0 (Task 2 RED)
- FOUND commit: e70311f (Task 2 GREEN)
