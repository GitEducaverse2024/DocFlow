---
phase: 80-safe-delete-email-confirmation
plan: 02
subsystem: holded-mcp
tags: [safe-delete, requestDelete, tool-refactor]
dependency_graph:
  requires: [pending-deletes-store, email-sender, safe-delete-routes]
  provides: [all-delete-tools-use-requestDelete]
  affects: [holded-mcp-tools]
tech_stack:
  added: []
  patterns: [requestDelete-wrapper, label-resolution-GET]
key_files:
  created: []
  modified:
    - /home/deskmath/holded-mcp/src/tools/contacts.ts
    - /home/deskmath/holded-mcp/src/tools/documents.ts
    - /home/deskmath/holded-mcp/src/tools/products.ts
    - /home/deskmath/holded-mcp/src/tools/payments.ts
    - /home/deskmath/holded-mcp/src/tools/services.ts
    - /home/deskmath/holded-mcp/src/tools/contact-groups.ts
    - /home/deskmath/holded-mcp/src/tools/sales-channels.ts
    - /home/deskmath/holded-mcp/src/tools/warehouses.ts
    - /home/deskmath/holded-mcp/src/tools/numbering-series.ts
    - /home/deskmath/holded-mcp/src/tools/expenses-accounts.ts
    - /home/deskmath/holded-mcp/src/tools/projects.ts
    - /home/deskmath/holded-mcp/src/tools/project-tasks.ts
    - /home/deskmath/holded-mcp/src/tools/time-tracking.ts
    - /home/deskmath/holded-mcp/src/tools/employee-timesheets.ts
    - /home/deskmath/holded-mcp/src/__tests__/contacts.test.ts
    - /home/deskmath/holded-mcp/src/__tests__/documents.test.ts
    - /home/deskmath/holded-mcp/src/__tests__/products.test.ts
    - /home/deskmath/holded-mcp/src/__tests__/payments.test.ts
    - /home/deskmath/holded-mcp/src/__tests__/services.test.ts
    - /home/deskmath/holded-mcp/src/__tests__/contact-groups.test.ts
    - /home/deskmath/holded-mcp/src/__tests__/sales-channels.test.ts
    - /home/deskmath/holded-mcp/src/__tests__/warehouses.test.ts
    - /home/deskmath/holded-mcp/src/__tests__/numbering-series.test.ts
    - /home/deskmath/holded-mcp/src/__tests__/expenses-accounts.test.ts
    - /home/deskmath/holded-mcp/src/__tests__/projects.test.ts
    - /home/deskmath/holded-mcp/src/__tests__/project-tasks.test.ts
    - /home/deskmath/holded-mcp/src/__tests__/time-tracking.test.ts
    - /home/deskmath/holded-mcp/src/__tests__/employee-timesheets.test.ts
decisions:
  - 7 tools with label resolution (contacts, documents, products, services, contact-groups, projects, project-tasks) do GET before requestDelete for human-readable email labels
  - 7 tools without useful names (payments, sales-channels, warehouses, numbering-series, expenses-accounts, time-tracking, employee-timesheets) use ID as label to avoid unnecessary API calls
  - time-tracking label includes projectId context for disambiguation
metrics:
  duration: 4m
  completed: 2026-03-24
  tasks: 2
  tests_added: 9
  tests_total: 383
  files_modified: 28
---

# Phase 80 Plan 02: Refactor 14 DELETE Tools to requestDelete() Summary

All 14 DELETE tool handlers replaced with requestDelete() wrapper -- zero direct client.delete() calls remain in tools/, completing the Safe Delete email confirmation chain.

## Tasks Completed

### Task 1: Refactor 7 invoicing DELETE tools

**Commit:** `371c8b1`

Refactored 7 invoicing module tools:

- **With label resolution (GET before delete):** contacts.ts (name), documents.ts (docNumber/ref), products.ts (name), services.ts (name), contact-groups.ts (name) -- each fetches the resource first to get a human-readable label for the confirmation email.

- **Without label resolution (ID as label):** payments.ts (paymentId), sales-channels.ts (channelId) -- no useful human-readable name available, so ID is used directly.

Updated 7 test files: added `vi.mock('../utils/pending-deletes.js')`, replaced `client.delete` assertions with `requestDelete` assertions, added fallback label tests for tools with GET resolution. All 95 tests pass.

### Task 2: Refactor 7 remaining DELETE tools + global verification

**Commit:** `70b17f9`

Refactored 7 remaining tools across projects and team modules:

- **With label resolution:** projects.ts (name, deleteModule: 'projects'), project-tasks.ts (name, deleteModule: 'projects')

- **Without label resolution:** warehouses.ts (warehouseId), numbering-series.ts (serieId), expenses-accounts.ts (accountId), time-tracking.ts (timeTrackingId with projectId context, deleteModule: 'projects'), employee-timesheets.ts (timeId, deleteModule: 'team')

Updated 7 test files with same vi.mock pattern. Added new holded_delete_timesheet test (was missing from existing test file). All 383 tests pass.

## Verification Results

- Full test suite: 383 tests pass (374 from Plan 01 + 9 new delete confirmation tests), zero regressions
- SDEL-15 (grep): Zero `client.delete()` calls in src/tools/
- SDEL-11 (grep): Zero `process.env.` violations in src/utils/pending-deletes.ts and src/utils/email-sender.ts
- SDEL-06 (grep): All 14 DELETE tool files contain `requestDelete` (import + usage)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing test] Added holded_delete_timesheet test**
- **Found during:** Task 2
- **Issue:** employee-timesheets.test.ts had no test for the delete handler
- **Fix:** Added `describe('holded_delete_timesheet')` test block verifying requestDelete called with correct params
- **Files modified:** src/__tests__/employee-timesheets.test.ts
- **Commit:** `70b17f9`

## Safe Delete Chain (Complete)

The full chain is now operational:

1. MCP tool handler calls `requestDelete()` with resource info
2. `requestDelete()` creates token in pending-deletes store
3. Confirmation email sent via nodemailer with Confirm/Cancel links
4. User clicks Confirm -> Express GET /confirm/:token -> `client.delete()` executed
5. User clicks Cancel -> Express GET /cancel/:token -> token cancelled

## Self-Check: PASSED
