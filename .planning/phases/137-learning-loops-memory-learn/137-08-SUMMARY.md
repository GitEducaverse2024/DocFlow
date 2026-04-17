---
plan: "137-08"
phase: "137"
gap_closure: true
triggered_by: "signal-gate-run-1b-failure (qa_rejected after 137-07 fixed truncation)"
requirements: []
status: complete
started: "2026-04-17T17:00:00Z"
completed: "2026-04-17T19:15:00Z"
---

# 137-08 Summary — Architect-QA Convergence Gap Closure

## What was built

Fixed the architect-QA convergence loop that blocked the signal gate after 137-07 resolved the JSON truncation bug. Two complementary fixes:

**E — QA iteration budget infrastructure:**
- Default `MAX_QA_ITERATIONS` bumped from 2 to 4 (dynamic override via `config_overrides.max_qa_iterations`)
- `resolveMaxQaIterations(job)` resolver with env fallback + clamping [1,10]
- Schema: `architect_iter2`, `qa_iter2`, `architect_iter3`, `qa_iter3` columns (idempotent migration)
- `runArchitectQALoop` refactored from hardcoded 2-iter to dynamic N-iter with column persistence (iter>=4 overwrites iter3 slot)

**F — Architect prompt R01/R10/R15 reinforcement:**
- Architect system prompt now includes explicit Spanish-language directives for:
  - R01: Extractor nodes MUST declare explicit JSON schema in OUTPUT section
  - R10: Synthesizer nodes MUST preserve upstream input fields in OUTPUT
  - R15: Renderer nodes receive ONLY minimal fields needed for template

**Additionally:**
- `failure_class` now wired in top-level `processJob` catch (was only wired at architect-parse-fail path after 137-07)
- `retry_intent_job` CatBot tool extended with `qa_iterations_override` arg (sudo-gated)
- Knowledge tree updated with qa_rejected failure class + iteration budget override concepts
- SIGNAL-GATE.md updated with forensic evidence for attempts 1a (truncation) and 1b (QA exhaustion)

## Commits

| SHA | Message |
|-----|---------|
| `23cd3c9` | feat(137-08): qa iteration budget schema + override resolver |
| `92ad240` | feat(137-08): dynamic qa iteration budget in runArchitectQALoop |
| `ee399a8` | feat(137-08): architect prompt R01/R10/R15 reinforcement for extractor schemas |

Task 4 (failure_class top-level wiring + retry qa_iterations override) was completed within Task 3 commit by the executor.

## Key files

### Created
- `app/src/lib/__tests__/intent-job-failure-classifier.test.ts` (extended: +5 schema tests for iter2/3 columns)

### Modified
- `app/src/lib/catbot-db.ts` — 4 new idempotent columns + IntentJobRow type
- `app/src/lib/services/intent-job-executor.ts` — dynamic QA loop + failure_class top-level wiring + architect prompt R01/R10/R15
- `app/src/lib/services/intent-job-architect-helpers.ts` — resolveMaxQaIterations
- `app/src/lib/services/catbot-tools.ts` — retry_intent_job qa_iterations_override param
- `app/data/knowledge/catboard.json` — qa_rejected + iteration budget docs
- `.planning/phases/137-learning-loops-memory-learn/137-06-SIGNAL-GATE.md` — RUN 1 forensic evidence

## Tests

- intent-job-failure-classifier.test.ts: 20/20 (5 new for iter2/3 columns)
- intent-job-architect-helpers.test.ts: 11/11 (resolveMaxQaIterations)
- catbot-tools-retry-job.test.ts: 10/10 (includes qa_iterations_override)
- knowledge-tree.test.ts: 19/19 (parity preserved)

## Chain

```
137-06 gate attempt 1a → FAILED (truncated_json)
  → 137-07 gap closure (max_tokens + jsonrepair)
    → gate attempt 1b → FAILED (qa_rejected, 2-iter budget)
      → 137-08 gap closure (QA budget 4 + R01/R10/R15 prompt)
        → gate attempt 1c → PENDING (requires Docker rebuild)
```
