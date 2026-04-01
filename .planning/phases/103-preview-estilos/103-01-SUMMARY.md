---
phase: 103
plan: 01
subsystem: email-templates
tags: [preview, styles, color-picker, template-editor, i18n]
dependency_graph:
  requires: [102-01]
  provides: [preview-panel, styles-panel, color-picker, send-test-api]
  affects: [catpower/templates/[id]]
tech_stack:
  added: []
  patterns: [iframe-preview, debounced-render, native-color-picker, modal-send-test]
key_files:
  created:
    - app/src/components/templates/color-picker.tsx
    - app/src/components/templates/styles-panel.tsx
    - app/src/components/templates/preview-panel.tsx
    - app/src/app/api/email-templates/[id]/send-test/route.ts
  modified:
    - app/src/components/templates/template-editor.tsx
    - app/messages/es.json
    - app/messages/en.json
decisions:
  - iframe sandbox="allow-same-origin" for preview (no scripts from template HTML)
  - renderTemplate() called client-side for instant preview; send-test POST also accepts rendered HTML to avoid re-rendering
  - First active Gmail connector used for send-test (no connector picker needed)
  - 500ms debounce on preview refresh; immediate render on toggle-open
metrics:
  duration: "45m"
  completed: "2026-04-01"
  tasks_completed: 7
  files_created: 4
  files_modified: 3
---

# Phase 103 Plan 01: Preview HTML + Panel de Estilos Summary

Real-time HTML preview with iframe, styles configuration panel, color pickers, copy HTML button, and send-test modal — all integrated into the email template editor.

## What Was Built

### Task 1: Preview toggle in editor toolbar
Added an Eye/EyeOff toggle button in the toolbar. When active, a 460px wide `PreviewPanel` appears between the editor and the right config panel. The editor layout switches from `flex gap-6` to a 3-column arrangement.

### Task 2: Real-time preview updates
`renderTemplate()` from `template-renderer.ts` is called client-side. Debounced 500ms on every structure change. On first toggle-open, renders immediately. The resulting HTML is passed as prop to `PreviewPanel` and set as `srcDoc` on an iframe with `sandbox="allow-same-origin"`.

### Task 3: Styles configuration panel
Added `StylesPanel` component with:
- Background color, primary color, text color (each with `ColorPicker`)
- Font family select (Arial, Helvetica, Georgia, Verdana)
- Max width number input (320–1200px, step 10)

Integrated as a tab in the right panel alongside the existing block config.

### Task 4: ColorPicker component
`color-picker.tsx` — native `<input type="color">` hidden inside a styled swatch div. Clicking the swatch opens the OS color picker. Hex text input (7-char validation) for manual entry. No external libraries.

### Task 5: Copy HTML button
Button in `PreviewPanel` toolbar. Uses `navigator.clipboard.writeText()` with textarea fallback. Visually switches to "Copiado" + Check icon for 2 seconds.

### Task 6: Send test button + endpoint
Modal in `PreviewPanel` with email input. POSTs to `/api/email-templates/[id]/send-test` with `{ to, html }`. The endpoint finds the first active Gmail connector from the `connectors` table and uses `sendEmail()` from `email-service.ts`. Returns `422` if no Gmail connector configured.

### Task 7: Build verification
`npm run build` passed — `✓ Compiled successfully`. Only pre-existing lint warnings (unrelated `<img>` and `useCallback` dependency warnings in other components). No new errors.

## i18n Keys Added

Both `es.json` and `en.json` under `catpower.templates`:
- `config.blockTab` — tab label for block config
- `preview.*` — 11 keys (show/hide, title, empty, copyHtml, copied, sendTest, sendTestDesc, emailAddress, send, sending, sendSuccess, sendError, cancel)
- `styles.*` — 6 keys (tab, title, backgroundColor, primaryColor, textColor, fontFamily, maxWidth)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `/home/deskmath/docflow/app/src/components/templates/color-picker.tsx` — FOUND
- [x] `/home/deskmath/docflow/app/src/components/templates/styles-panel.tsx` — FOUND
- [x] `/home/deskmath/docflow/app/src/components/templates/preview-panel.tsx` — FOUND
- [x] `/home/deskmath/docflow/app/src/app/api/email-templates/[id]/send-test/route.ts` — FOUND
- [x] `npm run build` — PASSED (Compiled successfully)

## Self-Check: PASSED
