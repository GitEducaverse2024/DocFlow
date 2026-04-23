---
phase: 50-emailservice-gmail-apppassword
plan: 01
subsystem: email-service
tags: [gmail, nodemailer, crypto, smtp, aes-256-gcm]
dependency_graph:
  requires: []
  provides: [crypto-utility, email-service, gmail-types, gmail-db-migration]
  affects: [connectors-api, connectors-ui, catbrain-connector-executor]
tech_stack:
  added: [nodemailer, googleapis, "@types/nodemailer"]
  patterns: [AES-256-GCM encryption, scryptSync key derivation, withRetry SMTP]
key_files:
  created:
    - app/src/lib/crypto.ts
    - app/src/lib/services/email-service.ts
    - .env.template
  modified:
    - app/package.json
    - app/src/lib/types.ts
    - app/src/lib/db.ts
    - docker-compose.yml
    - app/src/app/api/connectors/route.ts
    - app/src/app/api/catbrains/[id]/connectors/route.ts
    - app/src/app/api/catbrains/[id]/connectors/[connId]/route.ts
    - app/src/lib/services/catbrain-connector-executor.ts
    - app/src/app/connectors/page.tsx
decisions:
  - AES-256-GCM with scryptSync for credential encryption (CONNECTOR_SECRET env var)
  - Default fallback key for dev environments without CONNECTOR_SECRET
  - Gmail connector type added alongside existing email type (not replacing)
  - App Password spaces auto-stripped on decrypt for copy-paste tolerance
metrics:
  duration_seconds: 266
  completed: "2026-03-16T19:53:41Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 50 Plan 01: Dependencies, Types, Crypto, DB, EmailService Summary

Nodemailer-based Gmail email service with AES-256-GCM credential encryption, TypeScript types, DB migration, and SMTP transporter for personal/workspace accounts.

## Task Results

### Task 1: Dependencies, types, crypto, DB migration, env (4d12f2d)
- Installed nodemailer, googleapis, @types/nodemailer
- Created `crypto.ts` with encrypt/decrypt/isEncrypted using AES-256-GCM
- Added GmailConfig, EmailPayload, GmailAuthMode, GmailAccountType to types.ts
- Added `gmail` to Connector type union and `gmail_subtype` field
- Added gmail_subtype column migration in db.ts
- Created .env.template with CONNECTOR_SECRET generation instructions
- Added CONNECTOR_SECRET to docker-compose.yml environment
- Updated VALID_TYPES in all 3 connector route files
- Added gmail case to catbrain-connector-executor switch

### Task 2: EmailService with Nodemailer (bbac33f)
- Created email-service.ts with createTransporter, testConnection, sendEmail
- App Password mode: personal (smtp.gmail.com:587 via service) and workspace (smtp-relay.gmail.com:587)
- OAuth2 mode: googleapis OAuth2Client with refresh token
- withRetry wraps SMTP verify/sendMail with auth-error skip
- translateError maps ECONNREFUSED, 535/534, ETIMEDOUT, self-signed to Spanish
- No credentials logged anywhere (only user, subject, messageId)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added gmail entry to connectors page TYPE_CONFIG**
- **Found during:** Task 2 verification (npm run build)
- **Issue:** Adding 'gmail' to Connector['type'] union caused TS error in connectors/page.tsx where TYPE_CONFIG is typed as Record<Connector['type'], TypeInfo> -- missing 'gmail' key
- **Fix:** Added gmail TypeInfo with fields (user, account_type, auth_mode, app_password, from_name) and typeColors entry
- **Files modified:** app/src/app/connectors/page.tsx
- **Commit:** bbac33f

**2. [Rule 2 - Missing functionality] Added gmail case to catbrain-connector-executor switch**
- **Found during:** Task 1 step 6
- **Issue:** Without a gmail case, the executor switch would hit default branch and throw for gmail connectors
- **Fix:** Added gmail case that skips execution (same as email -- fire-and-forget, not automatic)
- **Files modified:** app/src/lib/services/catbrain-connector-executor.ts
- **Commit:** 4d12f2d

## Verification

- crypto.ts roundtrip: encrypt('test123') -> decrypt -> 'test123' (PASSED)
- isEncrypted: true for encrypted strings, false for plaintext (PASSED)
- email-service.ts compiles without errors (PASSED)
- npm run build completes successfully (PASSED)
- .env.template exists with CONNECTOR_SECRET and openssl instruction (PASSED)
- gmail_subtype migration in db.ts (PASSED)
- VALID_TYPES includes 'gmail' in all connector routes (PASSED)

## Self-Check: PASSED
