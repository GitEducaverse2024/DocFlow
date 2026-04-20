# Deferred items (out of Phase 154 Plan 01 scope)

## Observed during Plan 01 Task 3 (`npm run build`)

**Migration error (pre-existing, not caused by Plan 01):**
- Symptom: `[logger-fallback] Migration error: table catbrains has 23 columns but 18 values were supplied` — repeated ~50 times during build's static generation phase.
- Root cause: DB migration drift introduced in Phase 153 (catbrains table column count evolved; migration INSERT hasn't been updated to match).
- Blast radius: Build still exits 0 (logs go to stderr via logger-fallback, not TS compile). Runtime catbrains operations may fail silently.
- Plan 01 scope: OUT (no catbrains code touched here).
- Recommended action: Open a separate phase or hotfix — inspect `app/src/lib/db.ts` migration sequence. Likely a `CREATE TABLE catbrains` vs `ALTER TABLE catbrains ADD COLUMN` mismatch.

Documented per execute-plan scope-boundary rule. NOT fixed here — would violate Rule 1 scope (issue not caused by this task).
