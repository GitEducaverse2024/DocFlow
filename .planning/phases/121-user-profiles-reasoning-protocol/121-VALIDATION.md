---
phase: 121
slug: user-profiles-reasoning-protocol
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 121 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already configured) |
| **Config file** | app/vitest.config.ts |
| **Quick run command** | `cd app && npx vitest run src/lib/__tests__/catbot-user-profile.test.ts src/lib/__tests__/catbot-prompt-assembler.test.ts` |
| **Full suite command** | `cd app && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command above
- **After every plan wave:** Run `cd app && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 121-01-01 | 01 | 1 | PROFILE-01, PROFILE-05 | unit | `npx vitest run src/lib/__tests__/catbot-user-profile.test.ts -t "auto-create"` | ❌ W0 | ⬜ pending |
| 121-01-02 | 01 | 1 | PROFILE-02, PROFILE-03 | unit | `npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -t "profile"` | ✅ extend | ⬜ pending |
| 121-01-03 | 01 | 1 | PROFILE-04 | unit | `npx vitest run src/lib/__tests__/catbot-user-profile.test.ts -t "extract"` | ❌ W0 | ⬜ pending |
| 121-02-01 | 02 | 1 | REASON-01..05 | unit | `npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -t "reasoning"` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/lib/__tests__/catbot-user-profile.test.ts` — stubs for PROFILE-01, PROFILE-04, PROFILE-05
- [ ] Extended tests in `catbot-prompt-assembler.test.ts` — covers PROFILE-03, REASON-01..05

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Profile auto-created on first Telegram message | PROFILE-01 | Requires real Telegram bot | Send message via Telegram, check catbot.db for telegram:{chat_id} profile |
| Reasoning depth changes with complexity | REASON-01..04 | Requires LLM inference | Ask simple ("lista catbrains") vs complex ("diseña un pipeline multi-agente") and compare response depth |
| Profile updates after conversation | PROFILE-04 | Full integration flow | Have a conversation, check profile updated_at changed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
