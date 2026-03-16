# Phase 50: EmailService + Conector Gmail App Password - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning
**Source:** PRD Express Path (v11.0-gmail-connector-milestone.md)

<domain>
## Phase Boundary

This phase delivers the complete backend for Gmail email sending: crypto utilities, EmailService with Nodemailer, API endpoints for testing/sending/CRUD, DB migration, and executor integration. After this phase, a Gmail connector can be created via API, tested, and used from Canvas/Tasks pipelines. No UI wizard yet (Phase 51).

</domain>

<decisions>
## Implementation Decisions

### Dependencies
- Install `nodemailer @types/nodemailer googleapis` in app/package.json (EMAIL-01)

### Crypto Utility
- Create `src/lib/crypto.ts` with encrypt/decrypt/isEncrypted using AES-256-GCM (EMAIL-02)
- Key derived from `process['env']['CONNECTOR_SECRET']` via crypto.scryptSync with salt 'salt-docatflow', 32 bytes
- Fallback to default key for dev: 'docatflow-default-key-32-chars!!'
- Format: `iv:authTag:encryptedHex` (hex-encoded)
- isEncrypted() detects format by checking for two colons and hex content

### EmailService
- Create `src/lib/services/email-service.ts` with createTransporter, sendEmail, testConnection (EMAIL-03)
- App Password: `service: 'gmail'` for personal, `service: 'GmailWorkspace'` for workspace (smtp-relay)
- OAuth2: use googleapis OAuth2Client to get accessToken from refreshToken
- Strip spaces from App Password before use (normalize)
- Never log credentials
- Use withRetry (max 2 attempts, skip retry on auth errors)

### Types
- Add to `src/lib/types.ts`: GmailConfig, EmailPayload, GmailAuthMode ('app_password' | 'oauth2'), GmailAccountType ('personal' | 'workspace') (EMAIL-04)
- GmailConfig has: account_type, auth_mode, user, from_name?, app_password_encrypted?, client_id_encrypted?, client_secret_encrypted?, refresh_token_encrypted?

### Environment
- Document CONNECTOR_SECRET in .env.template with `openssl rand -hex 32` instruction (EMAIL-05)

### DB Migration
- ALTER TABLE connectors ADD COLUMN gmail_subtype TEXT — nullable, values: null, 'gmail_personal', 'gmail_workspace' (EMAIL-06)
- Use try-catch pattern (existing migration style)

### API Endpoints
- POST /api/connectors/gmail/test-credentials — test without saving, calls testConnection (EMAIL-07)
- POST /api/connectors/gmail/send-test-email — send test email to self, subject "✅ DoCatFlow — Conector Gmail funcionando" (EMAIL-08)
- Extend POST /api/connectors for type 'gmail' — encrypt app_password, client_secret, refresh_token before saving; keep user, account_type, auth_mode, from_name, client_id in clear (EMAIL-09)
- Extend PATCH /api/connectors/[id] for type 'gmail' — re-encrypt only updated sensitive fields (EMAIL-10)
- Extend /api/connectors/[id]/test for type 'gmail' — call testConnection (EMAIL-11)
- POST /api/connectors/[id]/invoke for type 'gmail' — parse output as EmailPayload, call sendEmail, log to connector_logs (EMAIL-12)

### Sensitive field masking
- GET responses mask sensitive fields as "••••••••••••••••" for saved connectors
- Sensitive: app_password_encrypted, client_secret_encrypted, refresh_token_encrypted
- Non-sensitive (clear): user, account_type, auth_mode, from_name, client_id

### Executor Integration
- Add case 'gmail' in catbrain-connector-executor.ts dispatching to executeGmailConnector (EMAIL-13)
- executeGmailConnector parses output 3 ways: JSON with to/subject/body, JSON without email fields (fallback to config.user + auto subject), plain text (fallback) (EMAIL-14)
- Anti-spam: Map<connectorId, lastSendTimestamp>, wait 1s between sends of same connector (EMAIL-15)

### Claude's Discretion
- Error message translations to Spanish for Nodemailer errors
- Exact response format for invoke endpoint
- connector_logs field content (exclude credentials from response_payload)
- Validation logic for EmailPayload (required: to + subject, at least one of html_body/text_body)

</decisions>

<specifics>
## Specific Ideas

### Code References from PRD

EmailService implementation pattern:
```typescript
// service: 'gmail' for personal, 'GmailWorkspace' for workspace
// OAuth2: google.auth.OAuth2 + setCredentials + getAccessToken
// sendMail with from (name + email), to (join array), subject, html, text, replyTo
```

Executor output parsing (3 modes):
1. JSON with `to` + `subject` → use directly
2. JSON without email fields → fallback to config.user + auto subject with date
3. Plain text → use as text_body, send to config.user

Config JSON in DB:
```json
{
  "user": "cuenta@gmail.com",
  "account_type": "personal",
  "auth_mode": "app_password",
  "from_name": "DoCatFlow",
  "app_password_encrypted": "iv:authTag:encryptedHex"
}
```

</specifics>

<deferred>
## Deferred Ideas

- OAuth2 flow endpoints (Phase 51: OAUTH-01..05)
- Wizard UI (Phase 51: UI-01..09)
- CatBot tools (Phase 51: CATBOT-01..03)
- Documentation updates (Phase 51: DOC-01..03)
- E2E/API tests (Phase 51: TEST-01..05)

</deferred>

---

*Phase: 50-emailservice-gmail-apppassword*
*Context gathered: 2026-03-16 via PRD Express Path*
