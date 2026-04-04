---
phase: 107
slug: llm-discovery-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 107 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | `app/vitest.config.ts` (verify at Wave 0) |
| **Quick run command** | `cd /home/deskmath/docflow/app && npx vitest run src/lib/services/__tests__/discovery.test.ts` |
| **Full suite command** | `cd /home/deskmath/docflow/app && npm run test:unit` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/lib/services/__tests__/discovery.test.ts`
- **After every plan wave:** Run `npm run test:unit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 107-01-01 | 01 | 0 | DISC-01..08 | unit | `npx vitest run src/lib/services/__tests__/discovery.test.ts` | ❌ W0 | ⬜ pending |
| 107-01-02 | 01 | 1 | DISC-01 | unit | `npx vitest run src/lib/services/__tests__/discovery.test.ts -t "ollama"` | ❌ W0 | ⬜ pending |
| 107-01-03 | 01 | 1 | DISC-02 | unit | `npx vitest run src/lib/services/__tests__/discovery.test.ts -t "provider"` | ❌ W0 | ⬜ pending |
| 107-01-04 | 01 | 1 | DISC-03 | unit | `npx vitest run src/lib/services/__tests__/discovery.test.ts -t "models per provider"` | ❌ W0 | ⬜ pending |
| 107-01-05 | 01 | 1 | DISC-04 | unit | `npx vitest run src/lib/services/__tests__/discovery.test.ts -t "cache"` | ❌ W0 | ⬜ pending |
| 107-01-06 | 01 | 1 | DISC-05 | unit | `npx vitest run src/lib/services/__tests__/discovery.test.ts -t "catbot"` | ❌ W0 | ⬜ pending |
| 107-01-07 | 01 | 1 | DISC-06 | unit | `npx vitest run src/lib/services/__tests__/discovery.test.ts -t "degradation"` | ❌ W0 | ⬜ pending |
| 107-01-08 | 01 | 1 | DISC-07 | unit | `npx vitest run src/lib/services/__tests__/discovery.test.ts -t "dynamic"` | ❌ W0 | ⬜ pending |
| 107-01-09 | 01 | 1 | DISC-08 | manual+unit | Verify `instrumentation.ts` unchanged; test lazy init | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/services/__tests__/discovery.test.ts` — stubs for DISC-01 through DISC-08
- [ ] Verify `vitest.config.ts` exists and can resolve `@/` alias

*If vitest.config.ts already exists and works: "Existing infrastructure covers framework requirement."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Discovery does not block startup | DISC-08 | Must verify instrumentation.ts is untouched | 1. Check `instrumentation.ts` has no discovery imports. 2. Stop Ollama, restart app, verify app starts. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
