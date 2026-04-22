---
phase: 159-backend-passthrough-litellm-reasoning
plan: 02
subsystem: api
tags: [litellm, streaming, reasoning, anthropic, passthrough, sse, vitest]

# Dependency graph
requires:
  - phase: 158-model-catalog-capabilities-alias-schema
    provides: model_aliases schema with reasoning_effort/max_tokens/thinking_budget columns (CFG-01) that future plans (159-03, 159-04) will read via resolveAliasConfig to feed these new streamLiteLLM fields.
provides:
  - StreamOptions extended with reasoning_effort (enum with 'off' sentinel) and thinking (Anthropic-native {type, budget_tokens}) — both optional, back-compat.
  - streamLiteLLM body JSON conditionally spreads reasoning_effort when present and not 'off', and thinking verbatim when present.
  - Test helper makeFetchMockCapture() that mocks global.fetch with minimal SSE [DONE] response and returns parsed request body for body-shape assertions.
  - 8 new Vitest cases (PASS-01a..d, PASS-02a..b, PASS-regression, PASS-combined) proving wire-shape invariants.
affects: [159-03-patch-validator, 159-04-catbot-chat-route, 160-catbot-tools, 161-ui-oracle]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Conditional body spread for optional LLM parameters — mirror of existing max_tokens/tools pattern; DocFlow sentinel 'off' mapped to field-absence at the wire boundary.
    - fetch-mock capture pattern for request-body assertions — bypasses visual inspection of fetch.mock.calls and parses init.body into typed record for expect().toHaveProperty / toEqual comparisons.

key-files:
  created: []
  modified:
    - app/src/lib/services/stream-utils.ts
    - app/src/lib/services/stream-utils.test.ts

key-decisions:
  - "'off' sentinel stays a DocFlow-internal value — translated to field-omission at stream-utils boundary so LiteLLM never sees it. This keeps the UI dropdown semantics intuitive (off/low/medium/high as a linear progression) while preserving the LiteLLM wire contract (only low|medium|high valid)."
  - "Phase 159 is OUTBOUND-only — we do not parse reasoning_content from the response delta in this plan (FUT-03 in v30.1). Downstream consumers (CatBot chat UI) still see plain content tokens; reasoning content is invisible by design until v30.1."
  - "No new logger.info calls added for reasoning params — Phase 161 oracle will verify end-to-end via CatBot demonstration, not via log scraping. Additive-pure keeps the diff surgical."

patterns-established:
  - "Optional-field sentinels: use ||||'off'|||| or similar string sentinels in DocFlow config that translate to wire-level omission. Pattern: ||||spread when truthy and !== sentinel||||."
  - "Body-shape testing via fetch mock capture: preferred over stdout inspection or integration fixtures for pure request-construction validation."

requirements-completed: [PASS-01, PASS-02]

# Metrics
duration: 3min
completed: 2026-04-22
---

# Phase 159 Plan 02: Stream Utils Passthrough Summary

**StreamOptions gains reasoning_effort + thinking optional fields; streamLiteLLM body-spreads them conditionally into POST /v1/chat/completions with 'off' sentinel mapped to field-absence, verified by 8 fetch-mock-capture tests.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-22T09:26:05Z
- **Completed:** 2026-04-22T09:28:54Z
- **Tasks:** 2 (TDD: 1 RED + 1 GREEN)
- **Files modified:** 2

## Accomplishments

- StreamOptions interface extended with reasoning_effort (enum 'off'|'low'|'medium'|'high') and thinking ({type:'enabled'; budget_tokens:number}), both optional — back-compat preserved for 4 existing callers (catbot/chat, cat-paws/chat, catbrains/process, catbrains/chat).
- Body JSON in streamLiteLLM gains two conditional spreads; 'off' sentinel correctly omitted so LiteLLM never receives an unrecognized enum value.
- Test coverage: 8 new cases in "streamLiteLLM body passthrough (Phase 159)" describe block, plus a reusable makeFetchMockCapture helper that can be reused for future body-shape verification tests.

## Task Commits

Each task was committed atomically (TDD flow):

1. **Task 1: Failing tests (RED)** - `f7cee89` (test)
2. **Task 2: StreamOptions + body spread (GREEN)** - `a68b56b` (feat)

No REFACTOR commit — the diff was surgical (two interface lines + two body spread lines) and already clean.

## Files Created/Modified

- `app/src/lib/services/stream-utils.ts` — added reasoning_effort + thinking to StreamOptions; added two conditional spreads to body JSON.
- `app/src/lib/services/stream-utils.test.ts` — added makeFetchMockCapture helper at top of file; added describe block "streamLiteLLM body passthrough (Phase 159)" with 8 new tests.

## Decisions Made

- Kept the 'off' sentinel at the DocFlow layer (not at UI or API layer) so the wire boundary is the single translation point. Alternative of translating in the catbot chat route would leak sentinel knowledge into every caller.
- Did not add reasoning_content parsing to the reader loop — Phase 159 scope is strictly OUTBOUND (request body construction). Parsing Anthropic thinking deltas from the SSE response is out-of-scope until v30.1 (FUT-03).
- makeFetchMockCapture helper placed in stream-utils.test.ts (not a shared __tests__/helpers file) because only this test file needs it today; YAGNI trumps extraction.

## Deviations from Plan

None - plan executed exactly as written. All 8 tests, both commit messages, and both file edits match the plan's action blocks byte-for-byte (modulo a minor helper signature cleanup: dropped unused `capturedUrl` variable since no test asserts on URL).

## Issues Encountered

- Full `test:unit` suite showed 16 failures in unrelated files (alias-routing.test.ts from Phase 159-01 still in RED, task-scheduler.test.ts and catbot-holded-tools.test.ts pre-existing). Confirmed out-of-scope by running on `git stash` baseline — same failures without our diff. Scope boundary honored: did not fix.
- Lint output contains existing warnings (react-hooks/exhaustive-deps, @next/next/no-img-element) but no errors. Build exit 0.

## User Setup Required

None - no external service configuration required. Runtime change lands when Plan 159-04 wires the catbot chat route to pass resolved alias fields into streamLiteLLM; until then streamLiteLLM accepts the new fields but no caller supplies them.

## Next Phase Readiness

- **Plan 159-03 (PATCH validator):** can proceed independently of 02 — it validates incoming PATCH payloads against model_intelligence capabilities and does not touch stream-utils. Wave 1 parallel.
- **Plan 159-04 (catbot chat route):** depends on BOTH 159-01 (resolveAliasConfig — still RED) and 159-02 (this plan). The chat route will call resolveAliasConfig('catbot') and forward {model, reasoning_effort, thinking, max_tokens} into streamLiteLLM. Wave 3 after 01+02+03 all GREEN.
- **Known dependency blocker:** Phase 159-01 is still in RED (alias-routing.test.ts has 9 failing tests from commit db5986d). Plan 159-04 cannot progress to GREEN until Plan 159-01 GREEN lands. Execution order per the phase wave plan is 01 GREEN → then 04.

## Self-Check: PASSED

Verified:
- `app/src/lib/services/stream-utils.ts` exists and contains reasoning_effort on line 13, thinking on line 15, and the two conditional spreads on lines 58-61.
- `app/src/lib/services/stream-utils.test.ts` exists with the describe "streamLiteLLM body passthrough (Phase 159)" on line 301 and makeFetchMockCapture helper on line 15.
- Commit `f7cee89` (test RED) and `a68b56b` (feat GREEN) both present in `git log --oneline -3`.
- Vitest: 20/20 pass in stream-utils.test.ts (8 new + 12 pre-existing).
- `npm run build` exit 0.
- `npm run lint` exit 0 (warnings only, no errors).

---
*Phase: 159-backend-passthrough-litellm-reasoning*
*Plan: 02*
*Completed: 2026-04-22*
