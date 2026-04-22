# Deferred Items — Phase 159

Issues discovered during execution that are OUT OF SCOPE for this phase's plans.

## [159-01] Pre-existing seedAliases test failures (NOT caused by 159-01)

**Discovered during:** Plan 01 Task 1 (RED phase verification)
**Location:** `app/src/lib/services/__tests__/alias-routing.test.ts` (`describe('seedAliases')` block)

**Symptom:** 3 tests in the `seedAliases` describe block fail:
- "inserts 8 aliases when table is empty" — expected 8 `.run()` calls, got 11
- "is idempotent -- does nothing when rows exist" — expected 0 `.run()` calls after count=8, got 3
- "seeds 7 chat aliases pointing to gemini-main and embed to text-embedding-3-small" — got 10 chat calls instead of 7

**Root cause:** `seedAliases()` in `alias-routing.ts` was extended (Phase 140, lines 38-41) to always run `stmt.run(...)` for 3 canvas semantic aliases (`canvas-classifier`, `canvas-formatter`, `canvas-writer`) regardless of whether the table is empty. The tests were written against an earlier shape and were never updated.

**Verified pre-existing:** Reproduced with `git stash && npx vitest run` — failures exist on clean main (before 159-01 changes).

**Scope:** Out of scope for 159-01 (which introduces `resolveAliasConfig` + `updateAlias opts`, does not touch `seedAliases`). Deferred to a separate test maintenance task.
