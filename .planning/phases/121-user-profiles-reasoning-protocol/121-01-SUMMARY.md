---
phase: 121-user-profiles-reasoning-protocol
plan: 01
subsystem: catbot
tags: [user-profiles, reasoning-protocol, prompt-assembler, vitest, tdd]

requires:
  - phase: 118-foundation-catbot-db
    provides: catbot-db.ts with upsertProfile/getProfile CRUD and user_profiles table
  - phase: 119-prompt-assembler
    provides: PromptAssembler with P0-P3 priority sections and budget-aware assembly
provides:
  - UserProfileService with 5 functions (deriveUserId, ensureProfile, extractPreferencesFromTools, generateInitialDirectives, updateProfileAfterConversation)
  - PromptAssembler extended with userProfile section (P1) and reasoning protocol (P1)
  - PromptContext.userProfile optional field for profile injection
affects: [121-02-wiring, 121-03-telegram, 122-recipes, 124-admin]

tech-stack:
  added: []
  patterns: [zero-cost-tool-pattern-extraction, priority-capped-prompt-sections, tdd-with-mocked-db]

key-files:
  created:
    - app/src/lib/services/catbot-user-profile.ts
    - app/src/lib/__tests__/catbot-user-profile.test.ts
  modified:
    - app/src/lib/services/catbot-prompt-assembler.ts
    - app/src/lib/__tests__/catbot-prompt-assembler.test.ts

key-decisions:
  - "ensureProfile does NOT call upsertProfile if profile exists, avoiding double interaction_count increment (Pitfall 4)"
  - "Profile directives capped at 500 chars, known_context capped at 500 chars to prevent token budget exhaustion (Pitfall 3)"
  - "Reasoning protocol uses exact text from RESEARCH.md Pattern 3 with 3 levels + Capa 0 skip"
  - "extractPreferencesFromTools uses zero-cost tool name pattern matching, no LLM calls (Anti-Pattern 3)"

patterns-established:
  - "Zero-cost preference extraction: analyze tool call names/args instead of LLM calls"
  - "Prompt section capping: cap variable-length user content at fixed char limits to protect budget"

requirements-completed: [PROFILE-01, PROFILE-02, PROFILE-03, PROFILE-04, PROFILE-05, REASON-01, REASON-02, REASON-03, REASON-04, REASON-05]

duration: 3min
completed: 2026-04-08
---

# Phase 121 Plan 01: UserProfileService + Reasoning Protocol Summary

**UserProfileService with 5 functions (deriveUserId, ensureProfile, extractPreferencesFromTools, generateInitialDirectives, updateProfileAfterConversation) and PromptAssembler extended with user profile P1 section + 3-level adaptive reasoning protocol with Capa 0 skip**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-08T13:57:54Z
- **Completed:** 2026-04-08T14:01:04Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- UserProfileService exports 5 functions with full TDD coverage (16 tests, mocked DB)
- PromptAssembler extended with userProfile optional field in PromptContext
- Profile section injected at P1 priority with 500-char caps for directives and known_context
- Reasoning protocol always injected at P1 with SIMPLE/MEDIO/COMPLEJO levels + Capa 0 fast path
- 41 total tests passing across both test files (16 profile + 25 assembler)

## Task Commits

Each task was committed atomically:

1. **Task 1: UserProfileService con tests** - `66c57b6` (feat) - TDD: 16 tests + service implementation
2. **Task 2: PromptAssembler profile section + reasoning protocol** - `9dc99f7` (feat) - TDD: 11 new tests + section builders

## Files Created/Modified
- `app/src/lib/services/catbot-user-profile.ts` - UserProfileService: deriveUserId, ensureProfile, extractPreferencesFromTools, generateInitialDirectives, updateProfileAfterConversation
- `app/src/lib/__tests__/catbot-user-profile.test.ts` - 16 unit tests with mocked catbot-db
- `app/src/lib/services/catbot-prompt-assembler.ts` - Extended PromptContext with userProfile, added buildUserProfileSection + buildReasoningProtocol
- `app/src/lib/__tests__/catbot-prompt-assembler.test.ts` - 11 new tests for profile section and reasoning protocol (25 total)

## Decisions Made
- ensureProfile avoids double interaction_count by only calling upsertProfile for new profiles (Pitfall 4)
- Profile directives and known_context each capped at 500 chars to protect token budget (Pitfall 3)
- Reasoning protocol text taken verbatim from RESEARCH.md Pattern 3 for consistency
- Zero-cost tool pattern extraction: no LLM calls, just tool name analysis (Anti-Pattern 3 compliance)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- UserProfileService ready to wire into route.ts pre-flight and post-conversation hooks (Plan 02)
- PromptContext.userProfile ready to receive profile data from route.ts (Plan 02)
- Telegram chat_id wiring needed in Plan 02/03 (Pitfall 1 from research)

---
*Phase: 121-user-profiles-reasoning-protocol*
*Completed: 2026-04-08*
