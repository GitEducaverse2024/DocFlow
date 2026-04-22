---
phase: 161-ui-enrutamiento-oracle-e2e
plan: 07
subsystem: api
tags: [catbot, alias-routing, litellm, resolveAliasConfig, model-resolution, gap-closure]

# Dependency graph
requires:
  - phase: 159-backend-passthrough-litellm-reasoning
    provides: "resolveAliasConfig('catbot'): Promise<AliasConfig> — source of truth under v30.0 (PASS-01)"
  - phase: 160-catbot-self-service-tools
    provides: "set_catbot_llm tool writes alias via PATCH /api/alias-routing (TOOL-03)"
  - phase: 161-ui-enrutamiento-oracle-e2e (plans 01-06)
    provides: "Live oracle UAT surfacing Gap A at route.ts:121 (161-06-UAT.md)"
provides:
  - "Fixed model-resolution priority at app/src/app/api/catbot/chat/route.ts:121 — alias wins over legacy catbot_config.model"
  - "4-case regression suite locking the Gap A contract in route.test.ts"
  - "Docker smoke evidence: curl to /api/catbot/chat returns claude-opus reply when alias=claude-opus and catbot_config.model='gemini-main' coexist"
affects:
  - "Phase 161-08 (Gap B reasoning_usage logger silent) — unblocks reproduction because Gemini HTTP 400 no longer masks the logger issue"
  - "v30.1 roadmap: catbotConfig.model read is now effectively dead code but kept as defense-in-depth per decision rationale"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inverted-priority resolution chain: per-request override > alias config > legacy settings row"
    - "SQL-aware vi.doMock pattern for @/lib/db with per-describe mock reinstall via vi.resetModules"

key-files:
  created: []
  modified:
    - "app/src/app/api/catbot/chat/route.ts — line 121 inverted priority + type assertion"
    - "app/src/app/api/catbot/chat/__tests__/route.test.ts — +213 lines, 4 new Gap A cases"

key-decisions:
  - "Option 1 (priority inversion) chosen over Option 2 (dual-write in set_catbot_llm) and Option 3 (remove catbot_config.model entirely) — surgical 1-line change respects v30.0 alias-as-source-of-truth contract"
  - "Type assertion `(requestedModel || cfg.model || catbotConfig.model) as string` preserves narrowing because TS infers `string | undefined` from trailing `catbotConfig.model` but runtime contract guarantees non-null (cfg.model always seeded by AliasConfig)"
  - "catbotConfig.model kept as defense-in-depth tail rather than removed; dead-code cleanup deferred to v30.1"
  - "VER-03 stays Partial in REQUIREMENTS.md — 161-08 must close Gap B before flipping to Complete"

patterns-established:
  - "SQL-branch db mock: when a route reads different settings rows, use vi.doMock('@/lib/db', ...) with `prepare(sql)` branching inside a describe block instead of extending the shared mockDbGet"

requirements-completed: []  # VER-03 remains Partial — Gap B blocks Complete status, routed to 161-08

# Metrics
duration: ~5.5 min
completed: 2026-04-22
---

# Phase 161 Plan 07: Gap A — invertir prioridad modelo alias > catbot_config Summary

**Inverted model-resolution chain at `catbot/chat/route.ts:121` from `requestedModel || catbotConfig.model || cfg.model` to `requestedModel || cfg.model || catbotConfig.model` so `set_catbot_llm`'s alias config wins over the stale legacy settings row, plus 4-case regression suite and Docker smoke evidence.**

## Performance

- **Duration:** ~5.5 min
- **Started:** 2026-04-22T13:22:45Z
- **Completed:** 2026-04-22T13:28:14Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Gap A closed: alias config (cfg.model from resolveAliasConfig) now shadows legacy catbot_config.model at route.ts:121
- 4 regression tests lock the contract (streaming + non-streaming alias-wins cases, per-request override preservation, defensive fallback guard)
- Full route.test.ts suite GREEN (19/19) — zero regression on pre-existing PASS-03, PASS-04, BC, TOOL-03 sudo, VER-03 logger suites
- `npm run build` succeeds locally (added type assertion keeps TS happy)
- Docker rebuild + smoke curl: CatBot reply received with `catbot_config.model='gemini-main'` AND `model_aliases[catbot].model_key='claude-opus'` coexisting in DB — definitive proof that the alias wins

## Task Commits

Each task committed atomically following TDD flow:

1. **Task 1 — RED:** `4cb9326` (test: add Gap A regression tests for alias-priority contract) — 4 new cases, 2 RED against old priority (cases 1+2 as expected per plan), 2 GREEN both sides (case 3 per-request override topmost, case 4 defensive guard)
2. **Task 2 — GREEN:** `7a7a87a` (fix: invert model-resolution priority so alias wins over legacy catbot_config) — 4/4 Gap A GREEN, 19/19 route suite GREEN, build passes, Docker smoke confirmed

_Note: TDD REFACTOR step omitted — the fix is 1 logical line + comment + type assertion, no structural cleanup needed._

## Files Created/Modified

- `app/src/app/api/catbot/chat/route.ts` — inverted `||` chain at line 121, added explanatory comment and `as string` type assertion (cfg.model guaranteed non-null per AliasConfig interface)
- `app/src/app/api/catbot/chat/__tests__/route.test.ts` — appended `describe('Gap A: alias-config must win over legacy catbot_config.model', ...)` block with 4 cases + SQL-aware db mock pattern via `vi.doMock('@/lib/db', ...)` inside a `vi.resetModules()` beforeEach

## Grep Proof

```bash
$ grep -n "cfg.model || catbotConfig.model" app/src/app/api/catbot/chat/route.ts
127:    const model: string = (requestedModel || cfg.model || catbotConfig.model) as string;
```

Single match at line 127 (moved from 121 because the block now has 3 explanatory comment lines above it).

## Test Evidence

**Task 1 (RED):**
```
Test Files  1 failed | 3 skipped (4)
     Tests  2 failed | 2 passed | 52 skipped (56)

FAIL Gap A > streaming: cfg.model wins when catbot_config.model is a different stale value
  AssertionError: expected 'gemini-main' to be 'claude-opus'

FAIL Gap A > non-streaming: cfg.model wins when catbot_config.model is a different stale value
  AssertionError: expected 'gemini-main' to be 'claude-opus'
```

**Task 2 (GREEN — Gap A filter):**
```
Test Files  1 passed | 3 skipped (4)
     Tests  4 passed | 52 skipped (56)
```

**Task 2 (full route suite — regression check):**
```
Test Files  1 passed (1)
     Tests  19 passed (19)
```

## Docker Smoke Evidence

Pre-fix baseline (from 161-06-UAT.md): `/api/catbot/chat` returned HTTP 400 with `litellm.UnsupportedParamsError: Cannot specify both 'thinking' and 'thinking_level' ... Received Model Group=gemini-main` despite alias being set to claude-opus.

Post-fix smoke (2026-04-22T13:27):

**DB state at moment of test:**
```
catbot_config.value = {"model":"gemini-main", ...}   ← legacy settings row PERSISTS with gemini-main
model_aliases[catbot] = {"alias":"catbot","model_key":"claude-opus","reasoning_effort":"high","max_tokens":32000,"thinking_budget":16000}
```

**Smoke request (no explicit model override):**
```bash
curl -s -X POST http://localhost:3500/api/catbot/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"di OK"}],"useStream":false}'
```

**Response:**
```json
{"reply":"OK 🐱\n\n¿En qué puedo ayudarte?","tool_calls":[],"actions":[],"tokens":{"input":26296,"output":39},"sudo_required":false,"sudo_active":false}
```

Reply is a normal CatBot acknowledgement (NOT the previous `Model Group=gemini-main` 400 error). The 26296 input-token footprint matches the Opus prompt-assembler output (instructions + skill injection + history) — not Gemini's smaller footprint. Confirmed: alias config wins, legacy row bypassed.

## Decisions Made

1. **Option 1 over 2/3** — priority inversion chosen because it's the root-cause fix (resolution order was backwards). Option 2 (dual-write) treats symptoms and leaves `/settings` UI as a divergent write path. Option 3 (delete `catbot_config.model`) breaks the Settings UI model dropdown for users without sudo. Option 1 respects the v30.0 invariant "alias is source of truth for CatBot's model" locked in Phase 159-01 CONTEXT.

2. **Type assertion rather than restructure** — the old chain typed clean because `cfg.model` was last (always non-null). Inverting makes TypeScript see `string | undefined` from `catbotConfig.model`. Rather than refactor `AliasConfig` or add a runtime guard, used `as string` with inline comment documenting the runtime guarantee. Zero performance impact, zero behavioral change, preserves defense-in-depth.

3. **catbotConfig.model kept as fallback tail** — although cfg.model is always non-null in practice (resolveAliasConfig seeds defaults), keeping the legacy fallback costs nothing and protects against a hypothetical future refactor of resolveAliasConfig that might return undefined. Dead-code cleanup deferred to v30.1.

4. **VER-03 stays Partial** — per orchestrator's success criteria, VER-03 needs BOTH Gap A (this plan) AND Gap B (161-08) closed before the requirement flips to Complete. REQUIREMENTS.md traceability unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Added TypeScript type assertion to preserve string narrowing**
- **Found during:** Task 2 (GREEN phase, `npm run build` step)
- **Issue:** After inverting the `||` chain, TypeScript inferred `model` as `string | undefined` because the new trailing term `catbotConfig.model` is typed `string | undefined`. This broke downstream usage (`streamLiteLLM({model, ...})` expects `string`). The old chain typed clean because `cfg.model` (typed `string`) was last and dominated the inference.
- **Fix:** Added `as string` assertion with explanatory comment documenting that `cfg.model` is guaranteed non-null at runtime per the `AliasConfig` interface contract (resolveAliasConfig seeds defaults). Alternative refactors (guard clause, default-to-empty-string) were rejected as more invasive and semantically wrong.
- **Files modified:** `app/src/app/api/catbot/chat/route.ts` (line 127 + 3 comment lines above)
- **Verification:** `npm run build` succeeds; all 19 route tests GREEN; Docker rebuild succeeds; smoke curl behaves correctly.
- **Committed in:** `7a7a87a` (part of Task 2 fix commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking)
**Impact on plan:** Necessary for build correctness. No scope creep. The `as string` preserves the plan's intent (cfg.model wins over legacy tail) without changing behavior.

## Issues Encountered

None beyond the documented Rule 3 deviation. The plan's test scaffold pattern (describe/beforeEach with vi.doMock + vi.resetModules) worked on the first attempt; no infrastructure adjustments needed.

The plan document's line 177 claim that cases (1)(2)(3) should all fail RED was slightly inaccurate: case (3) tests per-request `model` override, which is the leftmost term in BOTH the old chain (`requestedModel || catbotConfig.model || cfg.model`) AND the new chain (`requestedModel || cfg.model || catbotConfig.model`), so it passes GREEN on both sides. The plan's earlier line 164 description ("Case (4) passes even on the old code ... so it's a pure regression guard") implicitly acknowledges this pattern. My execution matched the corrected reading: 2 RED (cases 1+2) / 2 GREEN regression guards (cases 3+4) on Task 1, all 4 GREEN after Task 2 fix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Gap B unblocked:** With Gap A closed, the LiteLLM Gemini HTTP 400 collision no longer masks the `reasoning_usage` logger silence from Phase 161-03. Plan 161-08 can now reproduce Gap B deterministically by sending a reasoning-capable prompt to the Opus-routed CatBot and observing whether `app-*.jsonl` receives the expected `logger.info('catbot-chat', 'reasoning_usage', {...})` entries.
- **Next plan:** 161-08 (Gap B diagnostic + fix). Depends on 161-07 landing. Shared file: `app/src/app/api/catbot/chat/route.ts`.
- **VER-03 traceability:** Remains Partial in REQUIREMENTS.md. Will flip to Complete only when 161-08 delivers observable reasoning_usage evidence from the live oracle.
- **Milestone v30.0:** Still 18/21 requirements Complete. Gap A closure moves VER-03 from "2 blockers" to "1 blocker (Gap B)" — milestone close still contingent on 161-08.

## Self-Check: PASSED

**Files verified present:**
- FOUND: app/src/app/api/catbot/chat/route.ts (line 127 contains inverted chain)
- FOUND: app/src/app/api/catbot/chat/__tests__/route.test.ts (Gap A describe block present)
- FOUND: .planning/phases/161-ui-enrutamiento-oracle-e2e/161-07-SUMMARY.md (this file)

**Commits verified:**
- FOUND: 4cb9326 (Task 1 RED)
- FOUND: 7a7a87a (Task 2 GREEN)

**Tests verified:**
- 4/4 Gap A tests GREEN
- 19/19 route.test.ts suite GREEN (zero regression)
- npm run build GREEN

**Docker smoke verified:**
- Alias `catbot` → claude-opus (via PATCH)
- catbot_config.model = "gemini-main" (legacy row persists)
- POST /api/catbot/chat returned valid reply (no HTTP 400, no gemini collision)

---
*Phase: 161-ui-enrutamiento-oracle-e2e*
*Completed: 2026-04-22*
