---
phase: 122
slug: user-memory-capa-0
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 122 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already configured) |
| **Config file** | app/vitest.config.ts |
| **Quick run command** | `cd app && npx vitest run src/lib/__tests__/catbot-memory.test.ts` |
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
| 122-01-01 | 01 | 1 | MEMORY-01, MEMORY-02 | unit | `npx vitest run src/lib/__tests__/catbot-memory.test.ts -t "autoSaveRecipe"` | ❌ W0 | ⬜ pending |
| 122-01-02 | 01 | 1 | MEMORY-03 | unit | `npx vitest run src/lib/__tests__/catbot-memory.test.ts -t "matchRecipe"` | ❌ W0 | ⬜ pending |
| 122-01-03 | 01 | 1 | MEMORY-05 | unit | `npx vitest run src/lib/__tests__/catbot-memory.test.ts -t "updateSuccess"` | ❌ W0 | ⬜ pending |
| 122-01-04 | 01 | 1 | MEMORY-04 | unit | `npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -t "recipe"` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/lib/__tests__/catbot-memory.test.ts` — covers MEMORY-01, MEMORY-02, MEMORY-03, MEMORY-05
- [ ] Extended tests in `catbot-prompt-assembler.test.ts` — covers MEMORY-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Recipe auto-saved after complex CatBot task | MEMORY-01 | Requires real LLM + multi-tool flow | 1. Ask CatBot to do a 2+ tool task 2. Check user_memory table for new recipe |
| Recipe match speeds up next identical request | MEMORY-03/04 | Requires LLM behavior observation | 1. Repeat the same request 2. Verify CatBot follows recipe steps |
| CatBot can list and forget recipes | All | CatBot oracle protocol | Ask CatBot "lista mis recetas" and "olvida la receta X" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
