---
phase: "95"
plan: "01"
subsystem: telegram
tags: [telegram, bot, service, database, long-polling]
dependency_graph:
  requires: [crypto.ts, db.ts, logger.ts, instrumentation.ts]
  provides: [telegram_config table, TelegramBotService singleton]
  affects: [instrumentation.ts startup sequence]
tech_stack:
  added: [Telegram Bot API via native fetch]
  patterns: [singleton service, long polling, AES-256-GCM encryption, sequential processing]
key_files:
  created:
    - app/src/lib/services/telegram-bot.ts
  modified:
    - app/src/lib/db.ts
    - app/src/lib/logger.ts
    - app/src/instrumentation.ts
decisions:
  - "Markdown retry fallback: sendMessage retries without parse_mode if Telegram rejects Markdown formatting"
  - "Empty whitelist = no access: both arrays must have entries for authorization to pass"
  - "Placeholder response in Phase 95: CatBot integration deferred to Phase 96"
metrics:
  duration: "117s"
  completed: "2026-03-30"
---

# Phase 95 Plan 01: DB + TelegramBotService Base Summary

telegram_config single-row table with AES-256-GCM encrypted token, plus TelegramBotService singleton with long polling (25s timeout), sequential message processing, whitelist authorization, message splitting, and pause/resume lifecycle.

## What Was Built

### telegram_config Table (DB-01, DB-02, DB-03)
- Single-row table enforced by `CHECK (id = 1)` constraint
- Token stored encrypted via existing `encrypt()`/`decrypt()` from `@/lib/crypto`
- No row exists until wizard configures it (DB-03)
- Fields: token_encrypted, bot_username, status, authorized_usernames (JSON), authorized_chat_ids (JSON), permissions_no_sudo (JSON), messages_count, last_message_at, timestamps

### TelegramBotService (SVC-01 through SVC-09)
- **SVC-01**: Singleton exported as `telegramBotService`, started in `instrumentation.ts`
- **SVC-02**: Long polling via `getUpdates?timeout=25` with AbortSignal timeout at 30s
- **SVC-03**: Updates processed sequentially in a for-of loop (no parallelism)
- **SVC-04**: On error, logs and sleeps 10s before retrying
- **SVC-05**: `pause()` / `resume()` methods; paused state checked in poll loop
- **SVC-06**: `start()` reads DB config, skips if no row or status != 'active'
- **SVC-07**: Whitelist by chat_id and @username; empty lists = no access
- **SVC-08**: `/start` replies with welcome message listing capabilities
- **SVC-09**: Messages >4096 chars split at newlines, then spaces, then hard-cut

### Logger
- Added `'telegram'` to `LogSource` union type

### Instrumentation
- TelegramBotService started after DrivePollingService in `register()` (skips test env)

## Verification

- `npx tsc --noEmit` -- zero errors
- `npm run build` -- compiled successfully
- Pre-existing migration errors (catbrains column count) are unrelated and out of scope

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Robustness] Markdown parse_mode retry fallback**
- **Found during:** sendMessage implementation
- **Issue:** Telegram rejects Markdown if text contains unescaped special chars
- **Fix:** On 400 error with "can't parse", retry without parse_mode
- **Files modified:** app/src/lib/services/telegram-bot.ts

No other deviations -- plan executed as written.

## Requirements Completed

| Requirement | Description | Status |
|-------------|-------------|--------|
| DB-01 | telegram_config table | Done |
| DB-02 | Token encrypted with AES-256-GCM | Done |
| DB-03 | No row until configured | Done |
| SVC-01 | Singleton in instrumentation.ts | Done |
| SVC-02 | Long polling getUpdates timeout=25s | Done |
| SVC-03 | Sequential message processing | Done |
| SVC-04 | 10s retry on error | Done |
| SVC-05 | Pause/resume without restart | Done |
| SVC-06 | Auto-start if active config | Done |
| SVC-07 | Whitelist verification | Done |
| SVC-08 | /start welcome message | Done |
| SVC-09 | Split long messages >4096 chars | Done |

## Commits

| Hash | Message |
|------|---------|
| f5b52bc | feat(95-01): add telegram_config table and TelegramBotService singleton |
