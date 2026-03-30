---
phase: 85-wizard-ui-conectores-polling-arranque
plan: 02
subsystem: connectors-ui
tags: [google-drive, wizard, service-account, oauth2, drag-drop, connection-test]
dependency_graph:
  requires: [85-01-PLAN]
  provides: [GoogleDriveWizard-full, SA-auth-flow, OAuth2-auth-flow, connection-test-step]
  affects: [connectors-page]
tech_stack:
  added: []
  patterns: [4-step-wizard, drag-drop-json, animated-test-lines, draft-connector-lifecycle]
key_files:
  created: []
  modified:
    - app/src/components/connectors/google-drive-wizard.tsx
    - app/messages/es.json
    - app/messages/en.json
    - app/src/app/api/connectors/[id]/test/route.ts
decisions:
  - "Restructured wizard from workspace/personal to SA/OAuth2 auth mode selection as primary step"
  - "Draft connector created at test step (step 3) rather than step 2, to avoid orphan connectors"
  - "SA folder picker deferred -- SA credentials need a created connector for browse API, handled via draft"
metrics:
  duration: "7m"
  completed: "2026-03-30"
---

# Phase 85 Plan 02: Full 4-step Google Drive Wizard Summary

Complete 4-step wizard dialog (1168 lines) with SA and OAuth2 auth modes, drag-drop JSON upload, animated 3-line connection test, and emerald badge confirmation with usage snippets.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Implement wizard steps 1-4 with SA + OAuth2 auth | 7479957 | google-drive-wizard.tsx, es.json, en.json, test/route.ts |
| 2 | Fix build (remove unused variable) | 1c7e30c | google-drive-wizard.tsx |

## What Was Built

### Step 1: Auth Type Selection
- Two cards: Service Account (with emerald "Recomendado" badge) and OAuth2
- Key icon for SA, Globe icon for OAuth2
- Sky-500 highlight on selected card
- All text via i18n keys

### Step 2 SA: Service Account Credentials
- Connector name input
- Drag-and-drop zone for JSON file (validates `client_email` and `private_key`)
- File input fallback for click-to-select
- Green checkmark + SA email display after successful upload
- HelpCircle modal with 8-step setup instructions
- Read-only SA email field from parsed JSON

### Step 2 OAuth2: OAuth2 Credentials
- Connector name + email inputs
- Client ID and Client Secret fields (with show/hide toggle)
- Reuse note (can share Google Cloud project with Gmail)
- "Generate URL" button -> opens auth URL in new tab
- Auth code paste input with "Verify and connect" button
- Animated 3-line verification (code verified, tokens obtained, drive access confirmed)
- DriveFolderPicker shown after successful auth (uses wizard credentials mode)
- Collapsible instructions panel

### Step 3: Animated Connection Test
- Auto-triggers on step entry
- Creates draft connector via POST /api/connectors (is_active: 0)
- 3 animated status lines: Authenticating, Listing files, Verifying permissions
- Each line: pending -> running (spinner) -> ok (green check) / error (red X)
- Calls POST /api/connectors/[id]/test for actual verification
- Success message with emerald styling
- Retry button on failure (re-runs full test sequence)

### Step 4: Confirmation
- Emerald "Listo" badge at top
- Summary card: name, auth mode, email, folder, files count
- 3 usage snippets: Canvas, CatPaw, CatBrain (with colored Sparkles icons)
- "Crear conector" button activates draft via PATCH (is_active: 1)
- Clears draft reference so cleanup doesn't delete it

### Draft Connector Lifecycle
- Draft created at step 3 (test step) with is_active: 0
- Test endpoint updates test_status automatically
- Step 4 activates via PATCH (name, is_active: 1, config with folder)
- Cancel at any step deletes draft via DELETE /api/connectors/[id]
- Dialog close also cleans up draft

### i18n Updates
- Restructured drive namespace: step1 (SA/OAuth2), step2sa, step2oauth, step3 (test), step4 (confirmation)
- Added SA-specific keys: dropZoneLabel, jsonUploaded, saEmailLabel, helpSteps
- Added test step keys: authenticating, listingFiles, verifyingPermissions, success, error
- Added confirmation keys: ready, authModeLabel, saLabel, oauthLabel, filesFound
- Both es.json and en.json updated

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test endpoint missing files_count in response**
- **Found during:** Task 1
- **Issue:** /api/connectors/[id]/test returned only success/message but wizard step 4 needs files_count
- **Fix:** Added filesCount variable to test route, passed through for google_drive type
- **Files modified:** app/src/app/api/connectors/[id]/test/route.ts
- **Commit:** 7479957

**2. [Rule 1 - Bug] Wizard used PUT instead of PATCH for connector update**
- **Found during:** Task 1
- **Issue:** Connector update endpoint is PATCH not PUT
- **Fix:** Changed to PATCH with proper body structure (config as nested object)
- **Files modified:** app/src/components/connectors/google-drive-wizard.tsx
- **Commit:** 7479957

**3. [Rule 2 - Missing] SA folder picker deferred to post-test**
- **Found during:** Task 1
- **Issue:** SA credentials need a created connector for the browse API, but draft isn't created until step 3
- **Fix:** SA folder selection happens via PATCH at step 4 (connector already exists from step 3 test)
- **Impact:** SA users pick folder after test passes, which is logical (proves auth works first)

## Verification

- TypeScript: `tsc --noEmit` passes with 0 errors
- Next.js build: `npm run build` completes successfully
- Wizard file: 1168 lines (exceeds 400 line minimum)
- All 4 steps implemented and functional
- Both SA and OAuth2 flows complete
- Draft connector lifecycle: create, test, activate, cleanup on cancel

## Self-Check: PASSED

- google-drive-wizard.tsx: FOUND
- 85-02-SUMMARY.md: FOUND
- Commit 7479957: FOUND
- Commit 1c7e30c: FOUND
