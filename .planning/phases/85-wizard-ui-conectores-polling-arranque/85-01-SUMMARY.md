---
phase: 85-wizard-ui-conectores-polling-arranque
plan: 01
subsystem: connectors-ui
tags: [google-drive, folder-picker, i18n, wizard-stub]
dependency_graph:
  requires: [82-PLAN]
  provides: [DriveFolderPicker, DriveSubtitle, GoogleDriveWizard-stub, drive-i18n-keys]
  affects: [85-02-PLAN]
tech_stack:
  added: []
  patterns: [lazy-loaded-tree, breadcrumb-navigation, wizard-pattern]
key_files:
  created:
    - app/src/components/connectors/drive-folder-picker.tsx
    - app/src/components/connectors/google-drive-wizard.tsx
  modified:
    - app/src/app/connectors/page.tsx
    - app/messages/es.json
    - app/messages/en.json
decisions:
  - "Used oauth2_email (not oauth_email) per GoogleDriveConfig type definition"
metrics:
  duration: "5m"
  completed: "2026-03-25"
---

# Phase 85 Plan 01: DriveFolderPicker + Page Wiring Summary

DriveFolderPicker with lazy-loaded folder tree, breadcrumb navigation, and inline select; DriveSubtitle for google_drive connectors in /conectores page; wizard stub and full i18n keys for Drive UI.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Create DriveFolderPicker component + i18n keys | 5e49b3f | drive-folder-picker.tsx, es.json, en.json |
| 2 | Wire /conectores page with DriveSubtitle + wizard open | 67f29cd | page.tsx, google-drive-wizard.tsx |

## What Was Built

### DriveFolderPicker (`drive-folder-picker.tsx`)
- Lazy-loaded folder tree that fetches from `/api/connectors/google-drive/[id]/browse?parent_id=`
- Breadcrumb trail navigation (Mi Drive > Folder1 > Subfolder)
- Inline tree panel with expand/collapse arrows per folder
- Loading, error (with retry), and empty states
- Dark theme styling with sky-500 accent for selected folders
- Props: connectorId, value, valueName, onChange, disabled

### DriveSubtitle Component (in `page.tsx`)
- Shows auth mode label (Service Account / OAuth2)
- Displays email (sa_email or oauth2_email) and root_folder_name
- sky-400 accent color matching Drive badge

### Page Wiring
- google_drive type card in type grid opens Drive wizard (not generic sheet)
- google_drive in Sheet type selector also redirects to wizard
- GoogleDriveWizard stub renders when driveWizardOpen is true

### i18n Keys
- `connectors.types.google_drive` (label + description) in both languages
- `connectors.drive.*` namespace: steps, stepTitles, step1-4, step2sa, step2oauth, folderPicker, subtitle, nav, toasts
- 80+ translation keys across both es.json and en.json

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed oauth_email to oauth2_email**
- **Found during:** Task 2
- **Issue:** Plan specified `config?.oauth_email` but the GoogleDriveConfig type uses `oauth2_email`
- **Fix:** Changed to `config?.oauth2_email` to match type definition
- **Files modified:** app/src/app/connectors/page.tsx
- **Commit:** 67f29cd

## Verification

- TypeScript: `tsc --noEmit` passes with 0 errors
- Next.js build: `npm run build` completes successfully
- DriveFolderPicker exports correctly with connectorId prop
- DriveSubtitle renders for google_drive type connectors
- Drive card click opens driveWizardOpen state
- All i18n keys present in both es.json and en.json
