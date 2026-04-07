---
phase: 117-tab-enrutamiento-catbot-cleanup
plan: 01
subsystem: ui
tags: [react, next-intl, shadcn-select, alert-dialog, health-api, alias-routing]

requires:
  - phase: 113-health-api
    provides: /api/models/health endpoint with provider and alias health data
  - phase: 114-centro-modelos-shell
    provides: ModelCenterShell with tab navigation and TabsContent slots
provides:
  - TabEnrutamiento component with compact routing table, health semaphores, smart model dropdown
  - i18n keys for enrutamiento tab (es + en)
affects: [117-catbot-cleanup, alias-routing]

tech-stack:
  added: []
  patterns: [client-side provider availability check via health data, confirmation dialog for risky model changes, optimistic update with revert]

key-files:
  created:
    - app/src/components/settings/model-center/tab-enrutamiento.tsx
  modified:
    - app/src/components/settings/model-center/model-center-shell.tsx
    - app/messages/es.json
    - app/messages/en.json

key-decisions:
  - "Client-side availability derived from connectedProviders Set built from health data (no server import)"
  - "AlertDialog confirmation for unavailable model selection instead of blocking selection entirely"
  - "Duplicated health/alias types in client component (same pattern as tab-resumen, tab-proveedores)"

patterns-established:
  - "Pre-change verification: check provider availability before PATCH, confirm if unavailable"
  - "Health semaphore pattern: direct=emerald, fallback=amber, error=red, no-data=zinc-600"

requirements-completed: [ROUTING-01, ROUTING-02, ROUTING-03, ROUTING-04]

duration: 3min
completed: 2026-04-07
---

# Phase 117 Plan 01: Tab Enrutamiento Summary

**Compact routing table with health semaphores, smart model dropdown greying unavailable models, and pre-change verification dialog**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-07T17:07:13Z
- **Completed:** 2026-04-07T17:10:28Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Routing table with alias, model dropdown, health semaphore, and tier badge columns in compact grid layout
- Model dropdown shows all MID models with unavailable ones greyed out (AlertTriangle + "(no disponible)" suffix)
- Pre-change confirmation dialog when selecting model from disconnected provider
- Optimistic update on PATCH with error revert and toast notifications
- Health semaphores per alias derived from /api/models/health endpoint data

## Task Commits

Each task was committed atomically:

1. **Task 1: Create TabEnrutamiento component** - `90394db` (feat)
2. **Task 2: Wire TabEnrutamiento into ModelCenterShell** - `57f8402` (feat)

## Files Created/Modified
- `app/src/components/settings/model-center/tab-enrutamiento.tsx` - Full routing table component with health semaphores, smart dropdown, confirmation dialog
- `app/src/components/settings/model-center/model-center-shell.tsx` - Replaced placeholder import with TabEnrutamiento
- `app/messages/es.json` - Added enrutamiento i18n keys (20 keys)
- `app/messages/en.json` - Added enrutamiento i18n keys (20 keys)

## Decisions Made
- Client-side provider availability derived from connectedProviders Set built from healthResult.providers (avoids importing server-only modules)
- AlertDialog confirmation for unavailable model selection (user can still force the change)
- Duplicated health types in client component following established pattern from tab-resumen and tab-proveedores

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 Centro de Modelos tabs now functional (Resumen, Proveedores, Modelos, Enrutamiento)
- Ready for 117-02 CatBot self-diagnosis tool and 117-03 cleanup tasks

---
*Phase: 117-tab-enrutamiento-catbot-cleanup*
*Completed: 2026-04-07*
