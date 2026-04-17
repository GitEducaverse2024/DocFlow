---
phase: 143-email-classifier-pilot-pilot
plan: 03
subsystem: catflow
tags: [prompt-engineering, email-classifier, canvas-instructions, pilot]

requires:
  - phase: 143-02
    provides: "Pilot execution with identified quality gaps (markdown wrapper, single-email processing)"
provides:
  - "Corrected Normalizador instructions forcing pure JSON output"
  - "Corrected Respondedor instructions requiring per-email processing and no hallucination"
affects: [143-VERIFICATION, email-classifier-pilot]

tech-stack:
  added: []
  patterns: ["instruction patching via script + Docker exec for immediate prod effect"]

key-files:
  created: []
  modified:
    - app/scripts/setup-email-classifier-pilot.mjs

key-decisions:
  - "Prod DB had condensed instructions vs script - adapted patch to match both versions"

patterns-established:
  - "Dual-patch pattern: update script for reproducibility + Docker exec for immediate prod effect"

requirements-completed: [PILOT-03]

duration: 1min
completed: 2026-04-17
---

# Phase 143 Plan 03: Normalizador/Respondedor Instruction Gap Closure Summary

**Patched Normalizador to force pure JSON output (no markdown wrapper) and Respondedor to process each email individually without hallucinating data**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-17T14:57:57Z
- **Completed:** 2026-04-17T14:59:01Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Normalizador instructions now explicitly require pure JSON output parseable by JSON.parse() directly
- Respondedor instructions now require individual processing per email and prohibit invented names/data
- Both fixes applied to script (reproducibility) and prod DB (immediate effect without redeploy)

## Task Commits

Each task was committed atomically:

1. **Task 1: Parchear instrucciones Normalizador y Respondedor en script + prod DB** - `d6cd24b` (feat)

## Files Created/Modified
- `app/scripts/setup-email-classifier-pilot.mjs` - Added pure-JSON clause to Normalizador, per-email + no-hallucination clause to Respondedor

## Decisions Made
- Prod DB had condensed/reformatted instructions ("Max 200 palabras" vs "Maximo 200 palabras") - adapted Docker exec patch to match actual prod text while keeping script patch for the canonical version

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prod DB instructions text mismatch**
- **Found during:** Task 1 (Docker exec patch)
- **Issue:** Prod DB Respondedor instructions used "Max 200 palabras" instead of "Maximo 200 palabras" from the script, so the replace() call didn't match
- **Fix:** Re-ran Docker exec patch with correct prod text match
- **Files modified:** None (DB-only fix)
- **Verification:** Confirmed both CADA email and NUNCA inventes clauses present in prod DB
- **Committed in:** d6cd24b (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor text mismatch in prod DB required adapted replace pattern. No scope creep.

## Issues Encountered
None beyond the deviation noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Instructions patched and ready for re-execution of the email classifier pilot
- Next step: run pilot again to verify quality improvements (no markdown wrapper, individual email processing)

---
*Phase: 143-email-classifier-pilot-pilot*
*Completed: 2026-04-17*
