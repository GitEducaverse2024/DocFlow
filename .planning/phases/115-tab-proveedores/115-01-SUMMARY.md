---
phase: 115-tab-proveedores
plan: 01
subsystem: ui
tags: [react, accordion, provider-management, api-keys, health-semaphores, i18n]

requires:
  - phase: 114-centro-de-modelos-shell-tab-resumen
    provides: ModelCenterShell with tab navigation and placeholder slots
provides:
  - TabProveedores component with collapsible accordion provider cards
  - Inline API key and endpoint editing with auto-test
  - Health semaphore visualization per provider
affects: [115-02, 117-tab-enrutamiento]

tech-stack:
  added: []
  patterns: [accordion-single-expand, auto-test-on-save, inline-edit-pattern]

key-files:
  created:
    - app/src/components/settings/model-center/tab-proveedores.tsx
  modified:
    - app/src/components/settings/model-center/model-center-shell.tsx
    - app/messages/es.json
    - app/messages/en.json

key-decisions:
  - "Duplicated types locally in tab-proveedores.tsx to avoid importing server-only modules"
  - "Used max-height CSS transition for accordion expand/collapse animation"
  - "Auto-test fires after API key save to immediately validate connectivity"

patterns-established:
  - "Accordion pattern: single expandedProvider state with null for all-collapsed"
  - "Inline edit pattern: click text to reveal input + OK/Cancel"
  - "Auto-test on save: save key -> on success -> trigger test -> update semaphore"

requirements-completed: [PROV-01, PROV-02, PROV-03]

duration: 3min
completed: 2026-04-07
---

# Phase 115 Plan 01: Tab Proveedores Summary

**Accordion provider cards with health semaphores, inline API key/endpoint editing, and auto-test connectivity**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-07T16:18:14Z
- **Completed:** 2026-04-07T16:21:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created TabProveedores component with 5 collapsible provider cards showing emoji, name, health semaphore, and model count
- Inline API key editing with masked display, eye toggle, delete confirmation, and auto-test on save
- Inline endpoint editing with click-to-edit pattern
- Test connectivity button with result display and health semaphore updates
- Wired into ModelCenterShell replacing placeholder
- Full i18n with 35 translation keys in both es.json and en.json

## Task Commits

Each task was committed atomically:

1. **Task 1: Create TabProveedores component with collapsible accordion cards** - `6e930e1` (feat)
2. **Task 2: Wire TabProveedores into shell and add i18n translations** - `ae745cb` (feat)

## Files Created/Modified
- `app/src/components/settings/model-center/tab-proveedores.tsx` - Main component with accordion cards, inline editing, test connectivity
- `app/src/components/settings/model-center/model-center-shell.tsx` - Updated import from placeholder to real TabProveedores
- `app/messages/es.json` - Added 35 i18n keys under settings.modelCenter.proveedores
- `app/messages/en.json` - Added matching English translations

## Decisions Made
- Duplicated ProviderConfig, ProviderHealth, HealthResult types locally to avoid importing server-only modules (consistent with tab-resumen.tsx pattern)
- Used max-height CSS transition with overflow-hidden for smooth accordion animation
- Auto-test fires immediately after successful API key save for instant connectivity feedback
- Did not remove tab-proveedores-placeholder.tsx (dead code, cleanup deferred per plan instructions)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- TabProveedores fully functional, ready for Phase 115-02 (PROV-04 old API keys section removal)
- Phase 116 (Tab Modelos) and 117 (Tab Enrutamiento) can proceed independently

---
*Phase: 115-tab-proveedores*
*Completed: 2026-04-07*
