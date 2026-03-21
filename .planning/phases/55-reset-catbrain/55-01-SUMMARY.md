---
phase: 55-reset-catbrain
plan: 01
subsystem: catbrains
tags: [reset, api, dialog, i18n, confirmation]
dependency-graph:
  requires: []
  provides: [reset-endpoint, reset-dialog]
  affects: [catbrain-entry-modal, es-json, en-json]
tech-stack:
  added: []
  patterns: [2-step-confirmation, non-fatal-qdrant-errors]
key-files:
  created:
    - app/src/app/api/catbrains/[id]/reset/route.ts
    - app/src/components/catbrains/reset-catbrain-dialog.tsx
  modified:
    - app/src/components/catbrains/catbrain-entry-modal.tsx
    - app/messages/es.json
    - app/messages/en.json
decisions:
  - Used showCloseButton={!resetting} instead of onInteractOutside (base-ui dialog does not support onInteractOutside)
  - Used simple t() interpolation for step2Prompt instead of t.rich() since the name is shown in quotes in the message string
metrics:
  duration: 192s
  completed: 2026-03-21T12:54:35Z
---

# Phase 55 Plan 01: Reset CatBrain Summary

POST reset endpoint with Qdrant/file/DB cleanup preserving config, plus 2-step confirmation dialog (stats display + type-name-to-confirm) wired to entry modal.

## What Was Built

### Task 1: POST /api/catbrains/[id]/reset endpoint + i18n keys

Created the reset API endpoint following the existing DELETE handler pattern with selective cleanup:

1. **Qdrant collection deletion** -- uses `qdrant.deleteCollection()` (internally wraps `withRetry`), errors are non-fatal (caught, logged, pushed to warnings array)
2. **Physical file deletion** -- removes entire catbrain directory with `fs.rmSync(dir, { recursive: true, force: true })`
3. **DB record deletion** -- deletes `sources` and `processing_runs` rows for the catbrain
4. **Catbrain field reset** -- sets status='draft', current_version=0, nulls all RAG fields while preserving name, description, system_prompt, agent_id, default_model, icon_color, etc.

Guards: 404 if catbrain not found, 403 if `is_system === 1`.

Added 12 i18n keys under `catbrains.reset` namespace to both `es.json` and `en.json`.

### Task 2: ResetCatBrainDialog component + entry modal wiring

Created `ResetCatBrainDialog` modeled after `DeleteProjectDialog`:

- **Step 1**: Shows source count and vector count (or "no vectors" variant) with Cancel/Continue buttons
- **Step 2**: Requires typing exact CatBrain name (with normalize comparison: trim, collapse whitespace, NFC) before confirm button enables
- **Locked during execution**: close button hidden via `showCloseButton={!resetting}`, `onOpenChange` blocked when `resetting=true`
- **Post-reset**: calls `onResetComplete()` callback which closes both dialogs, shows success toast, navigates to `/catbrains/[id]?flow=sources-pipeline`

Modified `catbrain-entry-modal.tsx`:
- Reset action button now opens `ResetCatBrainDialog` instead of navigating to sources step
- Passes existing `catbrain` prop and `stats` state to the dialog
- `onResetComplete` callback handles navigation and toast

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] DialogContent does not support onInteractOutside**
- **Found during:** Task 2
- **Issue:** The plan specified `onInteractOutside={(e) => e.preventDefault()}` on DialogContent, but the project uses `@base-ui/react/dialog` which does not expose this prop on the DialogContent wrapper
- **Fix:** Used `showCloseButton={!resetting}` to hide the X button during reset, combined with the existing `handleClose` function that blocks `onOpenChange(false)` when `resetting=true`
- **Files modified:** `app/src/components/catbrains/reset-catbrain-dialog.tsx`
- **Commit:** 974a63e

**2. [Rule 3 - Blocking] t.rich() unnecessary for step2Prompt**
- **Found during:** Task 2
- **Issue:** Plan suggested `t.rich()` for the step2Prompt to render the name in bold, but the i18n string uses `{name}` as a simple interpolation placeholder (in quotes), not as a rich text tag
- **Fix:** Used simple `t('reset.step2Prompt', { name: catbrain.name })` interpolation instead
- **Files modified:** `app/src/components/catbrains/reset-catbrain-dialog.tsx`
- **Commit:** 974a63e

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | f417210 | feat(55-01): create POST /api/catbrains/[id]/reset endpoint and add i18n keys |
| 2 | 974a63e | feat(55-01): create ResetCatBrainDialog and wire entry modal reset button |

## Verification

- TypeScript compilation: PASSED (no errors)
- Next.js build: PASSED (no errors, only pre-existing warnings)
- All i18n keys present in both es.json and en.json
- No `process.env.VAR` usage without bracket notation in new files
