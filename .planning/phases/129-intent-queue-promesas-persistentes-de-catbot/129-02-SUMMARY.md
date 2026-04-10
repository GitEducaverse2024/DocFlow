---
phase: 129-intent-queue-promesas-persistentes-de-catbot
plan: 02
subsystem: catbot-runtime
tags: [catbot, intents, background-worker, prompt-assembler, llm-driven-retry]

requires:
  - phase: 129-intent-queue-promesas-persistentes-de-catbot
    plan: 01
    provides: getRetryableIntents, updateIntentStatus, abandonIntent, listIntentsByUser, IntentRow

provides:
  - IntentWorker singleton (BOOT_DELAY=45s, CHECK_INTERVAL=5min, MAX_ATTEMPTS=3)
  - IntentWorker.start()/stop()/tick() with LLM-driven retry semantics
  - buildIntentProtocol() P1 section (797 chars, under Libre 800 budget)
  - buildOpenIntentsContext(userId) P2 section (user-scoped, empty when no open intents)
  - PromptContext extended with optional userId field
  - instrumentation.ts registration of IntentWorker after AlertService
  - knowledge tree concept + howto for intent protocol in settings.json

affects:
  - 129-03 (AlertService integration + knowledge gap auto-log) — can consume existing worker/protocol stack

tech-stack:
  added: []
  patterns:
    - "LLM-driven retry via re-queue (worker flips failed→pending, LLM sees on next turn via buildOpenIntentsContext)"
    - "BOOT_DELAY staggering (45s) to avoid startup I/O contention with AlertService (30s)"
    - "vi.hoisted tmp DB pattern in prompt-assembler tests to isolate from production catbot.db"
    - "Source-grep assertion (tests read intent-worker.ts string and assert absence of executeTool)"

key-files:
  created:
    - app/src/lib/services/intent-worker.ts
    - app/src/lib/__tests__/intent-worker.test.ts
  modified:
    - app/src/instrumentation.ts
    - app/src/lib/services/catbot-prompt-assembler.ts
    - app/src/lib/__tests__/catbot-prompt-assembler.test.ts
    - app/src/app/api/catbot/chat/route.ts
    - app/src/lib/logger.ts
    - app/data/knowledge/settings.json

key-decisions:
  - "IntentWorker NEVER re-executes tools — retry is LLM-driven via buildOpenIntentsContext surfacing re-queued intents"
  - "BOOT_DELAY=45s to stagger after AlertService (30s) avoiding startup I/O collision"
  - "Intent protocol trimmed to 797 chars (under 800 Libre budget) via abbreviated headings and compact tool args"
  - "buildOpenIntentsContext uses context.userId with 'web:default' fallback for cross-user isolation"
  - "vi.hoisted pre-import env var override isolates prompt-assembler tests from production catbot.db"
  - "Source-grep test pattern adopted for anti-pattern enforcement (executeTool absence)"

patterns-established:
  - "Background worker tick with per-intent try/catch isolation so one failing intent doesn't kill the tick"
  - "LogSource union extension required for every new service logger.source string"
  - "PromptAssembler sections registered inside try/catch inside build() for graceful degradation"

requirements-completed:
  - INTENT-02
  - INTENT-04

duration: 32min
completed: 2026-04-10
---

# Phase 129 Plan 02: IntentWorker + PromptAssembler Intent Protocol Summary

**Background IntentWorker re-queues failed intents for LLM-driven retry, and PromptAssembler surfaces both the Intent Protocol instructions and open intents so the retry loop closes on the user's next conversation turn.**

## Performance

- **Duration:** ~32 min
- **Started:** 2026-04-10T14:34:05Z
- **Completed:** 2026-04-10T15:06:25Z
- **Tasks:** 3 (all TDD Wave 0)
- **Files touched:** 7 (2 created, 5 modified)
- **Tests passing:** 77/77 across 4 affected test files (intent-worker, catbot-prompt-assembler, catbot-intents, knowledge-tools-sync)

## Accomplishments

- **IntentWorker singleton** (`app/src/lib/services/intent-worker.ts`, 102 lines): static `start/stop/tick`, BOOT_DELAY=45s, CHECK_INTERVAL=5min, MAX_ATTEMPTS=3
- **LLM-driven retry guarantee:** source-grep test asserts `executeTool` is never referenced in intent-worker.ts
- **instrumentation.ts:** IntentWorker registered via dynamic import immediately after AlertService (same skip-in-test-env gate)
- **buildIntentProtocol():** 797-char P1 section mentioning all 5 intent tools, knowledge-gap escalation rule (INTENT-05), and explicit negative examples ("NO crees intent para consultas simples list_*, get_*, navegacion ni preguntas de plataforma")
- **buildOpenIntentsContext(userId):** P2 section that fetches up to 3 pending + 3 in_progress intents per user and renders them as a markdown bullet list; returns empty string when there are none (section skipped in build())
- **PromptContext.userId added**: route.ts now passes `userId` into `buildPrompt()` so Open Intents is scoped correctly to the current user (cross-user isolation verified in tests)
- **Test isolation:** `vi.hoisted` block in `catbot-prompt-assembler.test.ts` sets `CATBOT_DB_PATH` to a tmp dir **before** the assembler module loads, so the 44 prompt-assembler tests never touch production `catbot.db` anymore
- **logger LogSource union** extended with `'intent-worker'` (build failed without it — caught by `npm run build`, fixed before final commit)
- **Knowledge tree:** `settings.json` gained an `intent_protocol` concept + a howto entry describing the lifecycle so CatBot itself can explain the feature via `query_knowledge`

## Task Commits

1. **Task 1: Wave 0 failing tests (RED)** — `b06bb36` (test)
2. **Task 2: IntentWorker + instrumentation registration (GREEN for INTENT-04)** — `c168410` (feat)
3. **Task 3: buildIntentProtocol + buildOpenIntentsContext + wiring (GREEN for INTENT-02)** — `7d6a220` (feat)

_Plan metadata commit: pending (final state/roadmap update)_

## How the Retry Loop Closes

```
failure -> status='failed' -> (background) IntentWorker.tick() -> status='pending', attempts++
                                                                        |
                                                                        v
user's next turn -> route.ts builds prompt -> buildOpenIntentsContext(userId)
                                                                        |
                                                                        v
                                                   "## Intents abiertos\n- [id] request ..."
                                                                        |
                                                                        v
                                                   LLM sees, decides whether to resume / retry tools
                                                                        |
                                                                        v
                                         on success -> update_intent_status(completed)
                                         on repeat fail -> status='failed' (worker will re-queue again)
                                         on 3rd attempt -> worker calls abandonIntent
```

No tool is ever re-executed by code. The worker is a pure state machine; CatBot is the retry engine.

## Intent Protocol Byte Budget

| Metric | Value |
|--------|-------|
| Final length | **797 chars** (778 without trailing newline, 797 with heading + body) |
| Budget ceiling | 800 chars (Libre tier, Phase 126 convention) |
| Headroom | 3 chars (tight — no further additions possible without trimming) |

**Text adjustments made to fit under 800:**
- Original draft (980 chars) included verbose "Cuando crear un intent" bullet list with full tool signatures and Spanish prepositions
- Trimmed: removed redundant "Peticion" prefix, compacted tool args `{original_request,parsed_goal,steps}` without spaces, shortened headings (`### Cuando crear` instead of `### Cuando crear un intent`, `### Ciclo` instead of `### Ciclo de vida`), dropped leading "Peticion" qualifier in multi-paso bullet
- Negative examples kept (Pitfall 8) but condensed to one line
- Knowledge-gap rule preserved verbatim (INTENT-05 requirement)
- All 5 tool names still present for grep-based coverage

## Decisions Made

- **No executeTool import in intent-worker.ts** (enforced by a test that reads the file source and asserts no match) — this is the single most important invariant of the plan; guarantees LLM-driven retry cannot silently regress into double-execution bugs
- **BOOT_DELAY=45s staggers after AlertService (30s)** per research Pattern 5; keeps startup WAL contention predictable
- **`getRetryableIntents` call wrapped in try/catch with early return**, separate from per-intent try/catch; DB errors log and skip the tick cleanly instead of bubbling into tick's outer `.catch`
- **Abandon condition `intent.attempts + 1 >= MAX_ATTEMPTS`** means an intent with attempts=2 will be abandoned on the very next tick rather than re-queued to attempts=3 (bumping to 3 would make the worker re-pick it immediately since the getRetryableIntents predicate is `attempts < max`)
- **Prompt-assembler test isolation via vi.hoisted** (not `beforeAll`) because the assembler's static `import { listIntentsByUser }` evaluates at module load — which happens before any describe/beforeAll runs; `vi.hoisted` is the only reliable way to set env vars before module graph materialization
- **`userId` added as optional field on PromptContext** with `'web:default'` fallback inside build() — preserves backward compatibility for any internal caller that doesn't pass userId, while giving route.ts a hook to scope Open Intents properly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Missing `'intent-worker'` entry in `LogSource` union**
- **Found during:** Task 3 final `npm run build` step
- **Issue:** `logger.info('intent-worker', ...)` failed type check because `LogSource` union in `app/src/lib/logger.ts` didn't include the new source name. Tests passed (vitest doesn't type-check), but `next build` did.
- **Fix:** Added `| 'intent-worker'` to the union in `app/src/lib/logger.ts`
- **Files modified:** `app/src/lib/logger.ts`
- **Committed in:** `7d6a220`

**2. [Rule 3 — Blocking] Prompt-assembler tests touched production catbot.db**
- **Found during:** First run of extended Task 3 tests — vitest log showed `"path":"/home/deskmath/docflow/app/data/catbot.db"` because the assembler now imports `listIntentsByUser` which triggers catbot-db init at module load, **before** any `beforeAll` env setup could run.
- **Fix:** Wrapped env var override in `vi.hoisted(() => { ... })` using CJS `require('path')/require('fs')/require('os')` so it runs before module imports. Next run showed `"path":"/tmp/prompt-assembler-test-*/catbot-test.db"`, confirming isolation.
- **Files modified:** `app/src/lib/__tests__/catbot-prompt-assembler.test.ts`
- **Committed in:** `7d6a220`

**3. [Rule 3 — Blocking] settings.json JSON parse error after concept insertion**
- **Found during:** Task 3 `knowledge-tools-sync.test.ts` run
- **Issue:** My first Edit to settings.json concepts array inadvertently swallowed the closing `]` of `concepts` because the old_string ended at `...compacto" | ...` without preserving the `],` sentinel. The file became invalid JSON and the KTREE-02 sync test failed with `Expected ',' or ']'`.
- **Fix:** Re-added the `],` after the new intent_protocol concept entry. Verified with `node -e "JSON.parse(fs.readFileSync(...))"` then re-ran full test suite.
- **Files modified:** `app/data/knowledge/settings.json`
- **Committed in:** `7d6a220`

**Total deviations:** 3 auto-fixed (all Rule 3 blocking, all caught and fixed before commit).

## Verification Matrix

| Check | Command | Result |
|-------|---------|--------|
| IntentWorker state machine | `npx vitest run src/lib/__tests__/intent-worker.test.ts` | 10/10 PASS |
| PromptAssembler + intent sections | `npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts` | 44/44 PASS |
| Existing intents CRUD untouched | `npx vitest run src/lib/__tests__/catbot-intents.test.ts` | 19/19 PASS (not regressed) |
| KTREE-02 bidirectional sync | `npx vitest run src/lib/__tests__/knowledge-tools-sync.test.ts` | 4/4 PASS |
| No executeTool in worker | `grep executeTool app/src/lib/services/intent-worker.ts` | 0 matches |
| Docker build | `cd app && npm run build` | PASS (warnings are pre-existing, not from this plan) |

## Issues Encountered

- **settings.json is gitignored** (`app/data` path), so both this commit and Plan 01's commit required `git add -f`. Not a bug, just friction — pre-existing condition.
- **Pre-existing log noise:** `db.ts` migration error `"table catbrains has 23 columns but 18 values were supplied"` and missing services modules (`./services/mid`, `./services/alias-routing`) appear in the test log. Out of scope per CLAUDE.md scope boundary.
- **Unused `vi` import warning** never materialized because vi is used inside `vi.hoisted()`.

## User Setup Required

None. IntentWorker starts automatically 45s after Next.js boot via `instrumentation.ts`. The prompt sections are live the moment a chat request passes through `route.ts` with a userId.

## Next Phase Readiness

- **Plan 03 (AlertService integration + knowledge gap auto-log):** READY. `countUnresolvedIntents` was exported in Plan 01, and the AlertService tick check pattern is documented in RESEARCH.md Pattern 6. No work in Plan 02 blocks Plan 03.
- **CatBot CLAUDE.md verification required:** Per the project's "CatBot como Oráculo" protocol, Plan 03 (or the phase UAT) should ask CatBot "¿Qué es el protocolo de intents?" and verify it can explain the lifecycle via `query_knowledge` against settings.json → the concept/howto we added should surface.

## Self-Check: PASSED

- `app/src/lib/services/intent-worker.ts` — FOUND (102 lines, contains `class IntentWorker`)
- `app/src/lib/__tests__/intent-worker.test.ts` — FOUND (179 lines, 10 tests)
- `app/src/instrumentation.ts` contains `IntentWorker.start` — FOUND
- `app/src/lib/services/catbot-prompt-assembler.ts` contains `buildIntentProtocol` — FOUND
- `app/src/lib/services/catbot-prompt-assembler.ts` contains `buildOpenIntentsContext` — FOUND
- `app/data/knowledge/settings.json` contains `intent_protocol` — FOUND
- `grep -n executeTool app/src/lib/services/intent-worker.ts` — 0 matches (invariant holds)
- commit `b06bb36` — FOUND
- commit `c168410` — FOUND
- commit `7d6a220` — FOUND
- `npx vitest run intent-worker + catbot-prompt-assembler + catbot-intents + knowledge-tools-sync` — 77/77 PASS
- `npm run build` — PASS

---
*Phase: 129-intent-queue-promesas-persistentes-de-catbot*
*Completed: 2026-04-10*
