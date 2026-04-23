---
phase: 51-oauth2-wizard-catbot-tests
plan: 01
subsystem: connectors/gmail/oauth2
tags: [oauth2, gmail, api, encryption, googleapis]
dependency_graph:
  requires: [crypto.ts, email-service.ts, googleapis, nodemailer]
  provides: [oauth2-auth-url-route, oauth2-exchange-code-route, oauth2-transporter]
  affects: [gmail-wizard-ui, catbot-tools, connector-invoke]
tech_stack:
  added: []
  patterns: [googleapis-oauth2-oob, nodemailer-oauth2-transport, aes-256-gcm-encryption]
key_files:
  created:
    - app/src/app/api/connectors/gmail/oauth2/auth-url/route.ts
    - app/src/app/api/connectors/gmail/oauth2/exchange-code/route.ts
  modified:
    - app/src/lib/services/email-service.ts
decisions:
  - Nodemailer handles OAuth2 token refresh internally (no manual getAccessToken call needed)
  - smtp.gmail.com:465 (secure) for OAuth2 transport instead of service shorthand
  - Removed googleapis dependency from createTransporter (nodemailer handles refresh natively)
metrics:
  duration: 155s
  completed: "2026-03-16T20:40:00Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 51 Plan 01: OAuth2 Auth-URL and Exchange-Code API Routes Summary

OAuth2 OOB endpoints for Google Workspace Gmail: auth URL generation via googleapis and authorization code exchange with AES-256-GCM encryption of refresh_token and client_secret.

## Tasks Completed

### Task 1: OAuth2 auth-url and exchange-code API routes
**Commit:** 5fe9cc0

Created two new Next.js API routes under `/api/connectors/gmail/oauth2/`:

- **GET /auth-url**: Accepts `client_id` and `client_secret` query params, creates googleapis OAuth2Client with OOB redirect URI, generates authorization URL with `mail.google.com` scope, `offline` access, and `consent` prompt.
- **POST /exchange-code**: Accepts JSON body with `code`, `client_id`, `client_secret`. Exchanges authorization code for tokens via googleapis. Encrypts refresh_token and client_secret using AES-256-GCM. Returns encrypted values + plain client_id. Never returns raw client_secret.

Both routes export `dynamic = 'force-dynamic'`, validate required params (400 on missing), and include Spanish error messages with translateError pattern.

### Task 2: EmailService OAuth2 transporter fix
**Commit:** 4395508

Fixed the OAuth2 branch in `createTransporter`:
- **Bug fix (Rule 1):** Removed broken `oauth2Client.getAccessToken()` call that returned a Promise in a synchronous context.
- Nodemailer natively handles OAuth2 token refresh when given clientId, clientSecret, and refreshToken -- no manual access token needed.
- Changed from `service: 'gmail'` shorthand to explicit `host: 'smtp.gmail.com', port: 465, secure: true` for OAuth2.
- Added OAuth2-specific info logging with auth_mode and account_type.
- DOC-02 confirmed: `'gmail'` already exists in the Connector type union in types.ts.
- gmail_workspace_oauth2 subtype flows through existing connector infrastructure (no backend change needed).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed async getAccessToken() in synchronous createTransporter**
- **Found during:** Task 2
- **Issue:** `oauth2Client.getAccessToken()` returns a Promise but was passed directly as `accessToken` string value in the transport config. This would cause authentication failures at runtime.
- **Fix:** Removed manual getAccessToken call entirely. Nodemailer's OAuth2 transport handles token refresh internally when given clientId, clientSecret, and refreshToken.
- **Files modified:** app/src/lib/services/email-service.ts
- **Commit:** 4395508

**2. [Rule 1 - Bug] Removed unused googleapis import from email-service.ts**
- **Found during:** Task 2
- **Issue:** The `require('googleapis')` was only used to get an access token manually. Since nodemailer handles refresh natively, the dependency is unnecessary in the transporter.
- **Fix:** Removed the googleapis require from createTransporter.
- **Files modified:** app/src/lib/services/email-service.ts
- **Commit:** 4395508

## Verification Results

- TypeScript compiles with zero errors
- auth-url route exports GET with `dynamic = 'force-dynamic'`
- exchange-code route exports POST with `dynamic = 'force-dynamic'`
- No raw client_secret in any response (only client_secret_encrypted)
- createTransporter has both app_password and oauth2 branches

## Self-Check: PASSED

- All created files exist on disk
- Both task commits (5fe9cc0, 4395508) verified in git log
