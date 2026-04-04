---
phase: 109
slug: model-alias-routing-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 109 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | `app/vitest.config.ts` |
| **Quick run command** | `cd /home/deskmath/docflow/app && npx vitest run src/lib/services/__tests__/alias-routing.test.ts` |
| **Full suite command** | `cd /home/deskmath/docflow/app && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd /home/deskmath/docflow/app && npx vitest run src/lib/services/__tests__/alias-routing.test.ts`
- **After every plan wave:** Run `cd /home/deskmath/docflow/app && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green + `npm run build` succeeds
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 109-01-01 | 01 | 1 | ALIAS-02 | unit | `npx vitest run src/lib/services/__tests__/alias-routing.test.ts -t "seed"` | ❌ W0 | ⬜ pending |
| 109-01-02 | 01 | 1 | ALIAS-03 | unit | `npx vitest run src/lib/services/__tests__/alias-routing.test.ts -t "resolve"` | ❌ W0 | ⬜ pending |
| 109-01-03 | 01 | 1 | ALIAS-08 | unit | `npx vitest run src/lib/services/__tests__/alias-routing.test.ts -t "fallback"` | ❌ W0 | ⬜ pending |
| 109-01-04 | 01 | 1 | ALIAS-04 | unit | `npx vitest run src/lib/services/__tests__/alias-routing.test.ts -t "log"` | ❌ W0 | ⬜ pending |
| 109-01-05 | 01 | 1 | ALIAS-05 | unit | `npx vitest run src/lib/services/__tests__/alias-routing.test.ts -t "seed"` | ❌ W0 | ⬜ pending |
| 109-01-06 | 01 | 1 | ALIAS-01 | manual | Grep audit checklist | N/A | ⬜ pending |
| 109-02-01 | 02 | 2 | ALIAS-06 | integration | `npm run build` | N/A | ⬜ pending |
| 109-03-01 | 03 | 2 | ALIAS-06 | integration | `npm run build` | N/A | ⬜ pending |
| 109-03-02 | 03 | 2 | ALIAS-07 | manual | Trigger subsystems, check JSONL | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/services/__tests__/alias-routing.test.ts` — stubs for ALIAS-02, ALIAS-03, ALIAS-04, ALIAS-05, ALIAS-08
- [ ] Mock pattern: follow existing `discovery.test.ts` and `mid.test.ts` patterns (vi.mock for db, cache, logger, discovery, mid)

*Existing infrastructure covers test framework (vitest already configured).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| All hardcoded refs identified | ALIAS-01 | Audit requires human judgment on edge cases | Run grep for 'gemini-main', verify each ref is either migrated or documented as out-of-scope |
| Subsystem behavior unchanged | ALIAS-07 | End-to-end requires running Docker + LiteLLM | Trigger each subsystem (chat, catbot, canvas, process), check JSONL logs for alias resolution entries |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
