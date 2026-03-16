# Roadmap: DoCatFlow

## Milestones

- v12.0 WebSearch CatBrain — Phases 48-49 (shipped 2026-03-16) — [archive](.planning/milestones/v12.0-ROADMAP.md)
- **v13.0 Conector Gmail** — Phases 50-51 (active)

## Phases

- [ ] **Phase 50: EmailService + Conector Gmail App Password** - Backend completo: crypto, EmailService, API endpoints, executor integration, DB migration
- [ ] **Phase 51: OAuth2 Workspace + Wizard UI + CatBot + Tests** - OAuth2 flow, wizard 4 pasos, CatBot tools, documentacion, E2E/API tests

## Phase Details

### Phase 50: EmailService + Conector Gmail App Password
**Goal**: Users can create a Gmail connector with App Password credentials, test the connection, and send emails from Canvas/Tasks pipelines
**Depends on**: Nothing (foundation phase)
**Requirements**: EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04, EMAIL-05, EMAIL-06, EMAIL-07, EMAIL-08, EMAIL-09, EMAIL-10, EMAIL-11, EMAIL-12, EMAIL-13, EMAIL-14, EMAIL-15
**Success Criteria** (what must be TRUE):
  1. User can create a Gmail connector via API with App Password credentials, and sensitive fields (app_password) are stored encrypted in SQLite (never plaintext)
  2. User can test Gmail SMTP connectivity before saving credentials, receiving clear ok/error feedback
  3. User can send a test email to themselves through the connector and receive it in their inbox
  4. A Canvas or Task pipeline node with a Gmail connector sends email with the output of the previous node as body, with 1s anti-spam delay between sends
  5. User can update and delete Gmail connectors via existing CRUD endpoints, with partial re-encryption on update
**Plans:** 3 plans

Plans:
- [ ] 50-01-PLAN.md — Foundation: dependencies, types, crypto, DB migration, EmailService
- [ ] 50-02-PLAN.md — Gmail API endpoints: test-credentials, send-test-email, invoke, CRUD extensions
- [ ] 50-03-PLAN.md — Executor integration: gmail case, output parsing, anti-spam delay

### Phase 51: OAuth2 Workspace + Wizard UI + CatBot + Tests
**Goal**: Users can set up Gmail connectors through a guided wizard (including OAuth2 for Workspace), send emails via CatBot, and all flows are tested E2E
**Depends on**: Phase 50
**Requirements**: OAUTH-01, OAUTH-02, OAUTH-03, OAUTH-04, OAUTH-05, CATBOT-01, CATBOT-02, CATBOT-03, UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08, UI-09, DOC-01, DOC-02, DOC-03, TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. User can complete the 4-step wizard to create a Gmail connector with App Password (Personal or Workspace) seeing clear progress, inline instructions, and a connection test with animated status lines
  2. User can set up a Google Workspace OAuth2 connector through the wizard by generating an auth URL, pasting the authorization code, and exchanging it for a refresh token — with inline Google Cloud Console setup instructions
  3. User can ask CatBot to send an email (CatBot lists available connectors, asks for confirmation before sending, and reports success/failure)
  4. Gmail connectors appear in the connectors list with emerald badge, account subtitle, and full action set (Test/Edit/Logs/Activate/Delete)
  5. E2E and API tests pass for all Gmail flows: App Password wizard, OAuth2 wizard, Canvas integration, CatBot integration, and CRUD with encryption validation
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 50. EmailService + Conector Gmail App Password | 0/3 | Not started | - |
| 51. OAuth2 Workspace + Wizard UI + CatBot + Tests | 0/? | Not started | - |

---
*Last updated: 2026-03-16*
