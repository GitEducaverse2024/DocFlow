# Deferred Items — Phase 132

## Pre-existing test failures (not caused by Plan 01)

### knowledge-tree.test.ts — 2 failures

**Tests:**
1. `each area JSON has updated_at matching ISO date format`
2. `_index.json areas[].updated_at matches individual JSON updated_at`

**Root cause:** `app/data/knowledge/catboard.json` has `updated_at: "2026-04-10T20:10:00Z"` (full ISO datetime), while the regex in the test enforces `/^\d{4}-\d{2}-\d{2}$/` (date-only). This drift was introduced in an earlier phase and was already failing before Plan 132-01 started.

**Verification:** Confirmed via `git stash && vitest run knowledge-tree.test.ts` on the clean HEAD — 2 failures already present.

**Recommended fix (out of Plan 01 scope):** Normalize catboard.json `updated_at` to `"2026-04-10"` (date-only) and ensure `_index.json` matches. Should be addressed in a dedicated cleanup plan or incorporated into a future phase touching catboard knowledge.
