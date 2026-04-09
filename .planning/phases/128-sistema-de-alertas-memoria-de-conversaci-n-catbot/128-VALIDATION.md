---
phase: 128
slug: sistema-de-alertas-memoria-de-conversacion-catbot
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 128 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | app/vitest.config.ts |
| **Quick run command** | `cd ~/docflow/app && npx vitest run src/lib/__tests__/alert-service.test.ts src/lib/__tests__/catbot-conversation-memory.test.ts -x` |
| **Full suite command** | `cd ~/docflow/app && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green + manual AlertDialog verification
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 128-01-01 | 01 | 0 | ALERTS-01, ALERTS-02 | unit | `npx vitest run src/lib/__tests__/alert-service.test.ts` | ❌ W0 | ⬜ pending |
| 128-01-02 | 01 | 1 | ALERTS-02 | unit | `npx vitest run src/lib/__tests__/alert-service.test.ts` | ❌ W0 | ⬜ pending |
| 128-01-03 | 01 | 1 | ALERTS-01 | manual | Visual — AlertDialog renders grouped alerts on dashboard | N/A | ⬜ pending |
| 128-02-01 | 02 | 0 | CONVMEM-01, CONVMEM-02 | unit | `npx vitest run src/lib/__tests__/catbot-conversation-memory.test.ts` | ❌ W0 | ⬜ pending |
| 128-02-02 | 02 | 1 | CONVMEM-01 | unit | `npx vitest run src/lib/__tests__/catbot-conversation-memory.test.ts` | ❌ W0 | ⬜ pending |
| 128-02-03 | 02 | 1 | CONVMEM-02 | unit | `npx vitest run src/lib/__tests__/catbot-conversation-memory.test.ts` | ❌ W0 | ⬜ pending |
| 128-03-01 | 03 | 2 | CONVMEM-03 | unit | `npx vitest run src/lib/__tests__/catbot-conversation-memory.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/alert-service.test.ts` — stubs for ALERTS-01, ALERTS-02
- [ ] `src/lib/__tests__/catbot-conversation-memory.test.ts` — stubs for CONVMEM-01, CONVMEM-02, CONVMEM-03

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AlertDialog popup on dashboard | ALERTS-01 | UI visual layout + forced acknowledgment | Load dashboard with pending alerts, verify grouped popup appears |
| Sudo preserves chat context | CONVMEM-02 | Requires CatBot runtime | Chat with CatBot, enter sudo, verify prior messages still in context |
| Telegram memory retention | CONVMEM-03 | Requires Telegram bot runtime | Send 15+ messages via Telegram, verify CatBot remembers earlier context |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
