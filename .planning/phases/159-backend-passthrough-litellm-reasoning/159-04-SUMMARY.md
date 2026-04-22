---
phase: 159-backend-passthrough-litellm-reasoning
plan: 04
subsystem: api
tags: [catbot, chat-route, alias-routing, reasoning-passthrough, litellm, vitest]

# Dependency graph
requires:
  - phase: 159-backend-passthrough-litellm-reasoning
    provides: "resolveAliasConfig({model, reasoning_effort, max_tokens, thinking_budget}) from Plan 01; streamLiteLLM StreamOptions extended with reasoning_effort + thinking from Plan 02"
provides:
  - "CatBot /api/catbot/chat route delivers resolved alias config to LiteLLM on BOTH streaming (streamLiteLLM) and non-streaming (inline fetch) paths"
  - "Symmetric 'off' sentinel handling on non-streaming body — byte-equivalent to stream-utils serialization (Pitfall #1 closed)"
  - "max_tokens resolution from cfg.max_tokens ?? 2048 — preserves historical hardcoded fallback when alias has no per-row override"
  - "__tests__/route.test.ts — first Vitest coverage for the chat route; 15+ dependency mocks + 3 describes + 8 tests targeting the narrow PASS-03/PASS-04 contract"
affects:
  - 160-catbot-self-service-tools
  - 161-ui-routing-oracle

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave-3 convergence: consumer-side migration of a single call site pulls together Plan 01 (config service) + Plan 02 (stream wire) + Plan 03 (PATCH validator) into a user-facing effect"
    - "Single-migration strategy: only the CatBot chat route consumes resolveAliasConfig; 14+ legacy callers continue using the resolveAlias shim (Pitfall #1 from research)"
    - "Byte-symmetric serialization: reasoning_effort/thinking spreads on non-streaming path match stream-utils pattern character-for-character to avoid asymmetric oracle failures"

key-files:
  created:
    - app/src/app/api/catbot/chat/__tests__/route.test.ts
  modified:
    - app/src/app/api/catbot/chat/route.ts

key-decisions:
  - "Single call-site migration: only the CatBot chat route switches from resolveAlias to resolveAliasConfig, consistent with Plan 01's back-compat shim strategy. 14+ other callers (chat-rag, agent-task, process-docs, canvas-agent, canvas-format, generate-content, etc.) keep the one-line Promise<string> shim untouched — minimal blast radius."
  - "?? over || for max_tokens fallback: cfg.max_tokens ?? 2048 (not || 2048) so a hypothetical cfg.max_tokens === 0 would not silently reset to 2048. The PATCH validator (Plan 03) already rejects 0, but defense-in-depth here matches the pattern used throughout the codebase."
  - "reasoning_effort = cfg.reasoning_effort ?? undefined explicitly collapses null to undefined because StreamOptions.reasoning_effort is typed as 'off'|'low'|'medium'|'high' (no null). Passing null would break the type check. undefined + spread-when-truthy in stream-utils is the single source of serialization truth."
  - "Test file mocks 15+ dependencies with stubs — surgical contract test, not end-to-end. Focus on what reaches streamLiteLLM and what JSON body reaches fetch. No sudo/tool/memory/complexity-gate interaction exercised — those are out of scope for PASS-03/PASS-04."
  - "createSSEStream mock returns a minimal already-closed ReadableStream so new Response(sseStream, ...) works without a full SSE simulation. The handler IIFE runs synchronously because send/close are noops — all assertions happen BEFORE any async send path is exercised."
  - "Dropped unused _event/_data parameters in the createSSEStream mock after lint flagged them: @typescript-eslint/no-unused-vars treats underscore-prefixed args as errors in this project config (unlike the default convention). Trivial fix, captured in the GREEN commit."

patterns-established:
  - "Wave-3 consumer migration pattern: config service + wire extension + PATCH validator all land first; the consumer migration pulls them together in the last wave with the thinnest possible diff (4 anchors: 1 import, 1 cfg block, 2 call sites)."
  - "Symmetric-body testing: streaming path asserted via streamLiteLLM mock.calls[0][0], non-streaming path asserted via fetch mock.calls[0][1].body JSON parse. Both use the same defaultCfg() factory — any asymmetry between paths fails both test variants."
  - "Stub-all dependencies for narrow-contract tests: when testing a single responsibility of a fat route file (740 lines), stub every import at the vi.mock boundary and exercise only the parameter-propagation path."

requirements-completed: [PASS-03, PASS-04]

# Metrics
duration: 4min
completed: 2026-04-22
---

# Phase 159 Plan 04: CatBot Chat Route Reasoning Passthrough Summary

**CatBot chat route migrates from `resolveAlias` to `resolveAliasConfig` and propagates the full alias config (model + reasoning_effort + max_tokens + thinking_budget) to LiteLLM on BOTH streaming (streamLiteLLM) and non-streaming (inline fetch) paths with byte-symmetric 'off' sentinel handling — closing PASS-03 + PASS-04.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-22T09:41:43Z
- **Completed:** 2026-04-22T09:45:20Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2 (1 created + 1 modified)

## Accomplishments

- `app/src/app/api/catbot/chat/route.ts` import changed: `resolveAlias` → `resolveAliasConfig`. Route now reads full `{model, reasoning_effort, max_tokens, thinking_budget}` config per request.
- Line ~119 block expanded: `const cfg = await resolveAliasConfig('catbot')` derives four locals: `model` (with pre-existing request/settings override chain), `reasoning_effort` (cfg value or undefined), `thinking` (built as Anthropic-native `{type:'enabled', budget_tokens}` when `cfg.thinking_budget` set, else undefined), `max_tokens` (cfg value or historical 2048 fallback).
- Streaming call site (L~199): `streamLiteLLM({model, messages, max_tokens, tools, reasoning_effort, thinking}, callbacks)` — stream-utils (Plan 02) handles `'off'` sentinel omission before the wire.
- Non-streaming call site (L~459): inline fetch body JSON includes conditional spreads for `reasoning_effort` (omitted when absent or `'off'`) and `thinking` (omitted when undefined), plus resolved `max_tokens`. Byte-symmetric with stream-utils serialization to prevent asymmetric oracle failures.
- New test file `app/src/app/api/catbot/chat/__tests__/route.test.ts` (first ever Vitest coverage for this route, 300 lines): mocks 15+ dependencies + 3 describes covering PASS-04 (migration), PASS-03 (max_tokens resolution), BC (model override precedence).
- 8 tests pass (PASS-04a..e + PASS-03a..b + BC-a).
- `npm run lint` exit 0 (after fixing two `@typescript-eslint/no-unused-vars` errors in the test createSSEStream stub).
- `npm run build` exit 0 (type-check green, route symbols resolved).
- Wave 0 deliverable satisfied: the chat route gains a test file per 159-VALIDATION.md requirement.

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1: Failing tests (RED)** — `1d73b68` (test)
2. **Task 2: Route migration (GREEN)** — `c6955a5` (feat)

_No REFACTOR commit — diff surgical across 4 anchors, already clean._

## Files Created/Modified

- `app/src/app/api/catbot/chat/__tests__/route.test.ts` (**new**, 300 lines) — 15+ vi.mock blocks for all route imports; helpers `makeReq()`, `defaultCfg()`, `getStreamOptions()`; 3 describes (PASS-04 / PASS-03 / BC) with 8 tests.
- `app/src/app/api/catbot/chat/route.ts` (modified, 4 anchors) — import swap (L11); alias config derivation block (L119); streamLiteLLM call (L~199); inline fetch body (L~459).

## Decisions Made

- **Single call-site migration** — locks the Pitfall #1 strategy from research. Only the CatBot chat route consumes `resolveAliasConfig`; all 14+ other callers keep the Promise<string> shim Plan 01 preserved. Zero blast radius for the rest of the codebase.
- **`??` fallback for max_tokens** — `cfg.max_tokens ?? 2048` preserves the pre-existing hardcoded fallback when the row has no per-alias override. Avoids a silent reset-to-2048 on a hypothetical `max_tokens === 0` (PATCH validator already rejects, belt+braces here).
- **`reasoning_effort = cfg.reasoning_effort ?? undefined`** — StreamOptions doesn't accept null; converting at the route boundary keeps stream-utils's spread-when-truthy pattern as single source of truth.
- **Stream-utils handles 'off' omission** — route forwards `'off'` verbatim to streamLiteLLM; stream-utils's existing `options.reasoning_effort !== 'off'` guard (Plan 02) omits it from the wire. Non-streaming path re-implements the same `&& reasoning_effort !== 'off'` spread condition byte-symmetric because there's no intermediate layer to hold the sentinel.
- **Surgical contract test** — tests target what values reach `streamLiteLLM` and what JSON body reaches `fetch`. No tool-loop, sudo, memory, or complexity-gate behavior exercised. This matches Phase 159 scope (OUTBOUND request construction) and defers full flow coverage to Phase 161 oracle.
- **Drop unused arrow params after lint** — `_event` / `_data` underscore prefix not honored by this project's ESLint config (no-unused-vars treats them as errors). Removed entirely since the stub is a noop; faster than adding the eslint-disable comment.

## Deviations from Plan

None — plan executed as written.

Four anchors edited exactly per the plan's `<action>` block (import swap, cfg block, streaming call, non-streaming body). Test file structure matches the plan's sketch verbatim modulo two safe tightenings:

1. `_event` / `_data` parameters dropped from the `createSSEStream` mock's `send` function — the plan sketch had them as underscore-prefixed placeholders; this project's lint config rejects underscore-prefixed unused vars, so they were removed (the stub is a noop anyway).
2. No substantive test-logic changes — all 8 tests land with the exact assertions the plan specified.

## Issues Encountered

- **Pre-existing test failures (10 total) unrelated to this plan.** `npm run test:unit` shows 10 failures across 3 files:
  - `alias-routing.test.ts > seedAliases` ×3 — Phase 140 added 3 canvas semantic aliases unconditionally; tests still expect 7-row shape. Logged in `deferred-items.md` by Plan 01.
  - `task-scheduler.test.ts` ×5 — Pre-existing, also noted in Plan 02 Summary under "Issues Encountered".
  - `catbot-holded-tools.test.ts` ×2 — Pre-existing, also noted in Plan 02 Summary.
  All 10 were verified pre-existing via Plan 01 and Plan 02 summaries. Not caused by this plan. Out of scope per SCOPE BOUNDARY rule.
- **Lint errors in initial test file** — `@typescript-eslint/no-unused-vars` flagged `_event` and `_data` in the createSSEStream mock. Not a project skill-documented quirk; repo config treats all unused args as errors regardless of underscore prefix. Fixed inline (Rule 3: blocking issue directly caused by current task).

## User Setup Required

None.

The route change is invisible to the HTTP contract — the request body schema and response schema are unchanged. Only the outbound body to LiteLLM now carries reasoning_effort/thinking/max_tokens when the `catbot` alias row has those columns populated. A user who has never PATCH-ed the catbot alias sees no behavior change (all three columns default NULL → reasoning_effort omitted, thinking omitted, max_tokens falls back to 2048).

## Next Phase Readiness

- **Phase 160 (CatBot Self-Service Tools):** Ready. Will implement `list_llm_models` / `get_catbot_llm` / `set_catbot_llm` tools that leverage this chat route as the downstream consumer. When the user (via sudo) changes the catbot alias config through the `set_catbot_llm` tool (which PATCHes `/api/alias-routing`), the NEXT chat request resolves the new config and the reasoning_effort/thinking/max_tokens flow through this plan's changes to LiteLLM.
- **Phase 161 (UI Enrutamiento + Oracle):** Ready. Oracle verification VER-01..03 (list capabilities, sudo-change to opus+high, next request uses reasoning) becomes possible now that the full chain is wired: PATCH validator (Plan 03) → DB (Plan 01 extended updateAlias) → resolveAliasConfig (Plan 01) → chat route (this plan) → streamLiteLLM/fetch → LiteLLM gateway → Claude/Gemini reasoning. Phase 161 can add the UI + tool + final end-to-end assertion without touching any of these four plans.
- **CatBot oracle verification (CLAUDE.md requirement):** DEFERRED to Phase 161 VER-01..03. This plan IMPLEMENTS the oracle capability (user can demonstrate "cambia catbot a opus con reasoning high via sudo" and next request uses reasoning) but does not VERIFY end-to-end because (a) there's no CatBot tool yet to mutate the alias (Phase 160), (b) no UI surfacing of reasoning metadata (Phase 161), (c) no LiteLLM gateway smoke against live Anthropic/Gemini endpoints (Phase 161 VER-03). Documented here for Phase 161 to pick up.
- **LiteLLM gateway readiness:** Verified 2026-04-21 — gateway supports Anthropic reasoning_effort translation + Gemini 2.5 Pro thinking pass-through. No new infrastructure needed.

## Self-Check: PASSED

Verified via filesystem + git:

- `app/src/app/api/catbot/chat/route.ts` exists — verified (modified, contains `resolveAliasConfig` import at L11 and `const cfg = await resolveAliasConfig('catbot')` at L120).
- `app/src/app/api/catbot/chat/__tests__/route.test.ts` exists — verified (new file, 3 describes, 8 tests).
- Commit `1d73b68` (test RED) — verified via `git log --oneline`.
- Commit `c6955a5` (feat GREEN) — verified via `git log --oneline`.
- `grep resolveAlias app/src/app/api/catbot/chat/route.ts` returns ONLY `resolveAliasConfig` (2 matches, L11 import + L120 call) — no unused `resolveAlias` symbol.
- Vitest: 8 new tests PASS on the target file, 0 failures (suite-level 10 pre-existing failures unrelated to this plan).
- `npm run build` exit 0 (type-check green, all routes compile).
- `npm run lint` exit 0 (no new warnings, no errors).

---
*Phase: 159-backend-passthrough-litellm-reasoning*
*Plan: 04 — catbot-chat-route*
*Completed: 2026-04-22*
