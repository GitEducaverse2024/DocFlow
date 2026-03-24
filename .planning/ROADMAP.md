# Roadmap: DoCatFlow

## Milestones

- v12.0 WebSearch CatBrain -- Phases 48-49 (shipped 2026-03-16) -- [archive](.planning/milestones/v12.0-ROADMAP.md)
- v13.0 Conector Gmail -- Phases 50-51 (shipped 2026-03-16)
- v14.0 CatBrain UX Redesign -- Phases 52-56 (shipped 2026-03-21) -- [archive](.planning/milestones/v14.0-ROADMAP.md)
- v15.0 Tasks Unified -- Phases 57-62 (shipped 2026-03-22) -- [archive](.planning/milestones/v15.0-ROADMAP.md)
- v16.0 CatFlow -- Phases 63-70 (shipped 2026-03-22) -- [archive](.planning/milestones/v16.0-ROADMAP.md)
- v17.0 Holded MCP -- Phases 71-76 (shipped 2026-03-24)
- **v18.0 Holded MCP: Auditoria API + Safe Deletes -- Phases 77-81 (active)**

---

## v18.0 — Holded MCP: Auditoria API + Safe Deletes

**Goal:** Auditar y corregir bugs criticos en campos enviados a la API de Holded + implementar sistema de confirmacion por email para operaciones DELETE + tests de integracion con API real.

**Repo principal:** `~/holded-mcp/` (phases 77-80) + `~/docflow/app/` (phase 81 system prompt)

## Phases

- [x] **Phase 77: Projects Time Tracking Fix** - Corregir duration (seconds), userId (holdedUserId), costHour en register_time y batch
- [ ] **Phase 78: Employee Timesheets Fix** - Corregir conversion HH:MM a Unix timestamps con timezone Europe/Madrid
- [x] **Phase 79: CRM Leads + Contacts Fix** - Corregir campos notas (title+desc), stageId passthrough, client-side contact search
- [ ] **Phase 80: Safe Delete Email Confirmation** - Sistema de tokens + email + HTTP endpoint para confirmar/cancelar DELETEs
- [ ] **Phase 81: Integration Tests + Documentation** - Tests contra API real, system prompt con campos criticos, docs

## Phase Details

### Phase 77: Projects Time Tracking Fix
**Goal**: CatBot registra horas correctamente en Holded (duration en segundos, userId correcto, costHour siempre presente)
**Depends on**: Nothing (independent bug fix)
**Requirements**: PFIX-01, PFIX-02, PFIX-03, PFIX-04, PFIX-05, PFIX-06, PFIX-07
**Success Criteria** (what must be TRUE):
  1. `holded_register_time` with 8 hours sends `duration: 28800` to the API (not `hours: 8`)
  2. `holded_register_time` for employee "Antonio" sends `userId: <holdedUserId>` (not the internal employee `id`)
  3. `holded_register_time` always includes `costHour` in the request body (default 0 when not specified)
  4. `holded_batch_register_times` resolves holdedUserId once and applies all three fixes (duration, userId, costHour) to every entry
  5. Unit tests pass verifying duration=28800 for 8h, userId resolution, and costHour presence
**Plans**:
- [x] [77-01-PLAN.md](phases/77-projects-time-tracking-fix/77-01-PLAN.md) -- Composite tools + unit tests

### Phase 78: Employee Timesheets Fix
**Goal**: Las fichas de jornada se crean/actualizan con timestamps Unix correctos respetando timezone Madrid
**Depends on**: Nothing (independent bug fix)
**Requirements**: TFIX-01, TFIX-02, TFIX-03, TFIX-04
**Success Criteria** (what must be TRUE):
  1. `holded_create_timesheet` with startTime '09:00' on date '2026-03-17' sends `startTmp: '1742205600'` (Unix timestamp string, not HH:MM)
  2. `holded_update_timesheet` applies the same HH:MM-to-timestamp conversion as create
  3. Timestamp conversion handles both CET (+1) and CEST (+2) offsets correctly for Europe/Madrid
  4. Unit tests pass verifying timestamp conversion for known date+time combinations
**Plans**: [78-01](phases/78-employee-timesheets-fix/78-01-PLAN.md)

### Phase 79: CRM Leads + Contacts Fix
**Goal**: Notas de leads usan campos correctos y la busqueda de contactos filtra client-side
**Depends on**: Nothing (independent bug fix)
**Requirements**: CFIX-01, CFIX-02, CFIX-03, CFIX-04, CFIX-05
**Success Criteria** (what must be TRUE):
  1. `holded_create_lead_note` sends `{ title, desc }` to the API (not `{ text }`) and Zod schema requires `title`
  2. `holded_create_lead` passes stageId value directly to the API without transformation
  3. `holded_search_contact` fetches all contacts and filters by name client-side (Holded API has no name filter)
  4. Unit tests pass verifying note field mapping, stageId passthrough, and client-side search filtering
**Plans**: 1 plan
Plans:
- [x] [79-01-PLAN.md](phases/79-crm-leads-contacts-fix/79-01-PLAN.md) — Verify implementations + add regression tests for note fields, stageId, client-side search

### Phase 80: Safe Delete Email Confirmation
**Goal**: Todas las operaciones DELETE en Holded requieren confirmacion por email antes de ejecutarse
**Depends on**: Nothing (new system, but recommended after 77-79 bug fixes)
**Requirements**: SDEL-01, SDEL-02, SDEL-03, SDEL-04, SDEL-05, SDEL-06, SDEL-07, SDEL-08, SDEL-09, SDEL-10, SDEL-11, SDEL-12, SDEL-13, SDEL-14, SDEL-15
**Success Criteria** (what must be TRUE):
  1. When CatBot requests a DELETE (e.g., delete contact), user receives an HTML email with resource name/type, confirm button, and cancel button
  2. Clicking "Confirm" in the email executes the real DELETE on Holded API and shows success page; clicking "Cancel" preserves the resource and shows cancellation page
  3. Tokens expire after 24h: accessing an expired or already-used token URL shows a clear error page
  4. All DELETE tools (contacts, times, employee times) go through `requestDelete()` -- no direct DELETE calls remain
  5. If email delivery fails, the pending token is cancelled and an error is returned to the user (no orphan tokens)
**Plans**: 2 plans
Plans:
- [ ] [80-01-PLAN.md](phases/80-safe-delete-email-confirmation/80-01-PLAN.md) — Infraestructura core: token store, email sender, Express routes + tests
- [ ] [80-02-PLAN.md](phases/80-safe-delete-email-confirmation/80-02-PLAN.md) — Refactorizar 14 DELETE tools para usar requestDelete() + actualizar tests

### Phase 81: Integration Tests + Documentation
**Goal**: Tests verifican los fixes contra API real y la documentacion refleja campos criticos
**Depends on**: Phase 77, 78, 79, 80
**Requirements**: TDOC-01, TDOC-02, TDOC-03, TDOC-04
**Success Criteria** (what must be TRUE):
  1. Integration test script runs against real Holded API: lists employees, registers time, creates timesheet, creates lead note, and requests a delete -- all succeed
  2. CatPaw system prompt in DoCatFlow includes critical field documentation (duration in seconds, costHour required, holdedUserId vs id, startTmp/endTmp as timestamp strings, title+desc for notes, safe delete behavior)
  3. CONNECTORS.md contains a critical field reference section for Holded API
  4. STATE.md and PROJECT.md reflect v18.0 completion
**Plans**: TBD

---

### Dependencies

```
77 (project times fix) ──┐
78 (timesheets fix)   ──┼──→ 81 (tests + docs)
79 (CRM fix)          ──┤
80 (safe delete)      ──┘
```

Phases 77, 78, 79 can run in parallel (independent bug fixes in different files).
Phase 80 can also run in parallel (new system in new files), but recommended after 77-79.
Phase 81 depends on all prior phases (tests verify all fixes + safe delete).

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 77. Projects Time Tracking Fix | 1/1 | Complete    | 2026-03-24 |
| 78. Employee Timesheets Fix | 1/1 | Complete | 2026-03-24 |
| 79. CRM Leads + Contacts Fix | 1/1 | Complete    | 2026-03-24 |
| 80. Safe Delete Email Confirmation | 0/2 | Not started | - |
| 81. Integration Tests + Documentation | 0/? | Not started | - |

---
*Created: 2026-03-24*
*Last updated: 2026-03-24*
