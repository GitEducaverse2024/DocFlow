---
phase: 161-ui-enrutamiento-oracle-e2e
plan: 03
subsystem: api
tags: [catbot, litellm, reasoning, logging, observability, vitest, typescript]

# Dependency graph
requires:
  - phase: 159-backend-passthrough
    provides: "streamLiteLLM propagation of reasoning_effort + thinking budget; catbot/chat route migrated to resolveAliasConfig so `model` is in scope for the logger payload."
  - phase: 158-model-catalog-capabilities
    provides: "supports_reasoning capability flag — operational precondition for non-zero reasoning_tokens in LiteLLM responses."
provides:
  - "StreamCallbacks.onDone TS contract extended with optional completion_tokens_details.reasoning_tokens (runtime passthrough already worked; this exposes the nested field to downstream consumers without a cast)."
  - "Silent server-side logger in /api/catbot/chat emitting JSONL `{source:'catbot-chat', message:'reasoning_usage', reasoning_tokens, model, alias:'catbot'}` when reasoning_tokens > 0 in either streaming or non-streaming path."
  - "New `LogSource` union member `'catbot-chat'` so the VER-03 evidence stream is separable from general 'catbot' noise via grep."
  - "Test coverage: 4 new stream-utils cases (1 TS contract + 3 runtime regression guards) + 5 new route cases (streaming on/off/zero + non-streaming on/off)."
affects: [161-06-oracle-uat, 161-05-unit-resolve-alias]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gated silent logger for oracle evidence: `if (rt > 0) logger.info('catbot-chat', 'reasoning_usage', {...})` — zero log noise for non-reasoning models, grep-friendly JSONL for UAT verification."
    - "`expectTypeOf` as primary RED signal for TS-contract tasks — the test file only compiles after the interface extension lands; runtime tests play regression-guard roles."
    - "Byte-symmetric logger call-sites across streaming + non-streaming paths — mirrors the symmetry pattern established in Phase 159-04 for LiteLLM body serialization."

key-files:
  created:
    - ".planning/phases/161-ui-enrutamiento-oracle-e2e/deferred-items.md — pre-existing TS errors in unrelated test files (gmail executor, intent jobs, kb-sync, telegram) catalogued out of scope per SCOPE BOUNDARY."
  modified:
    - "app/src/lib/services/stream-utils.ts — StreamCallbacks.onDone signature + local `usage` annotation widened with optional completion_tokens_details.reasoning_tokens."
    - "app/src/lib/services/stream-utils.test.ts — appended Phase 161 describe block with 1 expectTypeOf TS contract test + 3 runtime regression guards."
    - "app/src/lib/logger.ts — extended LogSource union with 'catbot-chat'."
    - "app/src/app/api/catbot/chat/route.ts — added gated `logger.info('catbot-chat', 'reasoning_usage', ...)` call in streaming `onDone` and in non-streaming iteration loop after `const usage = llmData.usage || {}`."
    - "app/src/app/api/catbot/chat/__tests__/route.test.ts — appended VER-03 describe block with 5 cases covering on/off paths + silent-when-absent + silent-when-zero."

key-decisions:
  - "Logger source extended (LogSource += 'catbot-chat') instead of reusing 'catbot' — the plan's must_haves.truths explicitly mandates `source='catbot-chat'` so Plan 161-06 oracle UAT can grep a stable JSONL shape without noise from the general 'catbot' firehose."
  - "Runtime passthrough for completion_tokens_details already worked today (`usage = parsed.usage` copies LiteLLM's usage object verbatim at stream-utils L107) — the 3 runtime tests are regression guards against a future `usage = {prompt_tokens, completion_tokens, total_tokens}` field-picking cleanup, not greenfield contract tests."
  - "Non-streaming logger call placed inside the iteration loop (not after it) — each LiteLLM iteration is an independent round-trip; if the LLM tool-calls multiple times and only the final iteration has reasoning_tokens, the oracle still sees the evidence line."
  - "TS type-level test via `expectTypeOf` is the primary RED signal; runtime tests compile and pass even without the interface extension because vitest runs via tsx/ESM and ignores unused type assertions at runtime. The canonical RED proof is `npx tsc --noEmit` reporting TS2339/TS2345 on the test file until the interface lands."

patterns-established:
  - "Oracle evidence logging pattern: narrow LogSource literal (not 'catbot'), fixed message string ('reasoning_usage'), structured metadata payload {metric, model, alias}. Future oracle UATs can reuse this shape as an ad-hoc metric pipeline without Prometheus/StatsD dependencies."
  - "TS contract extension via expectTypeOf + runtime regression guards: when a runtime behavior already works but lacks a TS surface, extend the interface first (RED = TS error on test file), then add runtime regression guards to pin the existing behavior in place."

requirements-completed: [VER-03]

# Metrics
duration: ~4min
completed: 2026-04-22
---

# Phase 161 Plan 03: Logger de reasoning_tokens Summary

**Silent `logger.info('catbot-chat', 'reasoning_usage', {...})` call in both streaming and non-streaming paths of `/api/catbot/chat`, gated on `reasoning_tokens > 0`, producing grep-friendly JSONL evidence for the Plan 161-06 oracle UAT.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-22T13:55:00Z (approximate — state load + RED tests)
- **Completed:** 2026-04-22T13:59:00Z
- **Tasks:** 2 (Task 1: stream-utils interface + tests; Task 2: route logger + tests)
- **Files modified:** 5 (2 interface/test pairs + logger.ts LogSource extension)

## Accomplishments

- `StreamCallbacks.onDone` TS contract now surfaces `completion_tokens_details.reasoning_tokens` — downstream consumers (catbot/chat route) read the nested field without a cast.
- Both paths of `/api/catbot/chat` emit exactly one `reasoning_usage` JSONL line per LiteLLM round-trip when the response contains reasoning_tokens > 0; silent otherwise.
- `LogSource` union extended with `'catbot-chat'` so the oracle UAT gets a deterministic grep target separable from the general `'catbot'` log stream.
- 9 new tests (4 stream-utils + 5 route), all GREEN alongside 30 pre-existing tests (20 stream-utils + 10 route). Zero regression.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend stream-utils onDone + tests** — `699d2cd` (feat)
2. **Task 2: Add reasoning_usage logger + tests** — `e1d84a1` (feat)

_Note: Both tasks were TDD (RED → GREEN in a single commit each)._

## Files Created/Modified

- `app/src/lib/services/stream-utils.ts` — extend `StreamCallbacks.onDone` signature + widen local `usage` type annotation.
- `app/src/lib/services/stream-utils.test.ts` — append Phase 161 describe block (1 expectTypeOf + 3 runtime guards).
- `app/src/lib/logger.ts` — extend `LogSource` union with `'catbot-chat'`.
- `app/src/app/api/catbot/chat/route.ts` — two `logger.info('catbot-chat', 'reasoning_usage', ...)` gated on `rt > 0`, one in streaming `onDone`, one inside non-streaming iteration loop.
- `app/src/app/api/catbot/chat/__tests__/route.test.ts` — append VER-03 describe block with 5 cases.
- `.planning/phases/161-ui-enrutamiento-oracle-e2e/deferred-items.md` — pre-existing TS errors in unrelated test files logged out of scope.

## Decisions Made

- **LogSource extension (not `'catbot'` reuse):** Plan's must_haves.truths explicitly pin `source='catbot-chat'`. The existing `LogSource` union is strictly typed and would reject a free-form string at compile time. Adding the literal is a single-line additive union extension with zero blast radius (one new allowed value, no removal of existing values).
- **Non-streaming logger inside the iteration loop:** Each iteration is an independent LiteLLM response; if iteration N returns reasoning_tokens=42 and iteration N+1 returns plain `{prompt_tokens, completion_tokens, total_tokens}`, the evidence line fires once for N and is silent for N+1. Placing the call AFTER the loop would conflate iterations and risk missing evidence entirely if the last iteration happens to lack reasoning_tokens.
- **Passthrough is runtime-transparent:** `stream-utils.ts` already had `usage = parsed.usage` which copies LiteLLM's usage object byte-for-byte. No runtime change needed — only the TS surface needed widening so the route could read `usage.completion_tokens_details` without a cast. The 3 runtime tests exist as regression guards to pin this behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended `LogSource` union with `'catbot-chat'`**
- **Found during:** Task 2 (adding the logger call to the route)
- **Issue:** Plan contract `source='catbot-chat'` + strict `LogSource` union in `app/src/lib/logger.ts` = TS compile error on the new `logger.info(...)` call sites. The plan's `<interfaces>` block said _"source 'catbot-chat' allowed per Phase 158-02 precedent (no LogSource enum extension needed)"_ but a quick audit showed Phase 158-02 actually used `'system'`, not `'catbot-chat'` — the precedent was wrong.
- **Fix:** Added `| 'catbot-chat'` to the union with a Phase 161 comment explaining the VER-03 purpose.
- **Files modified:** `app/src/lib/logger.ts`
- **Verification:** `npx tsc --noEmit` reports no errors on stream-utils, catbot/chat, or logger files; route tests GREEN.
- **Committed in:** `e1d84a1` (Task 2 commit)

**2. [Rule 3 - Blocking] Test file location mismatch**
- **Found during:** Task 1 (before adding tests)
- **Issue:** Plan's `files_modified` lists `app/src/lib/services/__tests__/stream-utils.test.ts` but the existing stream-utils tests live at `app/src/lib/services/stream-utils.test.ts` (co-located with source, not in `__tests__/`). Creating a duplicate would fragment coverage.
- **Fix:** Appended the new Phase 161 describe block to the existing co-located `stream-utils.test.ts`. Vitest config `include: ['src/**/*.test.ts']` picks up both locations so either would work; co-locating honours existing repo convention.
- **Files modified:** `app/src/lib/services/stream-utils.test.ts` (instead of creating a new `__tests__/` file)
- **Verification:** 24/24 tests GREEN.
- **Committed in:** `699d2cd` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 blocking)
**Impact on plan:** Both fixes necessary for the plan's own success criteria to hold. No scope creep — both were pure contract reconciliation between the plan text and repo reality.

## Issues Encountered

- `npx tsc --noEmit` surfaces pre-existing TS errors in unrelated test files (gmail executor, intent-job-executor, intent-jobs, kb-sync rebuild determinism, telegram callback). Verified these are untouched by Plan 161-03 edits (grep scope = stream-utils + catbot/chat + logger.ts); documented in `deferred-items.md` per SCOPE BOUNDARY rule.

## Next Phase Readiness

- **Plan 161-06 oracle UAT ready:** CatBot triggered against Opus+high via `set_catbot_llm` (Plan 160-03 tool) should produce a `{"source":"catbot-chat","message":"reasoning_usage","metadata":{"reasoning_tokens":>0,"model":"...","alias":"catbot"}}` line in `/app/data/logs/app-YYYY-MM-DD.jsonl` (note: the logger writes to `app-*.jsonl`, not `docatflow-*.log` as the plan text said — the grep target should be adjusted in Plan 161-06).
- **Plan 161-01 (UI) parallel with this plan:** No file overlap (`alias-routing/page.tsx` vs `stream-utils.ts`/`route.ts`/`logger.ts`), so no merge risk.
- **Open question for Plan 161-06:** The plan's verification smoke command references `/app/data/logs/docatflow-$(date +%Y-%m-%d).log` but the actual filename produced by `app/src/lib/logger.ts` is `/app/data/logs/app-$(date +%Y-%m-%d).jsonl`. Plan 161-06 should use the real path.

---
*Phase: 161-ui-enrutamiento-oracle-e2e*
*Completed: 2026-04-22*

## Self-Check: PASSED

- `app/src/lib/services/stream-utils.ts` — FOUND (modified, `completion_tokens_details?.reasoning_tokens?` present at lines 33-35).
- `app/src/lib/services/stream-utils.test.ts` — FOUND (modified, Phase 161 describe block + 4 new tests).
- `app/src/lib/logger.ts` — FOUND (modified, `'catbot-chat'` added to LogSource union).
- `app/src/app/api/catbot/chat/route.ts` — FOUND (modified, 2 `reasoning_usage` call-sites — grep count = 2).
- `app/src/app/api/catbot/chat/__tests__/route.test.ts` — FOUND (modified, VER-03 describe + 5 new tests).
- Commit `699d2cd` — FOUND in git log.
- Commit `e1d84a1` — FOUND in git log.
- Tests: 39/39 GREEN (24 stream-utils + 15 route).
- TS: no errors on scope files.
