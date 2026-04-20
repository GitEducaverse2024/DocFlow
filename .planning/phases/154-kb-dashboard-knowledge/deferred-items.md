# Deferred items (out of Phase 154 Plan 01 scope)

## Observed during Plan 01 Task 3 (`npm run build`)

**Migration error (pre-existing, not caused by Plan 01):**
- Symptom: `[logger-fallback] Migration error: table catbrains has 23 columns but 18 values were supplied` — repeated ~50 times during build's static generation phase.
- Root cause: DB migration drift introduced in Phase 153 (catbrains table column count evolved; migration INSERT hasn't been updated to match).
- Blast radius: Build still exits 0 (logs go to stderr via logger-fallback, not TS compile). Runtime catbrains operations may fail silently.
- Plan 01 scope: OUT (no catbrains code touched here).
- Recommended action: Open a separate phase or hotfix — inspect `app/src/lib/db.ts` migration sequence. Likely a `CREATE TABLE catbrains` vs `ALTER TABLE catbrains ADD COLUMN` mismatch.

Documented per execute-plan scope-boundary rule. NOT fixed here — would violate Rule 1 scope (issue not caused by this task).

## Observed during Plan 02 Task 2 (`npm run test:unit` full suite)

**Pre-existing test failures (not caused by Plan 02):**
- `src/lib/services/__tests__/alias-routing.test.ts` — 3 failed / 22 passed
- `src/lib/services/__tests__/catbot-holded-tools.test.ts` — 2 failed / 8 passed
- `src/lib/services/task-scheduler.test.ts` — 5 failed / 7 passed

Verified pre-existing via `git stash && npx vitest run ...` (same 10 failures before and after Task 1 commit 57d23a1). None of these files were touched by Plan 02 (which only added files under `app/src/app/knowledge/`, `app/src/app/api/knowledge/`, `app/src/components/knowledge/`).

All 152 KB-suite tests (kb-index-cache, kb-tools, kb-tools-integration, kb-hooks-tools, kb-hooks-api-routes, kb-audit, catbot-tools-query-knowledge, knowledge-sync, kb-sync-cli, kb-sync-db-source) still green. All 22 Plan 01 pure lib tests (kb-filters, kb-timeline, relative-time) still green.

Per scope-boundary rule: NOT fixed here. Recommended handling: isolate into a separate hotfix phase targeting the three service tests.
