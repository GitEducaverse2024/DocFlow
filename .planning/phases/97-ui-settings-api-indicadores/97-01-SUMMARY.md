---
phase: "97"
plan: "01"
subsystem: telegram-ui-api
tags: [telegram, settings, api, system-indicators]
dependency-graph:
  requires: [telegram-bot-service, crypto, db-telegram-config]
  provides: [telegram-api-endpoints, telegram-settings-ui, telegram-system-indicators]
  affects: [settings-page, footer, system-health-panel]
tech-stack:
  added: []
  patterns: [api-routes, wizard-dialog, status-dots]
key-files:
  created:
    - app/src/app/api/telegram/config/route.ts
    - app/src/app/api/telegram/test/route.ts
    - app/src/app/api/telegram/pause/route.ts
    - app/src/app/api/telegram/resume/route.ts
  modified:
    - app/src/app/settings/page.tsx
    - app/src/components/layout/footer.tsx
    - app/src/components/system/system-health-panel.tsx
decisions:
  - Used 'telegram' LogSource (not 'telegram-api') to match existing logger type
  - Added DELETE endpoint for deactivation (not in original plan but needed by UI)
  - Fetches /api/telegram/config in footer with 60s polling instead of extending health hook
metrics:
  duration: 6m
  completed: "2026-03-30T11:42:00Z"
---

# Phase 97 Plan 01: Telegram API Endpoints, Settings UI Wizard, and System Indicators Summary

Telegram configuration API (GET/POST/PATCH/DELETE config, test, pause, resume), 3-step wizard in Settings for token/access/activation, footer status dot, and /system card.

## Tasks Completed

| Task | Description | Commit | Key Files |
|------|-------------|--------|-----------|
| 1 | API endpoints for telegram config, test, pause, resume | f74b51f | api/telegram/*/route.ts |
| 2 | TelegramSettings UI with 3-step wizard dialog | 2947696 | settings/page.tsx |
| 3 | Footer dot (SYS-01) + /system card (SYS-02) | 4b97404 | footer.tsx, system-health-panel.tsx |

## Requirements Covered

- API-01: GET /api/telegram/config with masked token
- API-02: POST /api/telegram/config with token validation + encryption
- API-03: PATCH /api/telegram/config for permissions, users, status
- API-04: POST /api/telegram/test verifies token, returns bot info
- API-05: POST /api/telegram/pause pauses polling
- API-06: POST /api/telegram/resume resumes polling
- UI-01: "Canales externos" section in /settings after CatBot Security
- UI-02: Telegram card with status badge, username, message count
- UI-03: 3-step wizard (Token, Access, Test & Activate)
- UI-04: Token input with eye toggle + @BotFather help text
- UI-05: Radio any/whitelist + permissions checkboxes
- UI-06: Test connection showing bot info + Activate button
- UI-07: Test/Pause/Resume/Deactivate action buttons
- UI-08: Add/remove @usernames with inline editing
- SYS-01: Footer dot green/yellow/red conditional on configured
- SYS-02: /system card with status, bot username, messages, last message

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed LogSource type mismatch**
- Found during: Task 1 verification
- Issue: Used 'telegram-api' as LogSource but type only allows 'telegram'
- Fix: Changed all API routes to use 'telegram'
- Files: All 4 route files

**2. [Rule 1 - Bug] Removed unused UserMinus import**
- Found during: Build verification
- Issue: ESLint error on unused import
- Fix: Removed UserMinus from lucide-react import
- Files: settings/page.tsx

**3. [Rule 2 - Missing] Added DELETE endpoint for deactivation**
- Found during: Task 2 (UI needed deactivate functionality)
- Issue: Plan only specified GET/POST/PATCH but UI-07 requires deactivation
- Fix: Added DELETE handler to config route that stops bot + clears config
- Files: api/telegram/config/route.ts

## Verification

- TypeScript: `npx tsc --noEmit` passes cleanly
- Build: `npm run build` compiles successfully
- Pre-existing migration errors (catbrains table columns) are out of scope
