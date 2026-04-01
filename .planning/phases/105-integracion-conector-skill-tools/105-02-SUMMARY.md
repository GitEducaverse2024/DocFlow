---
phase: 105-integracion-conector-skill-tools
plan: "02"
subsystem: catpaw-email-templates
tags: [integration, email-templates, tools, canvas, e2e]
dependency_graph:
  requires: [105-01]
  provides: [email-template-tool-wiring, canvas-email-template-node, e2e-tests]
  affects: [execute-catpaw, canvas-executor]
tech_stack:
  patterns: [tool-dispatch-map, connector-skip-array, template-rendering-in-canvas]
key_files:
  modified:
    - app/src/lib/services/execute-catpaw.ts
    - app/src/lib/services/canvas-executor.ts
  created:
    - app/e2e/api/email-templates.api.spec.ts
decisions:
  - "email_template added to skip array alongside google_drive and gmail to prevent HTTP fetch crash"
  - "Email template tool dispatch follows same Map pattern as gmail/drive dispatchers"
  - "Canvas email_template node tries JSON parse for variables, falls back to first instruction key"
metrics:
  duration: "351s"
  completed: "2026-04-01T12:30:31Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 105 Plan 02: Integracion -- conector + skill + tools Summary

Wire email_template tools into execute-catpaw.ts tool-calling loop and add canvas-executor.ts connector node support, with full E2E API test coverage.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Wiring en execute-catpaw.ts y canvas-executor.ts | 0b103e0 | execute-catpaw.ts, canvas-executor.ts |
| 2 | Test E2E - email-templates.api.spec.ts | 2ec76b2 | email-templates.api.spec.ts |

## What Was Done

### Task 1: Wiring en execute-catpaw.ts y canvas-executor.ts

**execute-catpaw.ts changes:**
- Added `'email_template'` to skip array (line ~121) to prevent HTTP fetch on connectors with no URL
- Added imports for `getEmailTemplateToolsForPaw`, `EmailTemplateToolDispatch`, and `executeEmailTemplateToolCall`
- Added `emailTemplateToolDispatch` Map declaration alongside existing drive/gmail dispatch maps
- Added email template tool loading block after MCP tools section (filters `email_template` connectors, loads 3 tools, adds system prompt section)
- Added email template dispatch branch in tool-calling loop (between MCP and Unknown tool fallback)

**canvas-executor.ts changes:**
- Added imports for `renderTemplate` and `TemplateStructure`
- Added `email_template` connector block in the `'connector'` case (between Google Drive and MCP blocks)
- Template rendering: parses predecessor output as JSON variables map; if not JSON, uses first instruction key as fallback
- Added `findFirstInstructionKey()` helper function at end of file
- Renders HTML via `renderTemplate()` and passes downstream

### Task 2: E2E API Tests

Created `app/e2e/api/email-templates.api.spec.ts` with 8 serial tests:
1. GET /api/email-templates - list templates (verifies seed exists)
2. GET /api/email-templates/[id] - get structure with instruction blocks
3. POST /api/email-templates/[id]/render - render HTML with variables
4. POST /api/connectors - create email_template connector
5. GET /api/connectors - verify email_template appears
6. DELETE /api/connectors/[id] - cleanup
7. Seed connector seed-email-template exists
8. Seed skill maquetador-email exists

All 8 tests pass (645ms).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] API response format mismatch in tests**
- **Found during:** Task 2 first test run
- **Issue:** Plan assumed `{ templates: [...] }` response format but API returns plain array. Also, `structure` field is returned as JSON string, not parsed object.
- **Fix:** Updated test to handle plain array response and parse structure string
- **Files modified:** app/e2e/api/email-templates.api.spec.ts

**2. [Rule 3 - Blocking] Seeds not present in running container**
- **Found during:** Task 2 first test run
- **Issue:** Plan 105-01 added seeds to db.ts but the Docker container hadn't been rebuilt
- **Fix:** Rebuilt Docker image (`docker compose build docflow`) and redeployed container
- **Files modified:** None (infrastructure action)

## Verification Results

- TypeScript compiles without errors
- 8/8 E2E tests pass
- `email_template` appears in execute-catpaw.ts skip array, tool loading, and dispatch
- `email_template` connector node works in canvas-executor.ts

## Self-Check: PASSED
