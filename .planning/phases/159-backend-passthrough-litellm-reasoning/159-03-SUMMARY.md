---
phase: 159-backend-passthrough-litellm-reasoning
plan: 03
subsystem: api
tags: [alias-routing, patch-validator, capability-check, reasoning-config, vitest, typescript]

# Dependency graph
requires:
  - phase: 159-backend-passthrough-litellm-reasoning
    plan: 01
    provides: "updateAlias(alias, modelKey, opts?) with optional third arg for persisting reasoning columns"
  - phase: 158-model-catalog-capabilities-alias-schema
    provides: "model_intelligence.supports_reasoning + max_tokens_cap (consumed by PATCH cross-table capability validator)"
provides:
  - "PATCH /api/alias-routing validator that rejects malformed reasoning config at the HTTP boundary"
  - "Cross-table capability check (supports_reasoning, max_tokens_cap) against TARGET model_key before persisting"
  - "Graceful degradation when capability row is absent (log warn + skip, consistent with Phase 158 null-enriched pattern)"
  - "Byte-identical legacy path for pre-Phase 159 clients (body without the 3 new fields)"
affects:
  - 159-04-catbot-chat-route
  - 160-catbot-self-service-tools (set_catbot_llm will call this endpoint)
  - settings-page-alias-editor (Phase 161 UI extends payload with the 3 fields)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "HasOwnProperty-based extended-body detection: body presence (even explicit null) activates extended path, preserving legacy byte-identical behavior"
    - "Ordered fail-fast validation: type guards first, cross-relation second, cross-table capability last (minimizes DB queries on invalid input)"
    - "Graceful-degradation capability lookup: try/catch around SELECT + undefined row check both degrade to skip + warn"

key-files:
  created: []
  modified:
    - app/src/app/api/alias-routing/route.ts
    - app/src/app/api/alias-routing/__tests__/route.test.ts

key-decisions:
  - "HasOwnProperty gate over truthiness: `body.reasoning_effort === null` activates extended path (CFG-02j reset semantics); truthiness would silently route null-reset to legacy path"
  - "Capability lookup inside try/catch AND undefined-row check: two graceful-degradation layers; the try/catch handles table-absent cold starts, the undefined-row check handles model_key not yet seeded (STATE.md namespace-mismatch blocker)"
  - "'off' semantic is DocFlow-internal for reasoning_effort: permitted on non-reasoning models (CFG-02i) since stream-utils boundary (Plan 02) translates it to field-omission before the wire"
  - "Cap lookup targets TARGET model_key (not current alias row): per research Pitfall #6 — validator must reason about the post-update state, not pre-update, otherwise a config legal under old model and illegal under new model slips through"

patterns-established:
  - "Validator ordering: shape (type guards) -> relation (cross-field) -> capability (cross-table). Reorder breaks fast-fail economics"
  - "Legacy-path preservation via body-shape detection: zero-diff behavior for 1-arg-PATCH clients guaranteed by the `isExtended` branch"
  - "Null-enriched capability skipping: missing row -> warn + skip is the same pattern Phase 158 used for /api/models enrichment (consistency across v30.0)"

requirements-completed: [CFG-02]

# Metrics
duration: 3min
completed: 2026-04-22
---

# Phase 159 Plan 03: Patch Validator Summary

**PATCH /api/alias-routing now validates `reasoning_effort` (enum), `max_tokens` (positive int), and `thinking_budget` (positive int with max_tokens-dependency) against both request-shape invariants and the cross-table `model_intelligence` capability row — rejecting 400s before the config hits the DB, falling back to skip+warn when the capability row is absent, and preserving byte-identical legacy behavior for body shapes without the 3 new fields.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-22T09:34:43Z
- **Completed:** 2026-04-22T09:37:38Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Added mock of `@/lib/db` (mockDbPrepare + mockDbGet) to route.test.ts — new isolation primitive for capability lookup tests.
- Added `makeCapRow(overrides)` fixture helper — consistent shape `{ supports_reasoning: 1, max_tokens_cap: 32000 }` across all 12 new tests.
- Added 12 new Vitest tests (CFG-02a..l) covering: valid persist, invalid enum rejection, capability conflict (non-reasoning model), max_tokens cap exceeded, thinking_budget>max_tokens, thinking_budget without max_tokens, non-integer / non-positive max_tokens (4 sub-cases), non-integer / non-positive thinking_budget (3 sub-cases), `reasoning_effort='off'` on non-reasoning model (allowed), explicit null reset (all 3 fields), graceful degradation on missing capability row, back-compat legacy body.
- Extended PATCH handler in `route.ts` with full validator chain: type guards -> cross-relation -> cross-table capability (wrapped in try/catch for table-absent + undefined-row check for row-absent).
- Added `import db from '@/lib/db'` — new dependency for capability lookup.
- Legacy path preserved byte-identical: body without any of the 3 new fields calls `updateAlias(alias, model_key)` with exactly 2 args (CFG-02l assertion passes).
- Extended path persists via `updateAlias(alias, model_key, { reasoning_effort, max_tokens, thinking_budget })` — opts passed verbatim when the body contains at least one of the 3 fields (even explicit null triggers extended path for reset semantics).
- 20/20 tests in `route.test.ts` GREEN (8 legacy + 12 new CFG-02).
- `npm run lint` exit 0 (only pre-existing unrelated warnings).
- `npm run build` exit 0 (type-check PASS).

## Task Commits

Each task was committed atomically (TDD RED -> GREEN):

1. **Task 1: Extend tests with CFG-02 cases (RED)** — `aa01bed` (test)
2. **Task 2: Implement PATCH validator extended (GREEN)** — `5e104ff` (feat)

_Note: no REFACTOR commit — implementation matched the plan's action block minimally; no cleanup needed._

## Files Created/Modified

- `app/src/app/api/alias-routing/route.ts` — Added `import db from '@/lib/db'`; added `REASONING_ENUM` set + `isPositiveInt` type guard; rewrote PATCH handler with hasOwnProperty-based extended-body detection, 5 type-guard validations, try/catch-wrapped capability SELECT, undefined-row graceful-degradation branch, capability-match validations (reasoning support, max_tokens cap), and branched persistence (legacy 2-arg vs extended 3-arg updateAlias).
- `app/src/app/api/alias-routing/__tests__/route.test.ts` — Added `vi.mock('@/lib/db')` with `mockDbGet`/`mockDbPrepare` fns; added `makeCapRow` fixture helper; added `describe('PATCH — Phase 159 fields (CFG-02)')` with 12 tests covering every rejection path + happy path + back-compat + graceful-degradation.

## Decisions Made

- **HasOwnProperty gate for extended-path detection** (over truthiness check). Explicit `null` in the body must route to the extended path to support CFG-02j (reset semantics: `{ alias, model_key, reasoning_effort: null, max_tokens: null, thinking_budget: null }` calls `updateAlias` with opts containing 3 nulls, letting Plan 01's SQL shape write NULLs to the row). A truthiness check would silently route this to legacy path and fail the reset.
- **Two-layer graceful degradation for capability lookup**. Outer try/catch handles the rare "table doesn't exist" cold-start case (e.g. bootstrap race, migration lag); the undefined-row check handles the common "model_key not yet seeded" case (STATE.md flagged the namespace-mismatch blocker where LiteLLM shortcut aliases don't match fully-qualified `model_intelligence.model_key`). Both degrade identically: `logger.warn` + skip validation + proceed to persist. This matches Phase 158's null-enriched pattern in `/api/models`.
- **`'off'` sentinel permitted on non-reasoning models** (CFG-02i). The reasoning-support check explicitly excludes `reasoning_effort === 'off'` because `'off'` is a DocFlow-internal sentinel that Plan 02 stream-utils translates to field-omission before the wire. A user configuring `'off'` on a non-reasoning model is expressing "don't send reasoning params" — which is always valid. Only `'low' | 'medium' | 'high'` require capability match.
- **Cap lookup targets TARGET model_key, not alias row**. Research Pitfall #6 required this: the validator must reason about the post-update state. If a user switches alias from Opus (32k cap) to Gemma (8k cap) and also lowers `max_tokens` to 16k, the validator must check against Gemma's 8k cap (target) — not Opus's 32k (pre-update) — so the request legally fails with "exceeds model cap (8192)". Checking pre-update would let the stale 32k limit permit a config that crashes at runtime.
- **Validator ordering: shape -> relation -> capability.** Fast-fail on cheap checks first (type guards are synchronous, cross-relation is a comparison, capability lookup hits DB). On a stream of invalid inputs the validator never touches the DB. This also means the error messages degrade naturally: bad types surface `"max_tokens must be a positive integer or null"` before a more-specific cap message that presumes a valid integer.

## Deviations from Plan

None — plan executed exactly as written.

All test code, error message regex patterns, capability lookup SQL, validator ordering, and commit messages match the plan's `<action>` blocks verbatim. The one minor tightening (not a deviation): the plan's error message for the cap-exceeded case reads `"max_tokens (99999) exceeds model cap (32000)"` which matches the test regex `/max_tokens.*32000|cap/i` exactly; I kept the parenthesized format verbatim from the plan.

## Issues Encountered

- **Parallel commit `a457cd7` (docs 159) landed before Task 1.** No conflict — docs-only commit on `.planning/`, my task edits `app/src/app/api/alias-routing/`. Git status confirmed clean in my working area before Task 1.
- **3 pre-existing `seedAliases` test failures (documented in Plan 01's `deferred-items.md`) still failing during regression check.** Verified identical failures (same 3 test names: "inserts 8 aliases", "is idempotent", "seeds 7 chat aliases"). Not blocking — they test `seedAliases`, which this plan does not touch. Test count: 30 passed / 3 failed (same as post-Plan 01 state).
- **`/api/alias-routing` route tests have no pre-existing `@/lib/db` mock.** Added one (as specified in plan Task 1). Verified it doesn't leak to other test files (file-scoped `vi.mock` per Vitest semantics).

## User Setup Required

None — pure backend validation with no external service dependencies, no schema changes (Phase 158 already landed the required columns), no env var changes. The endpoint is immediately live after deploy: existing Settings UI (Phase 161 will extend payload) keeps working, new extended payloads are accepted with full validation.

## Verification via CatBot Oracle (CLAUDE.md)

Deferred to Phase 161 oracle — `PATCH /api/alias-routing` is not directly exercisable via a CatBot tool in this plan. Phase 160 will add `set_catbot_llm` tool that calls this endpoint; Phase 161 oracle prompt ("cambia mi modelo a Opus con reasoning alto") will verify end-to-end:

- CatBot calls `set_catbot_llm` with `{ model_key: 'anthropic/claude-opus-4-6', reasoning_effort: 'high', max_tokens: 8000, thinking_budget: 4000 }`.
- Tool PATCHes `/api/alias-routing` with the payload.
- Validator (this plan) checks enum + ints + capability cross-table -> persists via `updateAlias` (Plan 01).
- Next CatBot request resolves via `resolveAliasConfig('catbot')` (Plan 01) -> forwards to `streamLiteLLM` with `reasoning_effort` + `thinking` body (Plan 02) -> LiteLLM gateway translates and returns reasoning_content.

Until Phase 160/161 land, verify manually with curl:

```bash
# Invalid enum -> 400
curl -s -X PATCH http://localhost:3500/api/alias-routing \
  -H 'Content-Type: application/json' \
  -d '{"alias":"catbot","model_key":"anthropic/claude-opus-4-6","reasoning_effort":"extreme"}'

# Valid config -> 200
curl -s -X PATCH http://localhost:3500/api/alias-routing \
  -H 'Content-Type: application/json' \
  -d '{"alias":"catbot","model_key":"anthropic/claude-opus-4-6","reasoning_effort":"high","max_tokens":8000,"thinking_budget":4000}'
```

## Next Phase Readiness

- **Plan 04 (catbot chat route):** Ready. Will migrate `app/api/catbot/chat/route.ts` from `resolveAlias` -> `resolveAliasConfig` (Plan 01) and forward the resolved fields to `streamLiteLLM` (Plan 02). This plan (03) is orthogonal to Plan 04 — they converge at the DB: Plan 03 writes via PATCH, Plan 04 reads via resolveAliasConfig.
- **Plan 01 dependency confirmed:** `updateAlias(alias, model_key, opts)` signature from `alias-routing.ts` consumed correctly by PATCH handler — 2-arg legacy calls + 3-arg extended calls both reach the expected SQL paths.
- **Phase 160 tools:** `set_catbot_llm` will construct the payload for this endpoint — the 5 validator rejections documented here (enum, int shape, cross-relation, capability conflict, cap exceeded) become the 5 user-facing error messages CatBot must surface to the user.

## Self-Check: PASSED

- `app/src/app/api/alias-routing/route.ts` modified — verified via `git log --oneline -2` showing 5e104ff feat commit.
- `app/src/app/api/alias-routing/__tests__/route.test.ts` modified — verified via `git log --oneline -2` showing aa01bed test commit.
- Commit `aa01bed` (test) — verified: `test(159-03): add failing tests for PATCH validator (CFG-02)`.
- Commit `5e104ff` (feat) — verified: `feat(159-03): extend PATCH /api/alias-routing with capability validation`.
- 20/20 tests in `route.test.ts` GREEN: 8 legacy (2 GET + 6 PATCH legacy) + 12 new CFG-02a..l.
- Regression on `src/lib/services/__tests__/alias-routing.test.ts` = 30 passed / 3 failed (same 3 pre-existing `seedAliases` failures from Plan 01's `deferred-items.md` — identical count + names, verified no new failures introduced).
- `npm run lint` exit 0 (no new warnings introduced; only pre-existing canvas/templates/process warnings).
- `npm run build` exit 0 ("✓ Compiled successfully" — type-check PASS with new `db` import + cap type cast).

---
*Phase: 159-backend-passthrough-litellm-reasoning*
*Plan: 03 — patch-validator*
*Completed: 2026-04-22*
