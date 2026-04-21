# Phase 158 — Deferred Items

Issues discovered during Phase 158 execution that are OUT OF SCOPE (not caused
by Phase 158 changes). Logged per GSD scope-boundary rule.

## Pre-existing alias-routing test failures

**File:** `app/src/lib/services/__tests__/alias-routing.test.ts`

**Failures (3):**

- `AliasRoutingService > seedAliases > inserts 8 aliases when table is empty`
- `AliasRoutingService > seedAliases > is idempotent -- does nothing when rows exist`
- `AliasRoutingService > seedAliases > seeds 7 chat aliases pointing to gemini-main and embed to text-embedding-3-small`

**Verified pre-existing:** yes — identical failures reproduce on commit
`a7297de` (prior to Phase 158 work) when running with the same mocked db
prepare/run sequence. Root cause is unrelated to Phase 158: `seedAliases`
behaviour in the test expects 8 chat aliases / mapping `gemini-main` but
the service or mock seed sequence drifted (likely during Phase 151-155 alias
refactor). Not caused by the new ALTERs or seed block.

**Impact on Phase 158:** none. Columns added are additive; the 22 passing
tests in the same file exercise `resolveAlias`, `upsertAlias`, caching —
all green. The `seedAliases` code path still runs at bootstrap in production
(not gated on these tests).

**Recommended next step:** log as incident (or file into a future v30.0 fix
plan) — out of scope for Phase 158 schema migration.
