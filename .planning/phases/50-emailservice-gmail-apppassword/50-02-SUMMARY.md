---
phase: 50-emailservice-gmail-apppassword
plan: 02
subsystem: gmail-api-endpoints
tags: [gmail, api, encryption, masking, invoke, smtp]
dependency_graph:
  requires: [crypto-utility, email-service, gmail-types, gmail-db-migration]
  provides: [gmail-test-credentials-api, gmail-send-test-api, gmail-invoke-api, gmail-crud-encryption, gmail-config-masking]
  affects: [connectors-ui, pipeline-execution]
tech_stack:
  added: []
  patterns: [encrypt-before-save, mask-on-read, parse-pipeline-output, connector-log-sanitization]
key_files:
  created:
    - app/src/app/api/connectors/gmail/test-credentials/route.ts
    - app/src/app/api/connectors/gmail/send-test-email/route.ts
    - app/src/app/api/connectors/[id]/invoke/route.ts
  modified:
    - app/src/app/api/connectors/route.ts
    - app/src/app/api/connectors/[id]/route.ts
    - app/src/app/api/connectors/[id]/test/route.ts
decisions:
  - maskGmailConfig helper duplicated in route.ts and [id]/route.ts for locality (no shared util)
  - Invoke endpoint supports 3 payload parsing strategies (structured JSON, unstructured JSON, plain text)
  - Connector logs sanitized to never contain credentials
metrics:
  duration_seconds: 283
  completed: "2026-03-16T20:01:56Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 50 Plan 02: Gmail API Endpoints Summary

Six Gmail API endpoints: test-credentials and send-test-email for pre-save validation, CRUD with AES-256-GCM encryption on write and bullet-mask on read, invoke for pipeline email delivery with connector logging.

## Task Results

### Task 1: New Gmail-specific endpoints (12bf631)
- Created POST /api/connectors/gmail/test-credentials: validates SMTP credentials without saving to DB
- Created POST /api/connectors/gmail/send-test-email: tests connection then sends real email to self
- Created POST /api/connectors/[id]/invoke: parses pipeline output into EmailPayload using 3 strategies (structured JSON, unstructured JSON, plain text), sends email, logs to connector_logs with sanitized payloads, increments times_used
- All 3 routes export `dynamic = 'force-dynamic'`
- No credentials exposed in logs or responses

### Task 2: Extend existing CRUD endpoints for gmail type (6c477dd, 867523c)
- POST /api/connectors: encrypts app_password, client_secret, refresh_token before DB insert; sets gmail_subtype and default emoji
- PATCH /api/connectors/[id]: merges gmail config, re-encrypts only changed sensitive fields (skips already-encrypted values and mask placeholders), updates gmail_subtype on account_type change
- GET /api/connectors and GET /api/connectors/[id]: maskGmailConfig replaces encrypted fields with bullet dots before returning
- POST /api/connectors/[id]/test: added gmail case calling testConnection from email-service

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused Connector import**
- **Found during:** Task 2 verification (npm run build)
- **Issue:** ESLint error for unused `Connector` import in connectors/route.ts
- **Fix:** Removed the unused import
- **Files modified:** app/src/app/api/connectors/route.ts
- **Commit:** 867523c

## Verification

- TypeScript compilation: all 6 route files compile without errors (PASSED)
- npm run build: completes successfully with only pre-existing warnings (PASSED)
- test-credentials route: exports POST, imports encrypt and testConnection (PASSED)
- send-test-email route: exports POST, tests connection before sending (PASSED)
- invoke route: exports POST, parses output, logs to connector_logs, sanitizes payloads (PASSED)
- CRUD encryption: grep confirms encrypt() calls in POST handler (PASSED)
- Config masking: maskGmailConfig with bullet dots in GET handlers (PASSED)
- Gmail test case: testConnection call in [id]/test/route.ts switch (PASSED)

## Self-Check: PASSED
