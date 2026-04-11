---
phase: 133-foundation-tooling-found
plan: 02
subsystem: catflow-pipeline-resilience
tags: [intent-job-executor, abort-signal, timeout, litellm, knowledge-gap, qa-loop, notify-progress]

requires:
  - phase: 132
    provides: "runArchitectQALoop + saveKnowledgeGap exhaustion logging + notifyProgress throttle"
  - phase: 133-01
    provides: "canvas-nodes-catalog + exact VALID_NODE_TYPES gate"
provides:
  - "AbortSignal.timeout(90_000) on every pipeline callLLM fetch"
  - "AbortError/TimeoutError rewrapped as 'litellm timeout (90s)'"
  - "last_flow_data persisted in knowledge_gap.context on QA exhaustion"
  - "notifyProgress(force=true) with top-2 issues by severity before markTerminal"
  - "extractTop2Issues helper ranking blocker > major/high > minor/medium"
affects: [133-03-job-reaper, 133-04-intermediate-outputs-persistence, 134-architect-data-layer, 136-end-to-end-validation]

tech-stack:
  added: []
  patterns:
    - "AbortSignal.timeout on fetch with rewrapped error for user-visible diagnostics"
    - "Exhaustion branches must notify(force=true) before markTerminal to bypass throttle"
    - "Knowledge gap context size bumped 4000 → 8000 to fit flow_data payloads"

key-files:
  created: []
  modified:
    - "app/src/lib/services/intent-job-executor.ts"
    - "app/src/lib/__tests__/intent-job-executor.test.ts"

key-decisions:
  - "Rewrap AbortError/TimeoutError inside callLLM instead of letting raw DOMException bubble — keeps 'litellm' prefix consistent with other error paths the tick catch already handles."
  - "Slice limit on knowledge_gap.context bumped from 4000 to 8000 chars to accommodate flow_data; truncation still protects against pathological canvases."
  - "extractTop2Issues treats 'high' as major and 'medium' as minor so both naming conventions from the QA prompt map to the same ranks."
  - "notifyProgress(force=true) fired BEFORE updateIntentJob+markTerminal so the 60s throttle bypass and the Telegram/web emission happen while the job row still has channel info."

patterns-established:
  - "Any new pipeline LLM call added later must include AbortSignal.timeout(90_000) to avoid reintroducing the zombi currentJobId failure mode."
  - "Exhaustion / terminal failure branches must emit user-facing notifyProgress(force=true) BEFORE markTerminal cleanup."

requirements-completed: [FOUND-04, FOUND-07, FOUND-10]

duration: 3min
completed: 2026-04-11
---

# Phase 133 Plan 02: Resilience LLM Summary

**callLLM now hard-times-out at 90s via AbortSignal and QA exhaustion both persists last flow_data for post-mortem and force-notifies the user with the top-2 issues by severity before marking terminal.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-11T09:36:23Z
- **Completed:** 2026-04-11T09:39:29Z
- **Tasks:** 2 (both TDD: RED → GREEN)
- **Files modified:** 2

## Accomplishments
- FOUND-04: `callLLM` fetch receives `signal: AbortSignal.timeout(90_000)`. AbortError/TimeoutError rewrapped as `litellm timeout (90s)`. Existing `tick()` finally clears `currentJobId` so the executor slot is freed on every abort.
- FOUND-07: `runArchitectQALoop` exhaustion persists `previousDesign.flow_data` under `last_flow_data` in `knowledge_gap.context` (slice limit bumped 4000 → 8000) so Phase 136 post-mortem can inspect failed canvases without re-running the pipeline.
- FOUND-10: Exhaustion now calls `notifyProgress(job, ..., true)` with top-2 issues ranked by severity BEFORE `markTerminal`, bypassing the 60s throttle so users are never left on "processing..." for a dead job.
- New private helper `extractTop2Issues` with severity ranking (blocker > major/high > minor/medium > other).
- 3 new tests added (1 timeout, 1 exhaustion flow_data, 1 exhaustion notify ordering). 27/27 intent-job-executor tests green.

## Task Commits

1. **Task 1 RED: failing AbortSignal test** — `ef22665` (test)
2. **Task 1 GREEN: AbortSignal.timeout(90s) on callLLM** — `004b727` (feat)
3. **Task 2 RED: failing exhaustion flow_data + notify tests** — `588edfb` (test)
4. **Task 2 GREEN: enrich exhaustion branch** — `dbae994` (feat)

## Files Created/Modified
- `app/src/lib/services/intent-job-executor.ts` — AbortSignal.timeout on callLLM fetch + exhaustion branch enriched with last_flow_data persistence and forced notifyProgress with top-2 issues; new `extractTop2Issues` helper.
- `app/src/lib/__tests__/intent-job-executor.test.ts` — 3 new tests (FOUND-04 timeout abort path, FOUND-07 flow_data in gap, FOUND-10 top-2 notify ordering).

## Decisions Made
- Rewrap AbortError inside `callLLM` rather than at the `tick()` catch — the tick only logs `String(err)`, so rewrapping at source gives users a proper `litellm timeout (90s)` string without having to teach tick about DOMException.
- Kept `extractTop2Issues` as a private static on the class (co-located with the only consumer) instead of a standalone utility — no other caller needs it and exporting would expand the surface unnecessarily.
- The FOUND-04 test uses a `global.fetch` mock that immediately rejects with `DOMException('AbortError')` and asserts the captured `init.signal` is an `AbortSignal` instance. This verifies the signal is passed without waiting 90s or depending on vitest fake timers.

## Deviations from Plan

None — plan executed exactly as written. Both tasks' action blocks, verification, and done criteria matched implementation 1:1.

## Issues Encountered

- Full-suite `npm run test:unit` shows 9 pre-existing failures in unrelated files (holded MCP tools, knowledge-tree `updated_at` format drift, task-scheduler timers). Out-of-scope for this plan per GSD scope boundary — NOT introduced by these changes and NOT fixed here.
- `npx tsc --noEmit` shows pre-existing type errors in 8 unrelated test files (tuple destructuring, `Set<string>` iteration requiring `downlevelIteration`). None originate from this plan's edits.

## User Setup Required

None — no external service configuration or env changes required.

## Next Phase Readiness

- FOUND-04/07/10 closed. Plan 133-03 (job-reaper) can now rely on: (a) callLLM no longer hangs indefinitely, so a reaper for zombi jobs addresses only crash/kill paths; (b) exhaustion is already observable via knowledge_gap + user notification, so reaper is a belt-and-braces layer.
- Pattern established: any future pipeline LLM call added in Phase 134/135 must include `AbortSignal.timeout(90_000)` to avoid reintroducing the zombi slot failure.
- `last_flow_data` in `knowledge_gaps` is now the canonical post-mortem artifact for Phase 136 failure routing (prompt-layer failures will have the failing canvas persisted).

## Verification

- `cd app && npm run test:unit -- intent-job-executor.test` → **27/27 passed**
- `grep -n "AbortSignal.timeout" app/src/lib/services/intent-job-executor.ts` → match at line 596
- `grep -n "last_flow_data" app/src/lib/services/intent-job-executor.ts` → match at line 412

## Self-Check: PASSED

- `app/src/lib/services/intent-job-executor.ts` — FOUND
- `app/src/lib/__tests__/intent-job-executor.test.ts` — FOUND
- commit `ef22665` — FOUND
- commit `004b727` — FOUND
- commit `588edfb` — FOUND
- commit `dbae994` — FOUND

---
*Phase: 133-foundation-tooling-found*
*Plan: 02-resilience-llm*
*Completed: 2026-04-11*
