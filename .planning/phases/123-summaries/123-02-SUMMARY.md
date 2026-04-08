---
phase: 123-summaries
plan: 02
subsystem: catbot
tags: [instrumentation, catbot-tools, summaries, scheduler]

requires:
  - phase: 123-summaries-01
    provides: SummaryService with compressDaily/Weekly/Monthly and getSummaries DB helper
provides:
  - SummaryService auto-start registration in instrumentation.ts
  - CatBot list_my_summaries and get_summary tools for user-facing summary queries
affects: [catbot-chat, telegram-bot]

tech-stack:
  added: []
  patterns: [instrumentation-service-registration, catbot-tool-definition]

key-files:
  created: []
  modified:
    - app/src/instrumentation.ts
    - app/src/lib/services/catbot-tools.ts
    - app/src/lib/logger.ts
    - app/src/lib/services/catbot-summary.ts

key-decisions:
  - "list_my_summaries and get_summary use existing get_/list_ prefix pattern for always_allowed permission"
  - "Fixed Plan 01 build issues: LogSource type and Set spread compatibility (Rule 3)"

patterns-established:
  - "Service registration in instrumentation.ts: dynamic import + try-catch + console.error with [instrumentation] prefix"

requirements-completed: [SUMMARY-01, SUMMARY-02, SUMMARY-03, SUMMARY-04, SUMMARY-05]

duration: 5min
completed: 2026-04-08
---

# Phase 123 Plan 02: Instrumentation + CatBot Tools Summary

**SummaryService auto-start via instrumentation.ts and CatBot tools list_my_summaries/get_summary for user-facing summary queries**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-08T17:08:49Z
- **Completed:** 2026-04-08T17:13:20Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- SummaryService registered in instrumentation.ts with try-catch, auto-starts on app boot (skipped in test env)
- CatBot can list summaries filtered by period type with formatted output (topics, decision count)
- CatBot can show full summary detail including topics, tools used, decisions, and pending items
- Fixed 3 pre-existing build issues from Plan 01 (LogSource type, Set spread compatibility)

## Task Commits

Each task was committed atomically:

1. **Task 1: Register SummaryService in instrumentation.ts** - `64eceda` (feat)
2. **Task 2: CatBot tools list_my_summaries and get_summary** - `f2cb3b4` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `app/src/instrumentation.ts` - Added SummaryService.start() registration after TelegramBotService
- `app/src/lib/services/catbot-tools.ts` - Added list_my_summaries and get_summary tool definitions and executeTool cases
- `app/src/lib/logger.ts` - Added 'SummaryService' to LogSource union type (Rule 3 fix)
- `app/src/lib/services/catbot-summary.ts` - Fixed Set spread to Array.from() for TS target compatibility (Rule 3 fix)

## Decisions Made
- Both tools use existing `list_`/`get_` prefix patterns, automatically allowed by permission gate (no gate changes needed)
- Fixed Plan 01 build issues inline since they blocked build verification

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] LogSource type missing 'SummaryService'**
- **Found during:** Task 2 (build verification)
- **Issue:** catbot-summary.ts uses `logger.info('SummaryService', ...)` but LogSource type in logger.ts did not include 'SummaryService'
- **Fix:** Added 'SummaryService' to LogSource union type
- **Files modified:** app/src/lib/logger.ts
- **Verification:** Build passes
- **Committed in:** f2cb3b4 (Task 2 commit)

**2. [Rule 3 - Blocking] Set spread incompatible with TS target**
- **Found during:** Task 2 (build verification)
- **Issue:** `[...new Set(...)]` and `[...setVariable]` patterns in catbot-summary.ts fail with TS target < es2015 / no downlevelIteration
- **Fix:** Changed 3 occurrences to `Array.from(new Set(...))` and `Array.from(setVariable)`
- **Files modified:** app/src/lib/services/catbot-summary.ts
- **Verification:** Build passes
- **Committed in:** f2cb3b4 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking)
**Impact on plan:** Both fixes required to unblock build. Pre-existing issues from Plan 01. No scope creep.

## Issues Encountered
- Pre-existing test failures in task-scheduler.test.ts and catbot-holded-tools.test.ts (7 tests) -- unrelated to this plan's changes, not addressed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SummaryService fully wired: auto-starts on boot, CatBot can query summaries
- Phase 123 (Summaries) is complete -- all requirements fulfilled
- CatBot can respond to "lista mis resumenes" and "resumen del dia de ayer"

---
*Phase: 123-summaries*
*Completed: 2026-04-08*
