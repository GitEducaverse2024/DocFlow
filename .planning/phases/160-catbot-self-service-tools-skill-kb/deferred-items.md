# Phase 160 — Deferred Items

Items discovered during Phase 160 execution that are out of scope per the SCOPE BOUNDARY rule.

## Pre-existing issues (not caused by Phase 160 changes)

### 1. Unused imports in `src/lib/__tests__/db-seeds.test.ts`

**Discovered during:** Plan 160-03 lint verification (2026-04-22)
**File:** `app/src/lib/__tests__/db-seeds.test.ts` L2-L4
**Error:**
```
2:8  Error: 'path' is defined but never used.  @typescript-eslint/no-unused-vars
3:8  Error: 'fs' is defined but never used.  @typescript-eslint/no-unused-vars
4:8  Error: 'os' is defined but never used.  @typescript-eslint/no-unused-vars
```
**Source:** File was last touched in commit `5276c61` (test(160-01): add failing Wave 0 tests for TOOL-04 seed + PromptAssembler P1 + TOOL-03 sudo gate).
**Why deferred:** Test file is from Plan 160-01 (RED scaffolds) and its Wave 0 tests are intentionally RED pending Plan 160-04 (seed + PromptAssembler). The unused imports are left over from the scaffolding. Plan 160-04 will consume these imports when it wires the actual seed implementation, at which point the lint errors will self-resolve.
**Recommended action:** Resolve in Plan 160-04 (Operador de Modelos skill + PromptAssembler P1).
