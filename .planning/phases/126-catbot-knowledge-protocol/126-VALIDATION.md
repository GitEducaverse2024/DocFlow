---
phase: 126
slug: catbot-knowledge-protocol
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 126 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | app/vitest.config.ts |
| **Quick run command** | `cd ~/docflow/app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts src/lib/__tests__/catbot-knowledge-gap.test.ts -x` |
| **Full suite command** | `cd ~/docflow/app && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd ~/docflow/app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts src/lib/__tests__/catbot-knowledge-gap.test.ts -x`
- **After every plan wave:** Run `cd ~/docflow/app && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 126-01-01 | 01 | 0 | KPROTO-02, KPROTO-03 | unit | `npx vitest run src/lib/__tests__/catbot-knowledge-gap.test.ts` | ❌ W0 | ⬜ pending |
| 126-01-02 | 01 | 0 | KPROTO-01, KPROTO-04, KPROTO-05 | unit | `npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts` | ✅ (extend) | ⬜ pending |
| 126-02-01 | 02 | 1 | KPROTO-03 | unit | `npx vitest run src/lib/__tests__/catbot-knowledge-gap.test.ts` | ❌ W0 | ⬜ pending |
| 126-02-02 | 02 | 1 | KPROTO-02 | unit | `npx vitest run src/lib/__tests__/catbot-knowledge-gap.test.ts` | ❌ W0 | ⬜ pending |
| 126-03-01 | 03 | 2 | KPROTO-01 | unit | `npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts` | ✅ (extend) | ⬜ pending |
| 126-03-02 | 03 | 2 | KPROTO-04 | unit | `npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts` | ✅ (extend) | ⬜ pending |
| 126-03-03 | 03 | 2 | KPROTO-05 | unit | `npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts` | ✅ (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/catbot-knowledge-gap.test.ts` — stubs for KPROTO-02, KPROTO-03
- [ ] Extend `src/lib/__tests__/catbot-prompt-assembler.test.ts` — stubs for KPROTO-01, KPROTO-04, KPROTO-05
- [ ] Run `knowledge-tools-sync.test.ts` after adding tool to verify bidirectional sync (KTREE-02)

*Existing infrastructure covers framework and config — only test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CatBot auto-calls log_knowledge_gap when query returns 0 results | KPROTO-04 | Requires LLM runtime behavior | Ask CatBot about non-existent topic, verify gap logged in DB |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
