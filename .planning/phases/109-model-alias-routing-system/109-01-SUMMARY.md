---
phase: 109-model-alias-routing-system
plan: 01
subsystem: api
tags: [alias-routing, model-resolution, fallback, sqlite, discovery, mid]

requires:
  - phase: 107-llm-discovery-engine
    provides: getInventory() for model availability checking
  - phase: 108-model-intelligence-document-mid
    provides: getAll() for same-tier MID fallback matching
provides:
  - resolveAlias() function for intention-based model resolution
  - seedAliases() for 8 default alias mappings
  - model_aliases SQLite table
  - Complete migration checklist for Plans 02 and 03
affects: [109-02, 109-03, 110-catbot-orchestrator, 111-ui]

tech-stack:
  added: []
  patterns: [multi-layer-fallback-chain, alias-routing-pattern]

key-files:
  created:
    - app/src/lib/services/alias-routing.ts
    - app/src/lib/services/__tests__/alias-routing.test.ts
  modified:
    - app/src/lib/db.ts
    - app/src/lib/logger.ts

key-decisions:
  - "resolveAlias() uses Discovery directly (not litellm.resolveModel) to avoid circular dependency"
  - "Embed alias has separate fallback chain: configured -> EMBEDDING_MODEL env -> error (no MID, no CHAT_MODEL)"
  - "Logger source is 'alias-routing' (added to LogSource union)"
  - "44 hardcoded 'gemini-main' references categorized into Plan 02 (10 entries), Plan 03 (6 entries), Keep-as-is (rest)"

patterns-established:
  - "Multi-layer fallback: configured model -> Discovery check -> same-tier MID -> env var -> error"
  - "Embed-specific chain: no MID tier matching, uses EMBEDDING_MODEL env instead of CHAT_MODEL"
  - "Alias seed pattern: idempotent seedAliases() called from db.ts after seedModels()"

requirements-completed: [ALIAS-01, ALIAS-02, ALIAS-03, ALIAS-04, ALIAS-05, ALIAS-08]

duration: 4min
completed: 2026-04-04
---

# Phase 109 Plan 01: Alias Routing Core Summary

**resolveAlias() service with 8-alias seed data, multi-layer fallback chain (Discovery + MID tier matching + env), structured JSONL logging, and complete 44-reference migration checklist**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-04T12:22:06Z
- **Completed:** 2026-04-04T12:25:51Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- resolveAlias() with full fallback chain: configured model -> Discovery availability -> same-tier MID alternative -> CHAT_MODEL env -> error
- 8 aliases seeded idempotently (7 chat -> gemini-main, 1 embed -> text-embedding-3-small)
- Embed alias has its own chain (no MID matching, uses EMBEDDING_MODEL env, never CHAT_MODEL)
- Structured JSONL logging for every resolution with alias, requested, resolved, fallback_used, fallback_reason, latency_ms
- Complete audit of 44 hardcoded 'gemini-main' references, categorized for Plans 02/03/keep-as-is

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: failing tests** - `205db7c` (test)
2. **Task 1 GREEN: alias-routing service + table + seeds** - `53dba91` (feat)
3. **Task 2: hardcoded reference audit checklist** - `2cc720d` (chore)

_TDD task had RED and GREEN commits._

## Files Created/Modified
- `app/src/lib/services/alias-routing.ts` - resolveAlias(), seedAliases(), logResolution(), AliasRow type, migration checklist
- `app/src/lib/services/__tests__/alias-routing.test.ts` - 16 unit tests covering seed, resolve, fallback chain, embed, logging
- `app/src/lib/db.ts` - model_aliases CREATE TABLE + seedAliases() call wired after seedModels()
- `app/src/lib/logger.ts` - Added 'alias-routing' to LogSource union

## Decisions Made
- resolveAlias() calls Discovery getInventory() directly instead of litellm.resolveModel() to avoid circular dependency
- Embed alias explicitly excluded from MID tier matching (different fallback chain)
- Added 'alias-routing' as LogSource rather than using existing 'system' source for better filtering
- Migration checklist embedded as code comment in alias-routing.ts for co-location with the service

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- resolveAlias() ready for Plans 02 and 03 to start migrating callsites
- Migration checklist provides exact file:line references for every hardcoded 'gemini-main' reference
- All 16 tests passing, build succeeds

---
*Phase: 109-model-alias-routing-system*
*Completed: 2026-04-04*
