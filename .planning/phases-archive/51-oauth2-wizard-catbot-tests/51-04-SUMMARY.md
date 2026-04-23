---
phase: 51-oauth2-wizard-catbot-tests
plan: 04
subsystem: gmail-tests
tags: [gmail, e2e, api-tests, playwright, pom, oauth2, canvas, catbot]
dependency_graph:
  requires: [51-01, 51-02, 51-03]
  provides: [gmail-e2e-tests, gmail-api-tests, gmail-wizard-pom]
  affects: [test-coverage, regression-safety]
tech_stack:
  added: []
  patterns: [page-object-model, page-route-mocking, serial-test-describe, api-contract-testing]
key_files:
  created:
    - app/e2e/pages/gmail-wizard.pom.ts
    - app/e2e/specs/gmail.spec.ts
    - app/e2e/api/gmail.api.spec.ts
  modified: []
decisions:
  - page.route() mocking for all external APIs (Gmail SMTP, Google OAuth) to avoid real credentials
  - Serial test.describe for wizard flows (state depends on previous step)
  - APIRequest type alias for Playwright request context to simplify casts
  - Output parsing tests verify structured error responses (SMTP fails gracefully, no 500 crashes)
metrics:
  duration: 268s
  completed: "2026-03-16T20:56:54Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 51 Plan 04: Gmail E2E and API Tests Summary

Comprehensive Playwright E2E and API test suite for Gmail connector: wizard flows (App Password + OAuth2), Canvas integration (invoke + output parsing + rate-limit), CatBot tools, and CRUD with encryption/masking.

## Completed Tasks

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Gmail wizard POM and E2E UI tests | bfa7f5f | app/e2e/pages/gmail-wizard.pom.ts, app/e2e/specs/gmail.spec.ts |
| 2 | Gmail API tests for CRUD and invoke | c5ae8f0 | app/e2e/api/gmail.api.spec.ts |

## What Was Built

### Gmail Wizard POM (gmail-wizard.pom.ts, 205 lines)
- Locators for all 4 wizard steps: dialog, account type cards, form fields, OAuth2 controls, test status, confirmation
- Methods: selectAccountType, fillAppPasswordForm, toggleOAuth2, fillOAuth2Form, clickGenerateUrl, fillAuthCode, clickExchangeCode, nextStep, prevStep, skipTest, clickCreate, getTestStatusLines, getConfirmationSummary
- Extends BasePage pattern consistent with existing POMs

### Gmail E2E Specs (gmail.spec.ts, 514 lines)
- **TEST-01 (App Password Wizard):** Personal account 4-step wizard with mocked SMTP endpoints, Workspace account with domain field
- **TEST-02 (OAuth2 Wizard):** Workspace OAuth2 flow with mocked auth-url generation, code exchange, token verification
- **TEST-03 (Canvas Integration):** Connector node appearance in list, invoke API contract testing, output parsing for all 3 strategies (JSON with email fields, JSON without email fields, plain text fallback), rate-limit 1s delay verification between consecutive sends
- **TEST-04 (CatBot Integration):** Open CatBot, send "lista mis conectores de email", verify assistant response

### Gmail API Specs (gmail.api.spec.ts, 207 lines)
- **TEST-05 (CRUD):** POST create with encryption, GET with masked sensitive fields, GET list with masking, PATCH re-encrypt on update, DELETE with 404 verification
- **Invoke:** POST with email payload, verify structured error (no 500 crash)
- **test-credentials:** Empty payload -> 400, invalid credentials -> structured error
- **OAuth2 auth-url:** Missing params -> 400, with params -> structured response with url
- **OAuth2 exchange-code:** Missing code -> 400, invalid code -> structured error

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- TypeScript compiles with zero errors for all 3 test files
- POM has methods for all 4 wizard steps (selectAccountType, fillAppPasswordForm, toggleOAuth2, fillOAuth2Form, nextStep, prevStep, skipTest, clickCreate, etc.)
- E2E specs cover TEST-01 through TEST-04
- TEST-03 specifically covers: node appearance, execution via invoke, output parsing (3 strategies), rate-limit delay
- API specs cover TEST-05 (CRUD + encryption + masking + invoke + validation endpoints)
- All tests use mocking for external services (page.route for UI tests, structured error verification for API tests)

## Self-Check: PASSED

All 4 files found. Both commits (bfa7f5f, c5ae8f0) verified in git log.
