---
phase: 108
slug: model-intelligence-document-mid
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 108 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | `app/vitest.config.ts` |
| **Quick run command** | `cd /home/deskmath/docflow/app && npx vitest run src/lib/services/__tests__/mid.test.ts` |
| **Full suite command** | `cd /home/deskmath/docflow/app && npm run test:unit` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/lib/services/__tests__/mid.test.ts`
- **After every plan wave:** Run `npm run test:unit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 108-01-01 | 01 | 0 | MID-01 | unit | `npx vitest run src/lib/services/__tests__/mid.test.ts -t "schema"` | ❌ W0 | ⬜ pending |
| 108-01-02 | 01 | 0 | MID-02 | unit | `npx vitest run src/lib/services/__tests__/mid.test.ts -t "fields"` | ❌ W0 | ⬜ pending |
| 108-01-03 | 01 | 1 | MID-03 | unit | `npx vitest run src/lib/services/__tests__/mid.test.ts -t "seed"` | ❌ W0 | ⬜ pending |
| 108-01-04 | 01 | 1 | MID-04 | unit | `npx vitest run src/lib/services/__tests__/mid.test.ts -t "markdown"` | ❌ W0 | ⬜ pending |
| 108-02-01 | 02 | 1 | MID-05 | unit | `npx vitest run src/lib/services/__tests__/mid.test.ts -t "sync"` | ❌ W0 | ⬜ pending |
| 108-02-02 | 02 | 1 | MID-06 | unit | `npx vitest run src/lib/services/__tests__/mid.test.ts -t "crud"` | ❌ W0 | ⬜ pending |
| 108-02-03 | 02 | 1 | MID-07 | unit | `npx vitest run src/lib/services/__tests__/mid.test.ts -t "inactive"` | ❌ W0 | ⬜ pending |
| 108-02-04 | 02 | 2 | MID-08 | unit | `npx vitest run src/lib/services/__tests__/mid.test.ts -t "update"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/services/__tests__/mid.test.ts` — stubs for MID-01 through MID-08
- [ ] Mock patterns: reuse discovery.test.ts mock structure (db, cache, logger)

*Existing infrastructure covers framework install — Vitest already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CatBot receives MID markdown in context | MID-04 | Requires live CatBot integration | Trigger CatBot conversation, verify MID data present in system prompt |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
