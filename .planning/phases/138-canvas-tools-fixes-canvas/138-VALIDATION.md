---
phase: 138
slug: canvas-tools-fixes-canvas
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 138 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing) |
| **Config file** | app/vitest.config.ts |
| **Quick run command** | `cd ~/docflow/app && npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts` |
| **Full suite command** | `cd ~/docflow/app && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd ~/docflow/app && npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts`
- **After every plan wave:** Run `cd ~/docflow/app && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 138-01-01 | 01 | 0 | CANVAS-01,02,03 | unit | `cd ~/docflow/app && npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts` | ❌ W0 | ⬜ pending |
| 138-02-01 | 02 | 1 | CANVAS-01 | unit | `npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts -t "persists instructions"` | ❌ W0 | ⬜ pending |
| 138-02-02 | 02 | 1 | CANVAS-01 | unit | `npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts -t "persists model"` | ❌ W0 | ⬜ pending |
| 138-03-01 | 03 | 1 | CANVAS-02 | unit | `npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts -t "OUTPUT terminal"` | ❌ W0 | ⬜ pending |
| 138-03-02 | 03 | 1 | CANVAS-02 | unit | `npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts -t "CONDITION sourceHandle"` | ❌ W0 | ⬜ pending |
| 138-03-03 | 03 | 1 | CANVAS-02 | unit | `npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts -t "duplicate branch"` | ❌ W0 | ⬜ pending |
| 138-03-04 | 03 | 1 | CANVAS-02 | unit | `npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts -t "START max 1"` | ❌ W0 | ⬜ pending |
| 138-04-01 | 04 | 1 | CANVAS-03 | unit | `npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts -t "empty label"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/lib/__tests__/canvas-tools-fixes.test.ts` — test stubs for CANVAS-01, CANVAS-02, CANVAS-03
- [ ] Reference mock pattern from existing `catbot-db.test.ts` for better-sqlite3

*Wave 0 creates test infrastructure before implementation begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CatBot persists fields visible in editor UI | CANVAS-01 | End-to-end UI verification | Use CatBot to add node with instructions+model, reload editor, verify fields visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
