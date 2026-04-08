---
phase: 124
slug: auto-enrichment-admin-protection
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 124 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already configured) |
| **Config file** | app/vitest.config.ts |
| **Quick run command** | `cd app && npx vitest run src/lib/__tests__/catbot-learned.test.ts` |
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
| 124-01-01 | 01 | 1 | LEARN-01, LEARN-02 | unit | `npx vitest run src/lib/__tests__/catbot-learned.test.ts -t "save"` | ❌ W0 | ⬜ pending |
| 124-01-02 | 01 | 1 | LEARN-03 | unit | `npx vitest run src/lib/__tests__/catbot-learned.test.ts -t "staging"` | ❌ W0 | ⬜ pending |
| 124-01-03 | 01 | 1 | LEARN-04 | unit | `npx vitest run src/lib/__tests__/catbot-learned.test.ts -t "query"` | ❌ W0 | ⬜ pending |
| 124-02-01 | 02 | 1 | ADMIN-01 | unit | `npx vitest run src/lib/__tests__/catbot-learned.test.ts -t "isolation"` | ❌ W0 | ⬜ pending |
| 124-02-02 | 02 | 1 | ADMIN-02, ADMIN-03 | unit | `npx vitest run src/lib/__tests__/catbot-learned.test.ts -t "sudo\|confirm"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/lib/__tests__/catbot-learned.test.ts` — stubs for LEARN-01..04, ADMIN-01..03

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CatBot saves learned entry after successful help | LEARN-01 | Requires real LLM interaction | 1. Solve a problem with CatBot 2. Ask "guarda lo que aprendimos" 3. Verify knowledge_learned has new entry |
| Staging prevents unvalidated injection | LEARN-03 | Full chain test | 1. Save entry 2. query_knowledge should NOT return it 3. Promote it 4. query_knowledge should return it |
| Cross-user isolation in Telegram | ADMIN-01 | Requires 2 Telegram users | 1. User A asks for profile 2. User B asks for profile 3. Neither sees the other's data |
| Delete user data requires confirmation | ADMIN-03 | CatBot oracle protocol | Ask CatBot "borra mis datos" → should get confirmation prompt → confirm → verify deleted |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
