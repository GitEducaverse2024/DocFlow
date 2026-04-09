---
phase: 128-sistema-de-alertas-memoria-de-conversacion-catbot
plan: 02
subsystem: api
tags: [catbot, conversation-memory, llm-compaction, windowing, vitest]

requires:
  - phase: 123-catbot-summaries
    provides: LLM compaction pattern with ollama/gemma3:12b
provides:
  - buildConversationWindow() for 10-recent + 30-compacted message windowing
  - compactMessages() for LLM-based conversation summarization
  - Module-level cache to avoid redundant compaction calls
affects: [128-03, catbot-chat, telegram-integration]

tech-stack:
  added: []
  patterns: [conversation-windowing, llm-compaction-with-fallback, single-entry-cache]

key-files:
  created:
    - app/src/lib/services/catbot-conversation-memory.ts
    - app/src/lib/__tests__/catbot-conversation-memory.test.ts
  modified:
    - app/src/app/api/catbot/chat/route.ts

key-decisions:
  - "Single-entry module cache keyed by JSON length + content prefix avoids re-compacting unchanged older messages"
  - "Fallback message '[No se pudo resumir]' ensures graceful degradation when LLM is unavailable"
  - "Compacted context injected as system message before recent messages preserves role ordering"

patterns-established:
  - "Conversation windowing: split messages into recent (full) + older (compacted) + discard (beyond cap)"
  - "LLM compaction fallback: always return usable result even on fetch failure"

requirements-completed: [CONVMEM-01, CONVMEM-02]

duration: 6min
completed: 2026-04-09
---

# Phase 128 Plan 02: Conversation Memory Windowing Summary

**Conversation memory windowing with 10-recent + 30-compacted LLM compaction using ollama/gemma3:12b and single-entry cache**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-09T18:25:18Z
- **Completed:** 2026-04-09T18:31:44Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- buildConversationWindow sends 10 recent messages in full + LLM-compacted summary of up to 30 older messages
- compactMessages uses ollama/gemma3:12b with 4000 char input cap, 512 max tokens, fallback on error
- Module-level single-entry cache prevents redundant LLM calls when older messages haven't changed
- route.ts integrated: userMessages pass through windowing before LLM call, sudo context preserved

## Task Commits

Each task was committed atomically:

1. **Task 1: buildConversationWindow + compactMessages con tests (TDD RED)** - `a28250d` (test)
2. **Task 1: buildConversationWindow + compactMessages implementation (TDD GREEN)** - `aa25fac` (feat)
3. **Task 2: Integrate buildConversationWindow in route.ts + lint fixes** - `4b2bf6a` (feat)

## Files Created/Modified
- `app/src/lib/services/catbot-conversation-memory.ts` - buildConversationWindow + compactMessages with cache
- `app/src/lib/__tests__/catbot-conversation-memory.test.ts` - 13 unit tests covering all windowing scenarios
- `app/src/app/api/catbot/chat/route.ts` - Import + use buildConversationWindow before llmMessages construction

## Decisions Made
- Single-entry module cache keyed by JSON length + content prefix: lightweight proxy avoids full hash computation
- Compacted context injected as system role message with message count metadata
- Fallback returns error message string (not empty) so LLM sees there WAS prior context even if compaction failed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript any[] lint errors causing build failure**
- **Found during:** Task 2 (build verification)
- **Issue:** ChatMessage interface used `any[]` for tool_calls, triggering @typescript-eslint/no-explicit-any
- **Fix:** Changed to properly typed `Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>`
- **Files modified:** catbot-conversation-memory.ts, catbot-conversation-memory.test.ts
- **Verification:** Lint errors resolved for these files
- **Committed in:** 4b2bf6a (Task 2 commit)

**2. [Rule 1 - Bug] Removed unused makeMessages helper**
- **Found during:** Task 2 (build verification)
- **Issue:** @typescript-eslint/no-unused-vars for makeMessages function in test file
- **Fix:** Removed the unused helper
- **Files modified:** catbot-conversation-memory.test.ts
- **Committed in:** 4b2bf6a (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs - lint errors)
**Impact on plan:** Both fixes necessary for build to pass. No scope creep.

### Out-of-scope Issues

- **alert-service.ts build error:** `"AlertService"` not assignable to `LogSource` type. Pre-existing from plan 128-01, not caused by this plan's changes. Build would fail regardless.

## Issues Encountered
None beyond the lint fixes documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Conversation memory windowing ready for production use
- Plan 128-03 (Telegram integration) can build on this foundation
- Pre-existing alert-service.ts type error from 128-01 needs resolution before clean builds

---
*Phase: 128-sistema-de-alertas-memoria-de-conversacion-catbot*
*Completed: 2026-04-09*
