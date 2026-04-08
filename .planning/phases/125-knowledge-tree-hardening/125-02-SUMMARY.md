---
phase: 125-knowledge-tree-hardening
plan: 02
subsystem: testing
tags: [vitest, knowledge-tree, catbot-tools, json, bidirectional-sync]

requires:
  - phase: 125-01
    provides: "KnowledgeEntrySchema with updated_at, _template.json, sources population"
provides:
  - "Bidirectional tool sync test (CI guardrail)"
  - "Source existence test using fs.existsSync"
  - "All knowledge JSONs with corrected tool arrays (57 tools mapped)"
affects: [catbot-tools, knowledge-tree, CI]

tech-stack:
  added: []
  patterns: ["File-based tool name extraction via regex to avoid heavy DB imports in tests"]

key-files:
  created:
    - app/src/lib/__tests__/knowledge-tools-sync.test.ts
  modified:
    - app/src/lib/services/catbot-tools.ts
    - app/src/lib/__tests__/knowledge-tree.test.ts
    - app/data/knowledge/catboard.json
    - app/data/knowledge/catpaw.json
    - app/data/knowledge/catflow.json
    - app/data/knowledge/canvas.json
    - app/data/knowledge/catpower.json
    - app/data/knowledge/settings.json
    - app/data/knowledge/_index.json

key-decisions:
  - "Parse catbot-tools.ts via regex instead of importing TOOLS to avoid pulling DB dependencies into test environment"
  - "Duplicates across JSONs allowed (warn only) since some tools span areas (list_skills, get_skill in catpaw + catpower)"

patterns-established:
  - "Tool sync test: any new CatBot tool must be added to a knowledge JSON or test fails"
  - "Source existence test: any source path in knowledge JSON must point to a real file"

requirements-completed: [KTREE-02, KTREE-03]

duration: 3min
completed: 2026-04-09
---

# Phase 125 Plan 02: Tool Sync Tests + Knowledge JSON Fixes Summary

**Bidirectional tool sync test and fs.existsSync source validation as CI guardrails, with 23 missing tools added and 2 phantom tools removed across 6 knowledge JSONs**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-08T22:10:54Z
- **Completed:** 2026-04-08T22:14:15Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Created bidirectional tool sync test that verifies every TOOLS[] entry is documented in knowledge JSONs and vice versa
- Fixed 6 knowledge JSONs: added 23 missing tools, removed 2 phantom tools (list_connectors, mcp_bridge)
- Replaced regex-only source validation with fs.existsSync for real file existence checks
- Exported TOOLS from catbot-tools.ts (though test uses file parsing to avoid DB imports)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Export TOOLS + create sync test** - `a814b4e` (test)
2. **Task 1 GREEN: Fix knowledge JSON tool arrays** - `c8c51a6` (feat)
3. **Task 2: Replace source regex test with fs.existsSync** - `ff1f853` (feat)

_TDD task 1 had RED + GREEN commits. Task 2 passed immediately (all source paths valid)._

## Files Created/Modified
- `app/src/lib/__tests__/knowledge-tools-sync.test.ts` - New bidirectional tool sync test (4 tests)
- `app/src/lib/services/catbot-tools.ts` - Export TOOLS array
- `app/src/lib/__tests__/knowledge-tree.test.ts` - fs.existsSync source validation
- `app/data/knowledge/catboard.json` - Added get_dashboard, get_system_status
- `app/data/knowledge/catpaw.json` - Added get_cat_paw, update_cat_paw, link_connector_to_catpaw, link_skill_to_catpaw
- `app/data/knowledge/catflow.json` - Added create_task, list_tasks
- `app/data/knowledge/canvas.json` - Added canvas_delete_edge, canvas_generate_iterator_end
- `app/data/knowledge/catpower.json` - Added 7 email template tools, removed list_connectors + mcp_bridge
- `app/data/knowledge/settings.json` - Added explain_feature, query_knowledge, read_error_history, save_learned_entry, get_summary, list_my_summaries
- `app/data/knowledge/_index.json` - Updated timestamps

## Decisions Made
- Parse catbot-tools.ts via regex (`name: 'tool_name'` pattern) instead of importing TOOLS directly, because the module pulls in DB, knowledge-tree, and other heavy dependencies that cannot load in vitest without mocking
- Allowed duplicate tools across JSONs (list_skills, get_skill appear in both catpaw and catpower) since these tools genuinely serve both areas

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Changed import strategy to file parsing**
- **Found during:** Task 1 RED phase
- **Issue:** Importing TOOLS from catbot-tools.ts fails because the module imports db, catbot-db, and other modules with native SQLite bindings
- **Fix:** Parse catbot-tools.ts source file with regex to extract tool names instead of importing
- **Files modified:** app/src/lib/__tests__/knowledge-tools-sync.test.ts
- **Verification:** Test extracts 57 tool names correctly, all sync checks pass
- **Committed in:** a814b4e

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to make test runnable without mocking the entire DB layer. No scope creep.

## Issues Encountered
None beyond the import deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 125 complete: all knowledge tree hardening done
- CI guardrails in place: tool sync + source existence tests will catch drift
- Any future CatBot tool additions must update corresponding knowledge JSON

---
*Phase: 125-knowledge-tree-hardening*
*Completed: 2026-04-09*
