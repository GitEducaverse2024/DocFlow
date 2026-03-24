# Requirements: v18.0 Holded MCP — Auditoría API + Safe Deletes

**Defined:** 2026-03-24
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.

## v18.0 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### API Fix — Projects Time Tracking

- [x] **PFIX-01**: `holded_register_time` sends `duration` in seconds (hours * 3600), not `hours`
- [x] **PFIX-02**: `holded_register_time` resolves `holdedUserId` from employee (not `id`) for the `userId` field
- [x] **PFIX-03**: `holded_register_time` always includes `costHour` (default 0) in request body
- [x] **PFIX-04**: `holded_register_time` omits `userId` when employee has empty `holdedUserId`
- [x] **PFIX-05**: `holded_batch_register_times` applies same fixes (duration, userId, costHour) in loop
- [x] **PFIX-06**: `holded_batch_register_times` resolves `holdedUserId` once before loop (not per iteration)
- [x] **PFIX-07**: Unit tests verify duration=28800 for 8h, userId resolution, costHour presence

### API Fix — Employee Timesheets

- [ ] **TFIX-01**: `holded_create_timesheet` converts HH:MM to Unix timestamp strings for `startTmp`/`endTmp`
- [ ] **TFIX-02**: `holded_update_timesheet` applies same timestamp conversion
- [ ] **TFIX-03**: Timezone handling correct for Europe/Madrid (CET/CEST offset)
- [ ] **TFIX-04**: Unit tests verify timestamp conversion (e.g., '09:00' on '2026-03-17' → '1742205600')

### API Fix — CRM Leads + Contacts

- [x] **CFIX-01**: `holded_create_lead_note` sends `{ title, desc }` instead of `{ text }`
- [x] **CFIX-02**: `holded_create_lead_note` Zod schema updated with `title` (required) + `desc` (optional)
- [x] **CFIX-03**: `holded_create_lead` stageId passes value directly to API (accepts name or id)
- [x] **CFIX-04**: `holded_search_contact` uses client-side filtering (API has no name filter)
- [x] **CFIX-05**: Unit tests verify note fields, stageId passthrough, client-side search

### Safe Delete — Email Confirmation System

- [ ] **SDEL-01**: Token manager creates UUID tokens with 24h TTL, stored in `~/.config/holded-mcp/pending-deletes.json`
- [ ] **SDEL-02**: Token lifecycle: pending → executed/cancelled/expired (no reuse of used tokens)
- [ ] **SDEL-03**: Email service sends HTML email via nodemailer (Gmail SMTP) with confirm/cancel buttons
- [ ] **SDEL-04**: Email contains: resource type, name, ID, requested timestamp, expiry timestamp
- [ ] **SDEL-05**: HTTP endpoint `GET /confirm-delete?token=UUID&action=confirm|cancel` on existing MCP server (port 8766)
- [ ] **SDEL-06**: Confirm action executes real DELETE on Holded API and marks token as executed
- [ ] **SDEL-07**: Cancel action marks token as cancelled, resource NOT deleted
- [ ] **SDEL-08**: Expired tokens return clear error page
- [ ] **SDEL-09**: Already-used tokens return clear error page
- [ ] **SDEL-10**: `requestDelete()` wrapper function replaces all direct DELETE calls
- [ ] **SDEL-11**: All DELETE tools (contacts, times, employee times) use `requestDelete()` instead of direct delete
- [ ] **SDEL-12**: DELETE tools fetch resource name before creating token (for email readability)
- [ ] **SDEL-13**: If email send fails, token is cancelled and error returned (no orphan pending tokens)
- [ ] **SDEL-14**: New env vars: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `SERVER_IP` in holded-mcp `.env`
- [ ] **SDEL-15**: `nodemailer` + `@types/nodemailer` added as dependencies

### Tests + Documentation

- [ ] **TDOC-01**: Integration test script verifiable against real Holded API (list employees, register time, create timesheet, create lead note, request delete)
- [ ] **TDOC-02**: CatPaw system prompt updated with critical Holded API field documentation (duration in seconds, costHour, userId vs id, startTmp/endTmp as timestamp strings, title+desc for notes, safe delete behavior)
- [ ] **TDOC-03**: CONNECTORS.md updated with critical field reference
- [ ] **TDOC-04**: STATE.md and PROJECT.md updated with v18.0 completion

## Future Requirements

### Holded MCP Enhancements (deferred)
- **FUTURE-01**: External access to confirm-delete endpoint via nginx reverse proxy
- **FUTURE-02**: Confirmation email for UPDATE operations (not just DELETE)
- **FUTURE-03**: Admin dashboard for pending delete tokens
- **FUTURE-04**: Webhook notification to Slack/Discord on delete confirmation

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-admin email for deletes | Single admin (antonio@educa360.com) sufficient for now |
| SMS confirmation for deletes | Email sufficient for internal use |
| Undo/restore after confirmed delete | Holded API doesn't support undelete |
| OAuth2 for Gmail | App Password simpler for single-server internal use |
| Real-time notification when delete confirmed | Polling or manual check sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PFIX-01 | Phase 77 | Complete |
| PFIX-02 | Phase 77 | Complete |
| PFIX-03 | Phase 77 | Complete |
| PFIX-04 | Phase 77 | Complete |
| PFIX-05 | Phase 77 | Complete |
| PFIX-06 | Phase 77 | Complete |
| PFIX-07 | Phase 77 | Complete |
| TFIX-01 | Phase 78 | Pending |
| TFIX-02 | Phase 78 | Pending |
| TFIX-03 | Phase 78 | Pending |
| TFIX-04 | Phase 78 | Pending |
| CFIX-01 | Phase 79 | Complete |
| CFIX-02 | Phase 79 | Complete |
| CFIX-03 | Phase 79 | Complete |
| CFIX-04 | Phase 79 | Complete |
| CFIX-05 | Phase 79 | Complete |
| SDEL-01 | Phase 80 | Pending |
| SDEL-02 | Phase 80 | Pending |
| SDEL-03 | Phase 80 | Pending |
| SDEL-04 | Phase 80 | Pending |
| SDEL-05 | Phase 80 | Pending |
| SDEL-06 | Phase 80 | Pending |
| SDEL-07 | Phase 80 | Pending |
| SDEL-08 | Phase 80 | Pending |
| SDEL-09 | Phase 80 | Pending |
| SDEL-10 | Phase 80 | Pending |
| SDEL-11 | Phase 80 | Pending |
| SDEL-12 | Phase 80 | Pending |
| SDEL-13 | Phase 80 | Pending |
| SDEL-14 | Phase 80 | Pending |
| SDEL-15 | Phase 80 | Pending |
| TDOC-01 | Phase 81 | Pending |
| TDOC-02 | Phase 81 | Pending |
| TDOC-03 | Phase 81 | Pending |
| TDOC-04 | Phase 81 | Pending |

**Coverage:**
- v18.0 requirements: 36 total
- Mapped to phases: 36
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 after initial definition*
