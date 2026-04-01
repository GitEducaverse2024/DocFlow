---
phase: 104
plan: 01
subsystem: email-templates
tags: [google-drive, assets, upload, gallery]
dependency_graph:
  requires: [drive-connector-9aee88bd, email-templates-schema]
  provides: [drive-asset-upload, public-drive-urls, asset-gallery]
  affects: [block-config-panel, template-creation]
tech_stack:
  added: []
  patterns: [drive-upload-with-permissions, get-or-create-folder, non-blocking-drive-integration]
key_files:
  created: []
  modified:
    - app/src/app/api/email-templates/route.ts
    - app/src/app/api/email-templates/[id]/assets/route.ts
    - app/src/components/templates/block-config-panel.tsx
decisions:
  - Use drive_url (Drive public URL) as primary; local URL as fallback — ensures images are accessible in emails to external recipients
  - Drive folder creation is non-blocking; if Drive unavailable templates still work with local assets
  - Public URL format: https://drive.google.com/uc?id={fileId}&export=view
  - Gallery tab loads assets lazily when tab is opened; optimistic append after upload
metrics:
  duration: 35m
  completed: "2026-04-01"
  tasks_completed: 6
  files_modified: 3
---

# Phase 104 Plan 01: Assets Upload to Google Drive Summary

**One-liner:** Drive-backed image assets for email templates — auto-upload on file drop, public URL via `anyone with link` sharing, reusable gallery tab per template.

## What Was Built

### Task 1: Drive folder on template creation
`POST /api/email-templates` now calls `tryCreateTemplateDriveFolder(name)` after creating the template. It traverses/creates `DoCatFlow/templates/{template-name}/` in Drive using the connector `9aee88bd-545b-4caa-b514-2ceb7441587d`. The folder ID is stored in `email_templates.drive_folder_id`. Failure is silent — templates work without Drive.

### Task 2: Drive upload from assets endpoint
`POST /api/email-templates/[id]/assets` now:
1. Saves file locally (existing behavior preserved)
2. If `template.drive_folder_id` is set: calls `uploadToDrive()` which uploads via `google-drive-service.uploadFile()` then calls `drive.permissions.create({ type: 'anyone', role: 'reader' })`
3. Stores `drive_file_id` and `drive_url` in `template_assets`
4. Returns `drive_url` as `url` field when available, local URL as fallback

### Task 3: Drive URL resolution
`block-config-panel.handleUpload` now prefers `data.drive_url` over `data.url`. This ensures emails with template images use the public Drive URL that external recipients can access.

### Task 4: Asset gallery
Added `ImageTab = 'upload' | 'gallery'` state and a two-tab switcher in block-config-panel for `logo` and `image` block types:
- **Upload tab**: existing drag-drop zone + paste URL input
- **Gallery tab**: lazy-loads all template assets via `GET /api/email-templates/{id}/assets`, shows 3-column grid, click to set as block.src

The gallery also receives optimistic updates immediately after a new upload.

### Task 5: External URL support
Unchanged — the paste URL input remains in the Upload tab. If user types/pastes a URL directly into the input, `onChange({ src: value })` is called without touching Drive.

### Task 6: Build
TypeScript compilation passed clean. One transient `ENOENT build-manifest.json` error occurred (Next.js build worker race); resolved by `rm -rf .next && npm run build`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `LogSource` type constraint**
- **Found during:** Task 2 build
- **Issue:** `logger.info('email-templates', ...)` — `'email-templates'` is not in the `LogSource` union type
- **Fix:** Changed to `logger.info('drive', ...)` / `logger.warn('drive', ...)` — semantically correct since all these calls are Drive operations
- **Files modified:** `route.ts` (both), `email-templates/route.ts`

None other — plan executed as written.

## Self-Check

Files created/modified:
- FOUND: /home/deskmath/docflow/app/src/app/api/email-templates/route.ts
- FOUND: /home/deskmath/docflow/app/src/app/api/email-templates/[id]/assets/route.ts
- FOUND: /home/deskmath/docflow/app/src/components/templates/block-config-panel.tsx

Build: TypeScript check PASSED (warnings are pre-existing, not introduced by this plan).

## Self-Check: PASSED
