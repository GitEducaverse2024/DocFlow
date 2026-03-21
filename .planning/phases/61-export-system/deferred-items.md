# Deferred Items - Phase 61

## Pre-existing build failure in bundle-importer.ts

**Found during:** 61-03, Task 4 (build validation)
**File:** `app/src/lib/services/bundle-importer.ts`
**Issue:** ESLint error `_agentIdMap` defined but never used (line 164). Causes `npm run build` to fail.
**Impact:** Build was already failing before 61-03 changes. Not introduced by this plan.
**Fix:** Add `// eslint-disable-next-line @typescript-eslint/no-unused-vars` or remove unused variable.
