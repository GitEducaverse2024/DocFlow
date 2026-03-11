---
phase: 11-connectors-ui-page
plan: 01
subsystem: connectors-ui
tags: [ui, connectors, crud, page]
dependency_graph:
  requires: [10-01-connectors-api]
  provides: [connectors-management-ui]
  affects: [sidebar]
tech_stack:
  added: []
  patterns: [sheet-create-edit, dialog-logs, type-cards, dynamic-form-fields]
key_files:
  created:
    - app/src/app/connectors/page.tsx
  modified:
    - app/src/components/layout/sidebar.tsx
decisions:
  - Native HTML select used instead of shadcn Select (not available in project)
  - Toggle active/inactive added directly in table row for quick access
metrics:
  duration: 169s
  completed: "2026-03-11T16:17:00Z"
---

# Phase 11 Plan 01: Connectors UI Page Summary

Full /connectors page with 4 type cards, CRUD sheet with dynamic config fields, test button, logs dialog, 3 n8n templates, and sidebar entry.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Add Conectores to sidebar | 9ef0d54 | Done |
| 2 | Create /connectors page with full UI | e16895e | Done |
| 3 | Verify build | (no changes) | Done - build passes |

## What Was Built

### Sidebar Entry (CUI-01)
- Added "Conectores" nav item between "Tareas" and "Configuracion" with Plug icon from lucide-react.

### Connectors Page (CUI-02 through CUI-07)
- **Type cards section** (CUI-02): 4 clickable cards for n8n_webhook (orange), http_api (blue), mcp_server (violet), email (emerald). Each shows icon, label, description, and count of configured connectors.
- **Connectors list** (CUI-02): Table with name/emoji, type badge, active/inactive status toggle, test status badge, usage count, and action buttons (test, logs, edit, delete).
- **Create/edit sheet** (CUI-03): Right-side panel with type selector (4 cards, disabled when editing), emoji/name/description fields, and dynamic config fields that change per connector type.
- **Test button** (CUI-04): Executes POST /api/connectors/{id}/test with loading spinner, shows success/error toast with duration.
- **Logs dialog** (CUI-05): Full-width dialog showing scrollable table of invocations with date, task ID, status badge, duration, and error message.
- **Type colors** (CUI-06): n8n_webhook=orange, http_api=blue, mcp_server=violet, email=emerald applied consistently across badges and cards.
- **Suggested templates** (CUI-07): 3 n8n template cards (Email, Asana, Telegram) with "Usar plantilla" button that pre-fills the create form.

### Empty state
- When no connectors exist, shows Plug icon with "No hay conectores configurados" message and CTA button.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. `grep "Conectores" sidebar.tsx` - PASS
2. `grep "Plug" sidebar.tsx` - PASS
3. Page file exists at app/src/app/connectors/page.tsx (893 lines) - PASS
4. Type colors applied correctly (orange, blue, violet, emerald) - PASS
5. SUGGESTED_TEMPLATES with Asana, Telegram present - PASS
6. Sheet and Dialog components used - PASS
7. `npm run build` passes, /connectors listed as static page (8.39 kB) - PASS

## Self-Check: PASSED
