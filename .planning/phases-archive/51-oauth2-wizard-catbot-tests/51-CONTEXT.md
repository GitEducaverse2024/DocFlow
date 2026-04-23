# Phase 51: OAuth2 Workspace + Wizard UI + CatBot + Tests - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning
**Source:** PRD Express Path + Phase 50 codebase exploration

<domain>
## Phase Boundary

This phase delivers the user-facing layer for Gmail connectors: a 4-step wizard UI for creating Gmail connectors (App Password and OAuth2), OAuth2 API endpoints for Google Workspace, CatBot tools for sending email via chat, documentation, and E2E/API tests. After this phase, users can set up Gmail connectors through the UI, send emails from CatBot, and all flows are tested.

Phase 50 (complete) delivered: crypto.ts, email-service.ts, Gmail API endpoints (test-credentials, send-test-email, invoke, CRUD extensions), executor integration, DB migration. All backend is ready.

</domain>

<decisions>
## Implementation Decisions

### OAuth2 API Endpoints
- GET /api/connectors/gmail/oauth2/auth-url generates Google authorization URL with redirect `urn:ietf:wg:oauth:2.0:oob` and scope `https://mail.google.com/` (OAUTH-01)
- POST /api/connectors/gmail/oauth2/exchange-code receives authorization code + client_id + client_secret, exchanges via googleapis OAuth2Client for refresh_token, encrypts refresh_token and client_secret before returning, NEVER returns client_secret in response (OAUTH-02)
- New gmail_subtype value `gmail_workspace_oauth2` for GmailConfig with auth_mode 'oauth2' + account_type 'workspace' (OAUTH-03)

### OAuth2 Wizard UI
- OAuth2 step in wizard with guided flow: paste auth URL in browser, copy authorization code back, exchange for refresh_token (OAUTH-04)
- Inline Google Cloud Console setup instructions in wizard: create project, enable Gmail API, create OAuth2 credential, configure consent screen (OAUTH-05)
- OAuth2 toggle only appears in Workspace step (step 2B), not for Personal accounts

### CatBot Tools
- Tool `send_email` in catbot-tools.ts: takes connector name (or id), to, subject, body; finds gmail connector by name from DB, calls /api/connectors/[id]/invoke internally (CATBOT-01)
- Tool `list_email_connectors` in catbot-tools.ts: returns list of active gmail connectors with id, name, account_type, auth_mode (CATBOT-02)
- System prompt updated in catbot chat route.ts with email section: "Puedes enviar emails usando conectores Gmail configurados. Siempre confirma con el usuario antes de enviar." (CATBOT-03)

### Wizard UI Component
- Gmail type in connector type selector on /conectores with emerald badge (UI-01)
- New component `gmail-wizard.tsx` with 4-step wizard: tipo cuenta, credenciales, test conexion, confirmacion. Progress bar at top (UI-02)
- Step 1: Selector de tipo de cuenta (Gmail Personal vs Google Workspace) with clickable cards, icons, descriptions (UI-03)
- Step 2A: App Password form for Personal — nombre remitente, email, app password field, link to Google instructions (UI-04)
- Step 2B: App Password form for Workspace — same as 2A plus domain field, smtp-relay text (UI-05)
- Step 2C: OAuth2 toggle in step 2B — Client ID, Client Secret fields, "Generar URL" button, textarea for authorization code, "Intercambiar" button (UI-06)
- Step 3: Connection test with 3 animated status lines (Conectando SMTP..., Verificando autenticacion..., Enviando email de prueba...) using existing test-credentials and send-test-email endpoints (UI-07)
- Step 4: Confirmation with summary card, "Listo para usar" badge, usage snippets for Canvas/Tareas/CatBot (UI-08)
- Gmail connector in connectors list with emerald badge, account subtitle (Personal/Workspace), actions: Test/Editar/Logs/Activar/Eliminar (UI-09)

### Wizard Integration Pattern
- The connectors page currently uses a Sheet (side panel) for create/edit
- Gmail wizard should be a Dialog (modal) replacing the Sheet flow when type 'gmail' is selected
- Use existing Dialog/DialogContent/DialogHeader components from shadcn/ui
- Follow canvas-wizard.tsx pattern: step state, back button, mode cards
- On wizard completion, call POST /api/connectors to save

### Documentation
- Add "Conector Gmail" section to .planning/CONNECTORS.md with auth modes, troubleshooting for 8 common errors, usage from Canvas/Tareas/CatBot (DOC-01)
- Ensure 'gmail' is in Connector type union in types.ts — already done in Phase 50 (DOC-02)
- Progress session file progressSesion19.md documenting v13.0 complete (DOC-03)

### Tests
- E2E tests for App Password wizard flow: open wizard, select Personal, fill credentials, test connection mock, verify badge in list (TEST-01)
- E2E tests for OAuth2 wizard flow: select Workspace, toggle OAuth2, mock auth URL generation, mock code exchange (TEST-02)
- E2E tests for Canvas integration: gmail connector node executes, output parsing, rate limit behavior (TEST-03)
- E2E tests for CatBot integration: list connectors tool, send_email tool with confirmation, invoke result (TEST-04)
- API tests for CRUD: create gmail with encryption, GET with masking, PATCH with re-encryption, invoke with payload (TEST-05)

### Existing Patterns to Follow
- Connector type config in TYPE_CONFIG object on connectors page (gmail already has basic entry)
- CatBot tools: TOOLS array + executeTool() switch in catbot-tools.ts
- E2E: Playwright + POM pattern, specs/ for UI tests, api/ for API tests
- POM: ConnectorsPOM in e2e/pages/connectors.pom.ts with createConnector, testConnection, deleteConnector
- Colors: Primary mauve (#8B6D8B), emerald for gmail badge (emerald-500/600)

### Claude's Discretion
- Exact animation timing for connection test status lines
- OAuth2 error messages and edge case handling
- Google Cloud Console instructions wording and formatting
- CatBot confirmation prompt wording before sending email
- Test data fixtures and mock strategies for E2E tests
- Whether to use Playwright test.describe.serial or parallel for gmail tests
- Exact layout of wizard step content (flex vs grid)

</decisions>

<specifics>
## Specific Ideas

### Key Files from Phase 50 (Already Built)
- `app/src/lib/crypto.ts` — encrypt/decrypt/isEncrypted (AES-256-GCM)
- `app/src/lib/services/email-service.ts` — createTransporter, testConnection, sendEmail (OAuth2 skeleton ready)
- `app/src/lib/types.ts` — GmailConfig, EmailPayload, GmailAuthMode, GmailAccountType, Connector type union
- `app/src/app/api/connectors/gmail/test-credentials/route.ts` — POST test without saving
- `app/src/app/api/connectors/gmail/send-test-email/route.ts` — POST send test to self
- `app/src/app/api/connectors/[id]/invoke/route.ts` — POST pipeline execution
- `app/src/app/api/connectors/route.ts` — POST create with gmail encryption, GET with masking
- `app/src/app/api/connectors/[id]/route.ts` — PATCH with re-encryption, GET with masking

### CatBot Integration Points
- `app/src/lib/services/catbot-tools.ts` — TOOLS array, executeTool() switch, getToolsForLLM()
- `app/src/app/api/catbot/chat/route.ts` — buildSystemPrompt(), system prompt sections

### UI Integration Points
- `app/src/app/connectors/page.tsx` — TYPE_CONFIG, Sheet create flow, connector list
- Dialog/Sheet components from shadcn/ui
- canvas-wizard.tsx as multi-step wizard reference pattern

### Test Infrastructure
- `app/playwright.config.ts` — testDir: './e2e', specs/ and api/ directories
- `app/e2e/specs/connectors.spec.ts` — existing connector tests
- `app/e2e/pages/connectors.pom.ts` — ConnectorsPOM with helper methods
- `app/e2e/helpers/test-data.ts` — testName() for unique identifiers

### OAuth2 OOB Flow Pattern
```
1. Client sends client_id + client_secret → GET /oauth2/auth-url → returns Google auth URL
2. User opens URL in browser, authorizes, gets code (OOB: displayed on screen)
3. User pastes code in wizard → POST /oauth2/exchange-code with code + client_id + client_secret
4. Server exchanges code for tokens via googleapis, encrypts refresh_token
5. Refresh_token stored encrypted in connector config, used to get access_token on each send
```

### Gmail Config in DB for OAuth2
```json
{
  "user": "cuenta@company.com",
  "account_type": "workspace",
  "auth_mode": "oauth2",
  "from_name": "DoCatFlow",
  "client_id": "123456.apps.googleusercontent.com",
  "client_id_encrypted": "iv:tag:hex",
  "client_secret_encrypted": "iv:tag:hex",
  "refresh_token_encrypted": "iv:tag:hex"
}
```

</specifics>

<deferred>
## Deferred Ideas

- Email attachments (future version)
- Non-Gmail SMTP providers (Outlook, Yahoo)
- Bulk/marketing email sending
- IMAP / email reading
- HTML email templates
- OAuth2 for Gmail Personal accounts
- Distributed rate limiter

</deferred>

---

*Phase: 51-oauth2-wizard-catbot-tests*
*Context gathered: 2026-03-16 via PRD Express Path + codebase exploration*
