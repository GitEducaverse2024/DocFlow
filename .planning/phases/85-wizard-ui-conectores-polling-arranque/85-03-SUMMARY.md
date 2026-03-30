---
phase: 85-wizard-ui-conectores-polling-arranque
plan: 03
subsystem: instrumentation
tags: [drive-polling, startup, instrumentation]
dependency_graph:
  requires: [drive-polling.ts]
  provides: [auto-start-drive-polling]
  affects: [instrumentation.ts]
tech_stack:
  patterns: [dynamic-import, try-catch-resilience, env-guard]
key_files:
  modified:
    - app/src/instrumentation.ts
decisions:
  - Used exported singleton instance (drivePollingService) rather than class-based getInstance() since that matches the actual drive-polling.ts export
metrics:
  completed: "2026-03-30"
  tasks_completed: 1
  tasks_total: 1
requirements: [WIZ-08]
---

# Phase 85 Plan 03: Add DrivePollingService startup to instrumentation.ts Summary

DrivePollingService auto-starts on app init via instrumentation.ts register() hook, guarded by NODE_ENV and wrapped in try/catch for resilience.

## What Was Done

### Task 1: Add DrivePollingService startup to instrumentation.ts
- **Commit:** b6a2c46
- **Files:** app/src/instrumentation.ts
- Added drive polling daemon startup after existing taskScheduler.start() call
- Guarded with `process['env']['NODE_ENV'] !== 'test'` to skip in test environment
- Wrapped in try/catch so broken drive-polling module cannot crash app startup
- Used dynamic import for runtime-only loading

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used actual export pattern instead of plan's class-based pattern**
- **Found during:** Task 1
- **Issue:** Plan specified `DrivePollingService.getInstance().start()` but drive-polling.ts exports a singleton instance as `drivePollingService`, not the class
- **Fix:** Used `const { drivePollingService } = await import(...)` matching the actual module export
- **Files modified:** app/src/instrumentation.ts
- **Commit:** b6a2c46

## Verification

- TypeScript check (`tsc --noEmit`): PASSED (no errors)
- Next.js build (`npm run build`): PASSED
- Test-env guard present: YES
- try/catch resilience: YES
- Dynamic import pattern: YES

## Self-Check: PASSED

All artifacts verified:
- [x] app/src/instrumentation.ts contains DrivePollingService startup
- [x] Commit b6a2c46 exists
- [x] Build passes
