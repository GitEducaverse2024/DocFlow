---
phase: 129
slug: intent-queue-promesas-persistentes-de-catbot
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 129 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | app/vitest.config.ts |
| **Quick run command** | `cd ~/docflow/app && npx vitest run src/lib/__tests__/intent-queue.test.ts src/lib/__tests__/intent-worker.test.ts -x` |
| **Full suite command** | `cd ~/docflow/app && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green + CatBot-as-oracle test
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 129-01-01 | 01 | 0 | INTENT-01, INTENT-03 | unit | `npx vitest run src/lib/__tests__/intent-queue.test.ts` | ❌ W0 | ⬜ pending |
| 129-01-02 | 01 | 1 | INTENT-01 | unit | `npx vitest run src/lib/__tests__/intent-queue.test.ts` | ❌ W0 | ⬜ pending |
| 129-01-03 | 01 | 1 | INTENT-03 | unit | `npx vitest run src/lib/__tests__/intent-queue.test.ts knowledge-tools-sync.test.ts` | ❌ W0 | ⬜ pending |
| 129-02-01 | 02 | 0 | INTENT-04 | unit | `npx vitest run src/lib/__tests__/intent-worker.test.ts` | ❌ W0 | ⬜ pending |
| 129-02-02 | 02 | 2 | INTENT-02, INTENT-04 | unit | `npx vitest run src/lib/__tests__/intent-worker.test.ts catbot-prompt-assembler.test.ts` | ❌ W0 | ⬜ pending |
| 129-03-01 | 03 | 3 | INTENT-05, INTENT-06 | unit | `npx vitest run src/lib/__tests__/alert-service.test.ts catbot-prompt-assembler.test.ts` | ✅ (extend) | ⬜ pending |
| 129-03-02 | 03 | 3 | INTENT-01..06 | manual | CatBot-as-oracle E2E via Telegram | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/intent-queue.test.ts` — stubs for INTENT-01, INTENT-03 (CRUD + tools)
- [ ] `src/lib/__tests__/intent-worker.test.ts` — stubs for INTENT-04 (retry loop + stuck detection)
- [ ] Extend `catbot-prompt-assembler.test.ts` — stubs for INTENT-02 (protocolo + open intents context)
- [ ] Extend `alert-service.test.ts` — stub for INTENT-06 (checkIntentsUnresolved)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CatBot creates intent on multi-step request | INTENT-02 | LLM runtime behavior | Ask CatBot via Telegram "ejecuta el catflow de test inbound", verify intent row created |
| IntentWorker re-queues failed intent | INTENT-04 | Requires worker tick | Force an intent to failed, wait 5min, verify status back to pending + attempts++ |
| Gap logged when intent fails by knowledge | INTENT-05 | LLM runtime behavior | Ask CatBot something unknown that requires multi-step, verify both intent failed AND knowledge_gap created |
| Alert appears when >5 unresolved | INTENT-06 | Runtime UI | Insert 6+ failed intents, reload dashboard, verify AlertDialog shows "Intents sin resolver" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
