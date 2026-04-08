---
phase: 120
slug: config-catbot-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 120 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit) + playwright (e2e) |
| **Config file** | app/vitest.config.ts, app/e2e/ |
| **Quick run command** | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts` |
| **Full suite command** | `cd app && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts`
- **After every plan wave:** Run `cd app && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 120-01-01 | 01 | 1 | CONFIG-01 | unit | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -t "instructions"` | ✅ extend | ⬜ pending |
| 120-01-02 | 01 | 1 | CONFIG-02 | unit | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -t "personality"` | ✅ extend | ⬜ pending |
| 120-01-03 | 01 | 1 | CONFIG-04 | unit | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -t "config"` | ✅ extend | ⬜ pending |
| 120-02-01 | 02 | 1 | CONFIG-03 | e2e | `cd app && npx playwright test e2e/specs/settings.spec.ts` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — existing test infrastructure covers all phase requirements. Extend existing test files with new test cases.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CatBot behavior changes with custom instructions | CONFIG-01 | Requires LLM inference | 1. Set instructions_primary to "Always respond in English" 2. Ask CatBot something in Spanish 3. Verify response is in English |
| Personality custom text reflected | CONFIG-02 | Requires LLM inference | 1. Set personality custom to "usa analogias de cocina" 2. Ask CatBot to explain something 3. Verify cooking analogies used |
| Permission changes take immediate effect | CONFIG-03 | Full integration | 1. Uncheck a permission 2. Ask CatBot to use that tool 3. Verify it refuses |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
