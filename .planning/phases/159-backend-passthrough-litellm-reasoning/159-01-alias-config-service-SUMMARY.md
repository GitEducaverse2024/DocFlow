---
phase: 159-backend-passthrough-litellm-reasoning
plan: 01
subsystem: api
tags: [alias-routing, reasoning-config, litellm, backward-compat, vitest, typescript]

# Dependency graph
requires:
  - phase: 158-model-catalog-capabilities-alias-schema
    provides: "3 new NULL-default columns in model_aliases (reasoning_effort, max_tokens, thinking_budget)"
provides:
  - "resolveAliasConfig(alias): Promise<AliasConfig> as parallel API exposing the full reasoning config per alias"
  - "AliasConfig public interface {model, reasoning_effort, max_tokens, thinking_budget}"
  - "AliasRowV30 public interface extending AliasRow with the 3 v30.0 columns"
  - "updateAlias(alias, modelKey, opts?) with optional third arg for persisting reasoning columns"
  - "resolveAlias(alias): Promise<string> preserved as a one-line shim delegating to resolveAliasConfig"
affects:
  - 159-02-stream-utils-passthrough
  - 159-03-patch-validator
  - 159-04-catbot-chat-route
  - catbot-tools
  - settings-page-alias-editor

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Parallel-function back-compat: keep string-returning function as a shim over the new object-returning function"
    - "Null-safe config builder closure (makeCfg) reused across fallback branches to guarantee NULL→null preservation"
    - "Opts-driven branching UPDATE SQL: legacy path when opts undefined, extended path when opts present — isolates callers that never needed the new columns"

key-files:
  created: []
  modified:
    - app/src/lib/services/alias-routing.ts
    - app/src/lib/services/__tests__/alias-routing.test.ts

key-decisions:
  - "Parallel-function over breaking change: introduced resolveAliasConfig side-by-side instead of changing resolveAlias return type, locking back-compat for 15+ existing callers per research Pitfall #1"
  - "Fallback carries row's reasoning config even when the model changes: documented behavior where a same-tier alt model inherits the original alias's effort/max_tokens/thinking_budget (consumers must re-validate capabilities if strict)"
  - "updateAlias opts branches SQL shape: callers without opts hit the unchanged legacy UPDATE; only opts-aware callers (Plan 02 PATCH) hit the extended 4-column UPDATE — minimizes blast radius"
  - "Pre-existing seedAliases test drift (3 failures) deferred to a separate maintenance task via deferred-items.md — out of scope for 159-01 per SCOPE BOUNDARY rule"

patterns-established:
  - "Back-compat shim: one-line Promise<T> function delegating to new Promise<Config> function for identical fallback semantics"
  - "Null-safe config projection: `row?.field ?? null` inside a closure so every return branch uses the same mapping"
  - "Dual-arity updater via optional opts: legacy 2-arg callers untouched, extended 3-arg callers opt into new columns"

requirements-completed: [CFG-03]

# Metrics
duration: 5min
completed: 2026-04-22
---

# Phase 159 Plan 01: Alias Config Service Summary

**`resolveAliasConfig` returns full `{model, reasoning_effort, max_tokens, thinking_budget}` object with per-alias reasoning config, while `resolveAlias` stays as a byte-identical `Promise<string>` shim for 15+ existing callers; `updateAlias` gains optional `opts` arg for persisting the 3 Phase 158 columns.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-22T09:25:56Z
- **Completed:** 2026-04-22T09:30:53Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Added `AliasConfig` public interface `{model, reasoning_effort, max_tokens, thinking_budget}` — the contract consumed by Plan 02 (stream-utils passthrough) and Plan 04 (catbot chat route).
- Added `AliasRowV30` public interface extending `AliasRow` with the three Phase 158 columns; used internally to cast the `SELECT *` result.
- Implemented `resolveAliasConfig(alias): Promise<AliasConfig>` reusing the exact same 4-step fallback chain as legacy `resolveAlias` (Discovery lookup → same-tier MID fallback for chat aliases → env fallback → error). Row's reasoning config carries through same-tier fallbacks.
- Refactored `resolveAlias(alias): Promise<string>` into a one-line shim `return (await resolveAliasConfig(alias)).model;` — all 15+ callers (chat-rag, agent-task, process-docs, canvas-agent, canvas-format, catbot, generate-content, etc.) keep working byte-identical.
- Extended `updateAlias(alias, newModelKey, opts?)` with optional third arg carrying the 3 reasoning fields. Legacy 2-arg callers hit the unchanged UPDATE SQL; opts-aware callers (Plan 02 PATCH) hit an extended 4-column UPDATE. Logger now includes the opts fields when present.
- 8 new Vitest tests (CFG-03a..h) GREEN covering: row→config mapping, NULL→null preservation, same-tier fallback carrying row config, env fallback with null reasoning, embed alias special case, back-compat shim return type, legacy updateAlias SQL shape, extended updateAlias SQL shape with param values.
- Zero regressions in the 22 pre-existing passing tests of `alias-routing.test.ts`.

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1: Extend tests (RED)** — `db5986d` (test)
2. **Task 2: Implement resolveAliasConfig + extended updateAlias (GREEN)** — `0a55389` (feat)

_Note: no REFACTOR commit — implementation was already minimal (shim delegation + closure reuse)._

## Files Created/Modified

- `app/src/lib/services/alias-routing.ts` — Added `AliasConfig` + `AliasRowV30` interfaces; added `resolveAliasConfig` (full-object fallback chain with null-safe `makeCfg` closure); refactored `resolveAlias` into one-line shim; extended `updateAlias` with optional opts arg + branched UPDATE SQL.
- `app/src/lib/services/__tests__/alias-routing.test.ts` — Added helper `makeAliasRowV30()`; added 3 describe blocks (`resolveAliasConfig`, `resolveAlias (shim back-compat)`, `updateAlias with opts`) with 8 tests covering CFG-03a..h.
- `.planning/phases/159-backend-passthrough-litellm-reasoning/deferred-items.md` — Created to log 3 pre-existing `seedAliases` test failures as out-of-scope (Phase 140 added 3 always-run canvas semantic aliases but the tests were never updated).

## Decisions Made

- **Parallel-function over breaking change** (research Pitfall #1 locked this upfront). Changing `resolveAlias` return type would cascade-break 14 call-sites + 7 test mocks. Shim delegation keeps the blast radius at zero.
- **Fallback carries row's reasoning config** (research Open Question 1). When Discovery is down and we fall back to a same-tier alt model, we preserve the original alias's `reasoning_effort`/`max_tokens`/`thinking_budget`. Documented explicitly in the function comment: consumers re-validate capabilities if they need strict compatibility. Simpler than the alternative (re-resolving capabilities from `model_intelligence` per fallback), avoids adding a DB lookup to the hot path.
- **updateAlias opts branches SQL shape**. Legacy `updateAlias(alias, modelKey)` hits the pre-existing 2-placeholder UPDATE unchanged; `updateAlias(alias, modelKey, opts)` hits a 5-placeholder UPDATE that writes the 3 new columns. This way, any caller that never needed reasoning config (14+ call-sites) continues to write the exact same SQL string, so DB query plans / audits / explain logs stay stable.
- **Pre-existing seedAliases failures out of scope.** Reproduced on a pristine stash-pop to confirm they predate 159-01. Documented in `deferred-items.md` with the root-cause (Phase 140 adds 3 canvas semantic aliases unconditionally but tests still expect the original 8-row shape).

## Deviations from Plan

None — plan executed exactly as written.

All test code, interface shapes, SQL shapes, and function signatures match the plan's `<action>` block verbatim. The one minor tightening (not a deviation): the plan's Task 1 proposed a specific mock-implementation sketch using conditional-sql branching; the implementation kept the exact same shape but uses a cleaner spread for `run/get/all` vi.fn stubs. Pure test-plumbing, no behavioral change.

## Issues Encountered

- **Parallel 159-02 executor landed commit `a68b56b` between my Task 1 and Task 2 commits.** It only touches `app/src/lib/services/stream-utils.ts`, no conflict with my `alias-routing.ts` edits. Verified by checking `git log` before committing Task 2. No rebase needed.
- **3 `seedAliases` tests failing on entry to this plan** — reproduced on clean stash, confirmed pre-existing. Logged to `deferred-items.md`. Not blocking: they test `seedAliases`, which this plan does not touch.

## User Setup Required

None — no external service configuration required. All changes are pure TypeScript + SQL, landing in the same service file. Database schema was already extended in Phase 158 (three NULL-default columns on `model_aliases`).

## Next Phase Readiness

- **Plan 02 (stream-utils passthrough):** Already landed in `a68b56b` — reads `AliasConfig` shape from callers (not from `resolveAliasConfig` directly, by design). The public contract this plan defines is consumable.
- **Plan 03 (PATCH validator):** Ready. Will consume the extended `updateAlias(alias, modelKey, opts)` signature to persist reasoning config when user changes alias config via Settings PATCH.
- **Plan 04 (catbot chat route):** Ready. Will migrate the single call site `app/api/catbot/chat/route.ts:321` from `resolveAlias` to `resolveAliasConfig` and forward the resolved fields to `streamLiteLLM`.
- **Verification via CatBot oracle (CLAUDE.md):** Deferred to Plan 04 when the end-to-end loop is live — `resolveAliasConfig` is a library function not directly exercisable via a CatBot tool until the chat route consumes it.

## Self-Check: PASSED

- `app/src/lib/services/alias-routing.ts` exists — verified.
- `app/src/lib/services/__tests__/alias-routing.test.ts` exists — verified.
- `.planning/phases/159-backend-passthrough-litellm-reasoning/deferred-items.md` exists — verified.
- Commit `db5986d` (test) — verified via `git log --oneline`.
- Commit `0a55389` (feat) — verified via `git log --oneline`.
- 8 CFG-03 tests PASSED (`npx vitest run -t "CFG-03|resolveAlias \(shim|updateAlias with opts"` → 8 passed / 25 skipped / 0 failed).
- Existing 22 passing tests of `alias-routing.test.ts` still GREEN (regression ran clean; only 3 pre-existing `seedAliases` failures remain, documented as out of scope).
- `npm run build` → "✓ Compiled successfully" (type-check GREEN).
- `npm run lint` → exit 0, no new warnings (only pre-existing no-img/exhaustive-deps warnings unrelated to this plan).

---
*Phase: 159-backend-passthrough-litellm-reasoning*
*Plan: 01 — alias-config-service*
*Completed: 2026-04-22*
