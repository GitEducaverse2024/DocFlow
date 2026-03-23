# Deferred Items - Phase 76

## Pre-existing Build Error

**File:** `app/src/components/system/system-health-panel.tsx:144`
**Error:** `Type 'unknown' is not assignable to type 'ReactNode'` — HoldedMcpStatus type cast issue
**Status:** Pre-existing, not caused by 76-01 changes
**Impact:** `npm run build` fails, but all 76-01 files compile cleanly via `tsc --noEmit`
