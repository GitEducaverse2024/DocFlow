---
phase: 119
slug: promptassembler
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 119 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | app/vitest.config.ts |
| **Quick run command** | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts` |
| **Full suite command** | `cd app && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts`
- **After every plan wave:** Run `cd app && npx vitest run && npm run build --prefix app`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 119-01-01 | 01 | 1 | PROMPT-01 | unit | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -t "build"` | ❌ W0 | ⬜ pending |
| 119-01-02 | 01 | 1 | PROMPT-02 | unit | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -t "page"` | ❌ W0 | ⬜ pending |
| 119-01-03 | 01 | 1 | PROMPT-03 | unit | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -t "budget"` | ❌ W0 | ⬜ pending |
| 119-02-01 | 02 | 1 | PROMPT-04 | unit | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -t "query"` | ❌ W0 | ⬜ pending |
| 119-02-02 | 02 | 1 | PROMPT-05 | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts -t "sources"` | partial | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/lib/__tests__/catbot-prompt-assembler.test.ts` — stubs for PROMPT-01, PROMPT-02, PROMPT-03, PROMPT-04
- [ ] Sources test added to `app/src/lib/__tests__/knowledge-tree.test.ts` — covers PROMPT-05

*Existing infrastructure covers framework needs (vitest already configured).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CatBot responds with page-aware knowledge | PROMPT-02 | Full integration requires running chat | 1. Open CatBot on /catflow page 2. Ask "what can I do here?" 3. Verify response mentions CatFlow features |
| CatBot can use query_knowledge to deep-dive | PROMPT-04 | Tool invocation requires LLM inference | 1. Ask CatBot about a feature not on current page 2. Verify it uses query_knowledge to find info |
| Token budget doesn't break Libre models | PROMPT-03 | Requires actual model inference | 1. Set CatBot model to a Libre tier model 2. Have a conversation 3. Verify no context overflow errors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
