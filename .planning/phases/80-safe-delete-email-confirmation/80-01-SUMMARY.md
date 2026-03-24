---
phase: 80-safe-delete-email-confirmation
plan: 01
subsystem: holded-mcp
tags: [safe-delete, email-confirmation, nodemailer, express-routes]
dependency_graph:
  requires: []
  provides: [pending-deletes-store, email-sender, safe-delete-routes]
  affects: [holded-mcp-index]
tech_stack:
  added: [nodemailer]
  patterns: [token-based-confirmation, in-memory-store, singleton-transporter]
key_files:
  created:
    - /home/deskmath/holded-mcp/src/utils/pending-deletes.ts
    - /home/deskmath/holded-mcp/src/utils/email-sender.ts
    - /home/deskmath/holded-mcp/src/utils/safe-delete-routes.ts
    - /home/deskmath/holded-mcp/src/__tests__/pending-deletes.test.ts
    - /home/deskmath/holded-mcp/src/__tests__/email-sender.test.ts
    - /home/deskmath/holded-mcp/src/__tests__/safe-delete-routes.test.ts
  modified:
    - /home/deskmath/holded-mcp/src/index.ts
    - /home/deskmath/holded-mcp/package.json
decisions:
  - Used in-memory Map for token store (sufficient for single-server MCP, tokens lost on restart acceptable with 24h TTL)
  - markConfirmed BEFORE client.delete for race condition safety (SDEL-10)
  - GET routes for confirm/cancel (email links cannot POST)
metrics:
  duration: 4m
  completed: 2026-03-24
  tasks: 2
  tests_added: 41
  tests_total: 374
  files_created: 6
  files_modified: 2
---

# Phase 80 Plan 01: Safe Delete Email Confirmation Infrastructure Summary

Token-based in-memory pending-delete store with nodemailer email sender and Express confirm/cancel routes -- 3 new modules providing requestDelete() wrapper for Plan 02 to consume.

## Tasks Completed

### Task 1: Install nodemailer + create pending-deletes.ts and email-sender.ts (TDD)

**Commit:** `0b07c7e`

Created two core modules:

- **pending-deletes.ts**: In-memory Map store with PendingDelete interface, 64-char hex tokens via crypto.randomBytes(32), configurable TTL (SAFE_DELETE_TOKEN_TTL_HOURS, default 24h), status transitions (pending/confirmed/cancelled/expired/error), periodic cleanup of tokens older than 2x TTL, requestDelete() orchestrator that verifies HTTP mode, creates token, sends email, handles failures.

- **email-sender.ts**: escapeHtml() for XSS prevention, buildConfirmationEmailHtml() with resource type/label/confirm/cancel URLs, getTransporter() singleton pattern for nodemailer, sendConfirmationEmail() with error handling returning { ok: true/false }.

25 tests covering: token format, expiration, status transitions, requestDelete flow, stdio rejection, cleanup, HTML content, escapeHtml, email send success/failure, singleton transporter.

### Task 2: Create safe-delete-routes.ts + integrate in index.ts (TDD)

**Commit:** `6ec9276`

- **safe-delete-routes.ts**: Express Router with GET /confirm/:token and GET /cancel/:token. Confirm route: validates token status, marks confirmed BEFORE calling client.delete() (race condition protection), executes delete, handles success/error. Cancel route: validates token, marks cancelled. All HTML pages include meta referrer no-referrer, charset utf-8, DoCatFlow branding.

- **index.ts**: Added import and app.use(createSafeDeleteRouter(client)) BEFORE MCP routes to ensure /confirm and /cancel don't pass through the MCP handler.

16 tests covering: confirm success with deleteBody/deleteModule passthrough, 404/410/409/500 responses, double-click safety (status verified during client.delete execution), cancel success/404/409, HTML page content.

## Verification Results

- Full test suite: 374 tests pass (333 existing + 41 new), zero regressions
- Bracket notation check: zero violations of process.env dot notation in new files
- All 3 new files exist in src/utils/
- index.ts contains import and usage of createSafeDeleteRouter

## Deviations from Plan

None -- plan executed exactly as written.

## Key Exports for Plan 02

| Module | Exports |
|--------|---------|
| pending-deletes.ts | createPendingDelete, getPendingDelete, markConfirmed, markCancelled, markError, requestDelete, clearAllPendingDeletes, startCleanupInterval, stopCleanupInterval, PendingDelete (type) |
| email-sender.ts | sendConfirmationEmail, buildConfirmationEmailHtml, escapeHtml, resetTransporter |
| safe-delete-routes.ts | createSafeDeleteRouter |

## Environment Variables (New)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| SAFE_DELETE_SMTP_HOST | No | smtp.gmail.com | SMTP server host |
| SAFE_DELETE_SMTP_PORT | No | 465 | SMTP server port |
| SAFE_DELETE_SMTP_USER | Yes | - | SMTP auth user |
| SAFE_DELETE_SMTP_PASS | Yes | - | SMTP auth password |
| SAFE_DELETE_SMTP_FROM_NAME | No | DoCatFlow | Email from name |
| SAFE_DELETE_NOTIFY_EMAIL | Yes | - | Recipient for confirmations |
| SAFE_DELETE_BASE_URL | No | http://192.168.1.49:{PORT} | Base URL for confirm/cancel links |
| SAFE_DELETE_TOKEN_TTL_HOURS | No | 24 | Token expiration in hours |
