---
phase: 142
slug: iteration-loop-tuning-loop
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 142 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | app/jest.config.js |
| **Quick run command** | `cd app && npx jest --testPathPattern="catbot" --no-coverage` |
| **Full suite command** | `cd app && npx jest --no-coverage` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npx jest --testPathPattern="catbot" --no-coverage`
- **After every plan wave:** Run `cd app && npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 142-01-01 | 01 | 1 | LOOP-01 | unit | `cd app && npx jest --testPathPattern="route" --no-coverage` | ❌ W0 | ⬜ pending |
| 142-01-02 | 01 | 1 | LOOP-02 | unit | `cd app && npx jest --testPathPattern="route" --no-coverage` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/lib/__tests__/catbot-route-iteration.test.ts` — stubs for LOOP-01 (maxIterations=15, escalation threshold=10) and LOOP-02 (reporting intermedio cada 4 iteraciones sin texto)

*Existing catbot test infrastructure covers framework and fixtures.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CatBot reports progress during long canvas builds | LOOP-02 | Requires live LLM response to injected system message | Ask CatBot to build an 8-node canvas; verify progress messages appear in chat after ~4 tool calls |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
