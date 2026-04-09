---
phase: 128-sistema-de-alertas-memoria-de-conversacion-catbot
plan: 01
subsystem: monitoring
tags: [sqlite, alertservice, singleton, shadcn, alert-dialog, i18n]

requires:
  - phase: 118-foundation
    provides: catbot.db schema (knowledge_gaps, knowledge_learned tables)
provides:
  - AlertService singleton detecting 7 system health conditions
  - system_alerts table in docflow.db
  - API /api/alerts (GET pending, POST acknowledge)
  - AlertDialogWrapper component in dashboard
affects: [catbot-tools, knowledge-admin, dashboard]

tech-stack:
  added: []
  patterns: [AlertService singleton with boot delay and interval, alert dedup by category+alert_key]

key-files:
  created:
    - app/src/lib/services/alert-service.ts
    - app/src/lib/__tests__/alert-service.test.ts
    - app/src/app/api/alerts/route.ts
    - app/src/components/system/alert-dialog-wrapper.tsx
  modified:
    - app/src/lib/db.ts
    - app/src/instrumentation.ts
    - app/src/app/page.tsx
    - app/messages/es.json
    - app/messages/en.json

key-decisions:
  - "AlertService boot delay 30s to avoid startup interference (shorter than SummaryService 2min since alerts are lightweight)"
  - "Dedup by category+alert_key prevents alert accumulation for same condition"
  - "7 check methods each wrapped in try-catch so one failure does not block others"
  - "Acknowledged alerts auto-cleaned after 30 days"

patterns-established:
  - "AlertService singleton: start/stop/tick with setInterval, same as SummaryService"
  - "Alert dedup: check before insert with category+alert_key+acknowledged=0"

requirements-completed: [ALERTS-01, ALERTS-02]

duration: 5min
completed: 2026-04-09
---

# Phase 128 Plan 01: Sistema de Alertas Summary

**AlertService singleton detecting 7 system health conditions with consolidated AlertDialog in dashboard grouped by category**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-09T18:25:28Z
- **Completed:** 2026-04-09T18:30:54Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- AlertService singleton with 7 health checks running every 5 minutes (knowledge gaps, staging entries, stuck tasks, orphaned runs, failing connectors, stale syncs, unread notifications)
- system_alerts table with deduplication (category+alert_key) and auto-cleanup of acknowledged alerts > 30 days
- API /api/alerts with GET (pending filter) and POST (acknowledge_all)
- AlertDialogWrapper in dashboard showing alerts grouped by 4 categories with severity badges and "Entendido" button
- 12 unit tests covering all checks, deduplication, getAlerts, and acknowledgeAll

## Task Commits

Each task was committed atomically:

1. **Task 1: system_alerts table + AlertService con tests** - `a29a4fe` (feat)
2. **Task 2: API /api/alerts + AlertDialog en dashboard + instrumentation** - `36ed641` (feat) + `f88f7c9` (chore: i18n)
3. **Task 3: Verificar AlertDialog en dashboard** - Auto-approved (auto_advance mode)

## Files Created/Modified
- `app/src/lib/services/alert-service.ts` - AlertService singleton with 7 check methods, insertAlert dedup, getAlerts, acknowledgeAll
- `app/src/lib/__tests__/alert-service.test.ts` - 12 unit tests with mocked db
- `app/src/app/api/alerts/route.ts` - GET/POST API endpoint for alerts
- `app/src/components/system/alert-dialog-wrapper.tsx` - Client component with category grouping, severity badges, acknowledge
- `app/src/lib/db.ts` - Added system_alerts table
- `app/src/instrumentation.ts` - Registered AlertService.start()
- `app/src/app/page.tsx` - Added AlertDialogWrapper to dashboard
- `app/messages/es.json` - Added alerts namespace
- `app/messages/en.json` - Added alerts namespace

## Decisions Made
- AlertService boot delay 30s (lighter than SummaryService 2min since alert checks are fast SQLite queries)
- Dedup by category+alert_key prevents same alert from accumulating
- Each check method wrapped in individual try-catch so one failing check does not block others
- Acknowledged alerts auto-cleaned after 30 days in tick() cleanup
- AlertDialog uses shadcn base-ui components with dark theme styling matching project conventions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] i18n files reverted by build linter**
- **Found during:** Task 2 (build verification)
- **Issue:** Next.js build linter reverted uncommitted changes to es.json and en.json
- **Fix:** Re-applied i18n changes and committed separately after build
- **Files modified:** app/messages/es.json, app/messages/en.json
- **Committed in:** f88f7c9

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor workflow issue, no scope change.

## Issues Encountered
None beyond the linter revert noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AlertService is running and detecting conditions
- Ready for 128-02 (Conversation Memory) which is independent from alerts
- CatBot tools for alerts could be added in future if needed

---
*Phase: 128-sistema-de-alertas-memoria-de-conversacion-catbot*
*Completed: 2026-04-09*
