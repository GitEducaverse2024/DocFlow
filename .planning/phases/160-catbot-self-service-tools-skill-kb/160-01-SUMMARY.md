---
phase: 160-catbot-self-service-tools-skill-kb
plan: 01
subsystem: testing
tags: [vitest, catbot, llm-self-service, wave-0, red-tests, tdd]

requires:
  - phase: 158-model-catalog-capabilities-alias-schema
    provides: model_intelligence columns (supports_reasoning, max_tokens_cap, tier) + model_aliases columns (reasoning_effort, max_tokens, thinking_budget)
  - phase: 159-backend-passthrough-litellm-reasoning
    provides: resolveAliasConfig + PATCH /api/alias-routing validator + streamLiteLLM reasoning passthrough
provides:
  - Wave 0 RED tests scaffolding TOOL-01 (list_llm_models) behavior
  - Wave 0 RED tests scaffolding TOOL-02 (get_catbot_llm) behavior
  - Wave 0 RED tests scaffolding TOOL-03 (set_catbot_llm PATCH delegation + sudo gate)
  - Wave 0 RED tests scaffolding TOOL-04 (Operador de Modelos skill seed + PromptAssembler P1)
  - Enhanced createSSEStream mock that captures SSE events (sseEvents array) for streaming sudo tests
affects: [160-02-read-tools, 160-03-set-catbot-llm, 160-04-operador-skill]

tech-stack:
  added: []
  patterns:
    - "Wave 0 RED test scaffolding: every TOOL-0x requirement has a pre-existing failing test pointing at domain assertion (not import error) — Wave 1+ plans can cite `-t \"TOOL-01: list_llm_models\"` filters with confidence"
    - "SSE event capture in vi.mock for createSSEStream: `sseEvents.push({event, payload})` array allows streaming-path assertions without spinning up real ReadableStream"
    - "Dual-path sudo-gate test pattern: same tool_call synthesis for streaming (onToolCall callback) + non-streaming (choices[0].message.tool_calls) — identical domain assertions on both transport shapes"

key-files:
  created:
    - app/src/lib/__tests__/catbot-tools-model-self-service.test.ts (307 lines)
    - app/src/lib/__tests__/db-seeds.test.ts (83 lines)
  modified:
    - app/src/lib/__tests__/catbot-prompt-assembler.test.ts (+40 lines; modelos_protocol nested describe)
    - app/src/app/api/catbot/chat/__tests__/route.test.ts (+127 lines; TOOL-03 sudo gate describe + SSE capture)

key-decisions:
  - "Test isolation: catbot-tools-model-self-service.test.ts mocks @/lib/db with in-memory row fixtures (2 models: opus Elite supports_reasoning=1, gemma Libre supports_reasoning=0, is_local=1) mirroring the CONTEXT.md is_local=INTEGER decision from Phase 158. Avoids touching real docflow.db"
  - "db-seeds.test.ts hoists DATABASE_PATH (not CATBOT_DB_PATH) — db.ts reads DATABASE_PATH for the main DB; mixing this up is a common trap (flagged in existing kb-tools-integration.test.ts:7 comment)"
  - "PromptAssembler extension uses vi.resetModules() + vi.doMock() + dynamic import inside each it() to reset module state between the two modelos_protocol cases (injected vs null) without cross-contaminating other 80 pre-existing tests"
  - "route.test.ts SSE capture made shared (top-level sseEvents array with beforeEach reset) rather than per-describe scoped — enables future Wave 1+ tests to reuse the same capture without re-declaring the mock"
  - "set_catbot_llm sudo gate test does NOT use parameterize-with-update_alias_routing pattern — update_alias_routing has no existing test in route.test.ts (contrary to RESEARCH.md line 921 hint), and duplicating its absent scaffold would break the Wave 0 single-responsibility principle"

patterns-established:
  - "Wave 0 RED smoke-check protocol: run target file immediately after Write, confirm failures are `AssertionError` on domain values (e.g. 'expected undefined to be defined'), never `Cannot find module` — if import error appears, fix mocks before commit"
  - "Always-allowed tool test asymmetry: list_* / get_* tools need only a single 'visible when allowedActions=[]' assertion since startsWith('list_')/startsWith('get_') gate is trivial; mutation tools need 3 cases (gated-out, gated-in, permissive-default)"

requirements-completed: []

# Metrics
duration: ~4min
completed: 2026-04-22
---

# Phase 160 Plan 01: Wave 0 Test Scaffolds Summary

**14 RED Vitest cases describing TOOL-01/02/03/04 contracts landed as `<automated>` verify targets for Wave 1+ plans (160-02..04), with zero pre-existing regression.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-22T10:39:24Z
- **Completed:** 2026-04-22T10:43:29Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 extended)

## Accomplishments

- 14 new failing test cases across 4 test files, all RED for domain reasons (tool not registered, skill row undefined, PromptAssembler section absent, sudo branch missing) — zero import failures
- Every VALIDATION.md Per-Task Verification Map entry (W0-01..04 + 160-01..07) now resolves to an existing `-t "name"` filter; Wave 1+ plans can reference them in `<automated>` blocks without guesswork
- SSE event capture infrastructure added to route.test.ts — unblocks streaming-path assertions for all future CatBot chat route tests, not just Phase 160

## Task Commits

Each task was committed atomically:

1. **Task 1: Create catbot-tools-model-self-service.test.ts (TOOL-01/02/03 + visibility)** — `664ae9f` (test)
2. **Task 2: Create db-seeds.test.ts + extend prompt-assembler + route.test.ts (TOOL-04 + TOOL-03 sudo)** — `5276c61` (test)

**Plan metadata:** pending (final commit after STATE/ROADMAP updates)

## Files Created/Modified

- `app/src/lib/__tests__/catbot-tools-model-self-service.test.ts` (NEW, 307 lines) — 9 test cases across 4 describes: TOOL-01 (3), TOOL-02 (1), TOOL-03 (2), getToolsForLLM visibility (3). Mocks @/lib/db, alias-routing, discovery, mid, health, holded-tools, template-renderer, template-asset-resolver, catbot-learned, logger. Synthesizes 2 model rows (opus Elite + gemma Libre) to exercise tier + reasoning filters.
- `app/src/lib/__tests__/db-seeds.test.ts` (NEW, 83 lines) — 2 TOOL-04 seed assertions + 1 infrastructure sanity check. Hoists DATABASE_PATH to tmpdir so db.ts bootstraps cleanly.
- `app/src/lib/__tests__/catbot-prompt-assembler.test.ts` (EXTENDED, +40 lines) — new nested `describe('modelos_protocol section (Phase 160)')` inside existing `PromptAssembler > build()`. 2 cases: injection-when-present (RED) + absence-when-null (GREEN trivially). Uses vi.resetModules + vi.doMock + dynamic import per-case for module isolation.
- `app/src/app/api/catbot/chat/__tests__/route.test.ts` (EXTENDED, +127 lines) — SSE capture added to createSSEStream mock (backward compatible); new top-level `describe('TOOL-03: set_catbot_llm sudo gate (Phase 160)')` with 2 RED cases (streaming + non-streaming). Synthesizes LLM tool_call via onToolCall (streaming) / choices[0].message.tool_calls (non-streaming).

## Decisions Made

- **DATABASE_PATH vs CATBOT_DB_PATH**: db-seeds.test.ts hoists `DATABASE_PATH` because `app/src/lib/db.ts:6` reads `DATABASE_PATH` for the main docflow DB; `CATBOT_DB_PATH` is for catbot.db. Mixing these up is a common test failure mode (flagged as a comment in kb-tools-integration.test.ts). Followed the kb-hooks-tools.test.ts pattern.
- **vi.resetModules per-test for PromptAssembler**: The two modelos_protocol cases need contradictory mocks for `getSystemSkillInstructions('Operador de Modelos')` — one returns a stub, one returns null. vi.resetModules + vi.doMock inside each it() gives each case a fresh module graph without polluting the 80 pre-existing tests in the same file.
- **SSE capture made file-global**: rather than scoped to the new describe, the `sseEvents` array lives at module scope with beforeEach reset in the new describe. This lets Wave 1+ oracle tests (Phase 161 VER-01..03) reuse the same mock infrastructure.
- **9+5 split instead of 11 exactly**: plan `<done>` wanted "≥9 test cases" for Task 1 and specified 11 behaviors total. Delivered 10 Task 1 cases (one trivially passes because the tool-to-hide is correctly absent when absent) and 5 new Task 2 cases (2 seed + 1 injection + 1 absence-trivial + 2 sudo-gate), totaling 15 cases / 14 RED. Over-delivered on count; all 11 target behaviors covered verbatim.
- **No changes to tools source**: per plan's explicit CRITICAL note, did NOT add list_llm_models / get_catbot_llm / set_catbot_llm handlers to catbot-tools.ts — that's Wave 1+ work. Tests fail cleanly today so Wave 1+ has a visible green signal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SSE event capture added to shared createSSEStream mock**
- **Found during:** Task 2 Part C (extending route.test.ts for sudo gate)
- **Issue:** Existing `createSSEStream` mock replaced `send` with a no-op, preventing the streaming-path sudo test from observing the `tool_call_result` event that the route emits. Without capture, the streaming test could not distinguish "branch exists but SUDO_REQUIRED" from "branch does not exist" — both produce no observable output.
- **Fix:** Enhanced the mock to push `{event, payload}` into a shared `sseEvents` array. The array is `length = 0`-reset in the new describe's beforeEach. Pre-existing PASS-03/PASS-04/BC tests don't inspect SSE events so the change is backward compatible (verified: 8/8 pre-existing still green).
- **Files modified:** app/src/app/api/catbot/chat/__tests__/route.test.ts
- **Verification:** All 8 pre-existing route tests still GREEN after the mock change; 2 new sudo tests RED with "expected toolResultEvent to be defined" (the domain assertion we want).
- **Committed in:** 5276c61 (Task 2 commit)

**2. [Rule 3 - Blocking] DATABASE_PATH hoist in db-seeds.test.ts**
- **Found during:** Task 2 Part A
- **Issue:** plan's db-seeds.test.ts skeleton only hoisted `CATBOT_DB_PATH`, but `skills` lives in the main docflow.db (governed by `DATABASE_PATH`), not catbot.db. Without the right env var, the test would bootstrap against production `data/docflow.db` — a hazard.
- **Fix:** Added `process['env']['DATABASE_PATH'] = ...` alongside `CATBOT_DB_PATH` in the vi.hoisted block.
- **Files modified:** app/src/lib/__tests__/db-seeds.test.ts
- **Verification:** `skills` table exists in the bootstrapped tmp DB (sanity test GREEN); seed row absent (target tests RED as expected).
- **Committed in:** 5276c61 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary for tests to function correctly. SSE capture fix unblocks all streaming-path assertions (benefits Phase 161 oracle too). DATABASE_PATH fix prevents accidental production DB mutation — defensive hygiene. No scope creep.

## Issues Encountered

- RESEARCH.md (line 921) hinted that route.test.ts already had an `update_alias_routing` sudo test to mirror — it does NOT. The existing test file covers only PASS-03/PASS-04 migration (Phase 159). Solution: wrote the sudo gate test from scratch using the existing LLM-mock pattern (synthesizing tool_calls via streamLiteLLM callbacks and fetch-mock for non-streaming).
- PromptAssembler's `build()` is NOT imported lazily in the existing test file — it's imported at top-level. To swap `getSystemSkillInstructions` per-case, had to use `vi.resetModules() + vi.doMock() + dynamic import('../services/catbot-prompt-assembler')` inside each `it()`. Worked cleanly; no interference with the other 80 tests.

## Full Wave 0 State

### RED Test Count (target: ≥11, delivered: 14)

| File | New cases | RED | GREEN (trivial) |
|------|-----------|-----|-----------------|
| catbot-tools-model-self-service.test.ts | 10 | 9 | 1 (set_catbot_llm absent from gated allowedActions — correct by absence) |
| db-seeds.test.ts | 3 | 2 | 1 (infrastructure sanity — skills table exists) |
| catbot-prompt-assembler.test.ts | 2 | 1 | 1 (absence when skill returns null — correct by absence) |
| route.test.ts | 2 | 2 | 0 |
| **Total** | **17** | **14** | **3** |

### Baseline Shift Verification

- Pre-160-01 baseline failures: 10 (task-scheduler × 5, alias-routing seedAliases × 3, catbot-holded-tools × 2 — all pre-existing, unrelated, deferred)
- Post-160-01 failures: 24 (10 pre-existing + 14 new Phase 160)
- Delta: +14 exactly matches new Phase 160 RED count → **zero pre-existing test regression**

### Wave 1+ Continuation Points

Every Wave 1+ plan's `<automated>` verify can now cite these `-t` filters with confidence the test exists:

- `160-02` list_llm_models: `-t "TOOL-01: list_llm_models"` (3 cases)
- `160-02` get_catbot_llm: `-t "TOOL-02: get_catbot_llm"` (1 case)
- `160-03` set_catbot_llm: `-t "TOOL-03: set_catbot_llm"` (2 cases)
- `160-03` sudo gate: `-t "set_catbot_llm without sudo"` (2 cases)
- `160-03` visibility: `-t "getToolsForLLM visibility"` (4 cases)
- `160-04` seed: `-t "Operador de Modelos skill"` (2 cases)
- `160-04` PromptAssembler: `-t "modelos_protocol"` (2 cases)

## Self-Check: PASSED

**Files created:**
- FOUND: /home/deskmath/docflow/app/src/lib/__tests__/catbot-tools-model-self-service.test.ts
- FOUND: /home/deskmath/docflow/app/src/lib/__tests__/db-seeds.test.ts

**Files modified:**
- FOUND: /home/deskmath/docflow/app/src/lib/__tests__/catbot-prompt-assembler.test.ts (modelos_protocol section present)
- FOUND: /home/deskmath/docflow/app/src/app/api/catbot/chat/__tests__/route.test.ts (TOOL-03 sudo gate present)

**Commits:**
- FOUND: 664ae9f (test(160-01): add failing Wave 0 tests for TOOL-01/02/03 + visibility)
- FOUND: 5276c61 (test(160-01): add failing Wave 0 tests for TOOL-04 seed + PromptAssembler P1 + TOOL-03 sudo gate)

**RED state verification:**
- 14 new failures confirmed via `npm run test:unit` on the 4 Wave 0 files
- 0 pre-existing test regression confirmed via baseline delta check (10 → 24 = +14 exactly matches new count)

## Next Phase Readiness

- **160-02 (list_llm_models + get_catbot_llm)**: RED tests ready. Implementer edits `app/src/lib/services/catbot-tools.ts` until `-t "TOOL-01: list_llm_models"` and `-t "TOOL-02: get_catbot_llm"` turn GREEN.
- **160-03 (set_catbot_llm sudo-gated)**: RED tests ready. Implementer adds the handler + the chat route's `toolName === 'set_catbot_llm' && !sudoActive` sudo branch until all `-t "set_catbot_llm"` / `-t "getToolsForLLM visibility"` / `-t "TOOL-03"` cases turn GREEN.
- **160-04 (Operador de Modelos skill)**: RED tests ready. Implementer adds (a) INSERT OR IGNORE skill row in db.ts and (b) `modelos_protocol` P1 section in catbot-prompt-assembler.ts until `-t "Operador de Modelos skill"` + `-t "modelos_protocol injected"` turn GREEN.
- **No blockers**: all Phase 158/159 dependencies already shipped; Wave 0 tests don't need any code deps to be RED for domain reasons.

---
*Phase: 160-catbot-self-service-tools-skill-kb*
*Completed: 2026-04-22*
