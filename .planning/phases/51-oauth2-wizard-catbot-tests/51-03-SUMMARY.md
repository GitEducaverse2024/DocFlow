---
phase: 51-oauth2-wizard-catbot-tests
plan: 03
subsystem: connectors-ui
tags: [gmail, wizard, oauth2, ui, emerald]
dependency_graph:
  requires: [51-01]
  provides: [gmail-wizard-component, connectors-page-gmail-integration]
  affects: [connectors-page, gmail-connector-creation]
tech_stack:
  added: []
  patterns: [multi-step-wizard-dialog, emerald-accent-theming, gmail-subtype-parsing]
key_files:
  created:
    - app/src/components/connectors/gmail-wizard.tsx
  modified:
    - app/src/app/connectors/page.tsx
decisions:
  - Dialog-based wizard (not Sheet) for Gmail connector creation
  - OAuth2 flow uses auth URL generation + code exchange inline in step 2C
  - Connection test auto-starts on step 3 mount with 800ms delays between phases
  - GmailSubtitle component parses gmail_subtype and config.user for list display
metrics:
  duration: 295s
  completed: "2026-03-16T20:49:01Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 51 Plan 03: Gmail Wizard UI Summary

4-step Dialog wizard for Gmail connector creation with emerald branding, OAuth2 inline flow, animated connection test, and connector list integration.

## Completed Tasks

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Create gmail-wizard.tsx with 4-step wizard | c3fafe4 | app/src/components/connectors/gmail-wizard.tsx |
| 2 | Integrate wizard into connectors page with emerald badge | ff5cc3a | app/src/app/connectors/page.tsx |

## What Was Built

### Gmail Wizard Component (gmail-wizard.tsx, ~930 lines)
- **Step 1 (Cuenta):** Two clickable cards for Personal vs Workspace account type selection with emerald highlight
- **Step 2A (Personal App Password):** From name, email, app password fields with Google instructions link
- **Step 2B (Workspace App Password):** Same plus domain field, smtp-relay note, toggle to OAuth2
- **Step 2C (Workspace OAuth2):** Client ID/Secret fields, auth URL generation, code paste + exchange, collapsible Google Cloud Console setup instructions (OAUTH-04, OAUTH-05)
- **Step 3 (Test):** 3 animated status lines (SMTP connection, authentication, test email send) with auto-start, retry, and skip options
- **Step 4 (Confirmacion):** Summary card with Listo para usar badge, usage snippets for Canvas/Tareas/CatBot
- Progress bar with 4 emerald-highlighted dots at top

### Connectors Page Integration
- Gmail badge color changed from red to emerald (UI-01)
- Gmail type card click opens wizard Dialog instead of Sheet
- Gmail type in Sheet selector also redirects to wizard
- GmailSubtitle component shows account type (Personal/Workspace/OAuth2) and email in connector list (UI-09)

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- TypeScript compiles with zero errors (both tasks)
- Gmail wizard component exists with 4 steps and all specified UI elements
- Connectors page imports and renders GmailWizard
- Gmail badge uses emerald colors (not red)
- Gmail type selector opens wizard dialog (not sheet)
