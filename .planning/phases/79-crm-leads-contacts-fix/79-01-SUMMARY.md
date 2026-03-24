---
phase: 79-crm-leads-contacts-fix
plan: 01
subsystem: holded-mcp
tags: [testing, crm, leads, contacts, regression-guards]
dependency_graph:
  requires: []
  provides: [lead-note-field-tests, stageid-passthrough-test, contact-search-filter-tests]
  affects: []
tech_stack:
  added: []
  patterns: [tdd-verification, client-side-filter-assertion]
key_files:
  created: []
  modified:
    - ~/holded-mcp/src/__tests__/leads.test.ts
    - ~/holded-mcp/src/__tests__/contact-search.test.ts
decisions: []
metrics:
  duration: 89s
  completed: "2026-03-24T20:50:00Z"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 6
  tests_total: 333
---

# Phase 79 Plan 01: CRM Leads + Contacts Fix Regression Tests Summary

Unit tests proving note field mapping (title+desc not text), stageId passthrough, and client-side contact search filtering -- 6 new test cases as regression guards for CFIX-01 through CFIX-05.

## What Was Done

### Task 1: Lead note fields + stageId passthrough tests (1160ceb)

Added 4 new test cases to `leads.test.ts`:

1. **Note sends title+desc, NOT text** -- Asserts POST body contains `{ title, desc }` and does NOT have a `text` property
2. **Note with only title** -- Asserts body is exactly `{ title }` with no `desc` or `text` keys
3. **Missing title rejected** -- Asserts Zod validation rejects when title is missing
4. **stageId passthrough** -- Asserts `holded_create_lead` passes `stageId` value unchanged to the API body

### Task 2: Client-side contact filtering tests (32aa8c9)

Added 2 new test cases to `contact-search.test.ts`:

1. **Client-side filtering (no API query params)** -- Asserts `GET /contacts` is called exactly once with no query parameters, and result is filtered to matching contacts only
2. **Case-insensitive filtering** -- Asserts uppercase query `ACME` still matches lowercase contact names

## Verification

Full test suite: **333 tests pass, 0 failures** across 28 test files.

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 1160ceb | test(79-01): add lead note field mapping and stageId passthrough tests |
| 2 | 32aa8c9 | test(79-01): add client-side contact filtering assertions |
