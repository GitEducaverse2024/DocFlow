---
phase: 96
plan: 01
subsystem: telegram-bot, catbot-chat
tags: [telegram, sudo, catbot, integration, security]
dependency_graph:
  requires: [phase-95-telegram-config-service]
  provides: [telegram-sudo-system, catbot-telegram-channel]
  affects: [catbot-chat-route, telegram-bot-service]
tech_stack:
  added: []
  patterns: [scrypt-timing-safe-comparison, channel-based-system-prompt, in-memory-sudo-sessions]
key_files:
  created: []
  modified:
    - app/src/lib/services/telegram-bot.ts
    - app/src/app/api/catbot/chat/route.ts
decisions:
  - Reused same scrypt verification pattern from lib/sudo.ts (verifyPassword) directly in TelegramBotService
  - Telegram passes sudo_active=boolean to CatBot endpoint rather than session tokens
  - 15-minute lockout (vs 5-minute for web) given Telegram attack surface
  - Response adaptation strips HTML and converts actions to text links
metrics:
  duration: 2m 30s
  completed: 2026-03-30
---

# Phase 96 Plan 01: CatBot + Sudo Integration for Telegram Summary

Scrypt sudo system with lockout protection in TelegramBotService, CatBot endpoint adapted for Telegram channel with concise system prompt and response formatting.

## Completed Tasks

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Sudo system + CatBot integration in telegram-bot.ts | 4d868a9 | SUDO-01..06 + INT-01, INT-04..06 |
| 2 | Channel + sudo_active support in CatBot endpoint | 417138b | INT-02, INT-03 |

## Changes Made

### telegram-bot.ts (SUDO-01..06, INT-01, INT-04..06)

**Sudo system:**
- `handleSudo()`: extracts key from `/sudo {key}`, validates against catbot_sudo scrypt hash
- `verifySudoPassword()`: scrypt with timing-safe comparison (same as lib/sudo.ts)
- `isSudoActive()`: checks in-memory Map<chatId, expiresAt>
- `sudoSessions` Map: chat_id to expires_at_ms with configurable TTL from settings
- `sudoFailures` Map: 5 failures triggers 15-minute lockout per chat_id
- Message deletion on /sudo to hide password from chat history

**CatBot integration:**
- `handleCatBotMessage()`: POST to /api/catbot/chat with channel='telegram', sudo_active=boolean, stream=false
- 60-second timeout for tool-calling operations
- `adaptResponse()`: converts navigation actions to text links, summarizes tool calls, strips HTML to Telegram Markdown

### catbot/chat/route.ts (INT-02, INT-03)

- Accepts `channel` and `sudo_active` in request body
- When `channel='telegram' && sudo_active=true`, bypasses token-based sudo validation
- Appends Telegram-specific system prompt section for concise responses

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- TypeScript: `npx tsc --noEmit` passes clean (0 errors)
- Build: `npm run build` compiles successfully
- Pre-existing migration errors (catbrains table) are out of scope

## Requirements Covered

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| SUDO-01 | Complete | handleSudo() with /sudo command parsing |
| SUDO-02 | Complete | verifySudoPassword() with scrypt + timingSafeEqual |
| SUDO-03 | Complete | sudoSessions Map with configurable TTL |
| SUDO-04 | Complete | deleteMessage() call on /sudo message |
| SUDO-05 | Complete | sudoFailures Map, 5 attempts = 15 min lockout |
| SUDO-06 | Complete | SUDO_REQUIRED_MESSAGE when CatBot returns sudo_required |
| INT-01 | Complete | handleCatBotMessage() calls /api/catbot/chat |
| INT-02 | Complete | channel + sudo_active accepted in endpoint body |
| INT-03 | Complete | Telegram system prompt appended when channel=telegram |
| INT-04 | Complete | Navigation actions converted to text links |
| INT-05 | Complete | Tool calls shown as emoji summary |
| INT-06 | Complete | HTML stripped, adapted to Telegram Markdown |

## Self-Check: PASSED
