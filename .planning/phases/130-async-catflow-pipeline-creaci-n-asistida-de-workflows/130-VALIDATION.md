---
phase: 130
slug: async-catflow-pipeline-creaci-n-asistida-de-workflows
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 130 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | app/vitest.config.ts |
| **Quick run command** | `cd ~/docflow/app && npx vitest run src/lib/__tests__/intent-jobs.test.ts src/lib/__tests__/intent-job-executor.test.ts src/lib/__tests__/telegram-callback.test.ts -x` |
| **Full suite command** | `cd ~/docflow/app && npx vitest run` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite + CatBot-as-oracle E2E
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 130-01-01 | 01 | 0 | PIPE-01 | unit | `npx vitest run src/lib/__tests__/intent-jobs.test.ts` | ❌ W0 | ⬜ |
| 130-01-02 | 01 | 1 | PIPE-01 | unit | `npx vitest run src/lib/__tests__/intent-jobs.test.ts` | ❌ W0 | ⬜ |
| 130-01-03 | 01 | 1 | PIPE-01, PIPE-08 | unit | `npx vitest run src/lib/__tests__/intent-jobs.test.ts knowledge-tools-sync.test.ts` | ❌ W0 | ⬜ |
| 130-02-01 | 02 | 0 | PIPE-02, PIPE-03 | unit | `npx vitest run src/lib/__tests__/intent-job-executor.test.ts` | ❌ W0 | ⬜ |
| 130-02-02 | 02 | 2 | PIPE-03 | unit | `npx vitest run src/lib/__tests__/intent-job-executor.test.ts` | ❌ W0 | ⬜ |
| 130-02-03 | 02 | 2 | PIPE-02 | unit | `npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts` | ✅ (extend) | ⬜ |
| 130-03-01 | 03 | 0 | PIPE-04 | unit | `npx vitest run src/lib/__tests__/canvas-flow-designer.test.ts` | ❌ W0 | ⬜ |
| 130-03-02 | 03 | 3 | PIPE-04 | unit | `npx vitest run src/lib/__tests__/canvas-flow-designer.test.ts` | ❌ W0 | ⬜ |
| 130-04-01 | 04 | 0 | PIPE-05 | unit | `npx vitest run src/lib/__tests__/telegram-callback.test.ts` | ❌ W0 | ⬜ |
| 130-04-02 | 04 | 4 | PIPE-05, PIPE-06 | unit | `npx vitest run src/lib/__tests__/telegram-callback.test.ts intent-jobs.test.ts` | ❌ W0 | ⬜ |
| 130-04-03 | 04 | 4 | PIPE-06 | manual | Dashboard notification + Telegram inline keyboard manual test | N/A | ⬜ |
| 130-05-01 | 05 | 5 | PIPE-07 | unit | `npx vitest run src/lib/__tests__/intent-jobs.test.ts alert-service.test.ts` | ❌ W0 / ✅ extend | ⬜ |
| 130-05-02 | 05 | 5 | PIPE-01..08 | manual | CatBot-as-oracle E2E via Telegram | N/A | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/intent-jobs.test.ts` — stubs for PIPE-01 (CRUD + 6 tools)
- [ ] `src/lib/__tests__/intent-job-executor.test.ts` — stubs for PIPE-02, PIPE-03 (pipeline 3-phase state machine)
- [ ] `src/lib/__tests__/canvas-flow-designer.test.ts` — stubs for PIPE-04 (scan resources + flow_data shape)
- [ ] `src/lib/__tests__/telegram-callback.test.ts` — stubs for PIPE-05 (callback_query parsing + approve/reject)
- [ ] Extend `catbot-prompt-assembler.test.ts` — stubs for buildComplexTaskProtocol P1 section
- [ ] Extend `alert-service.test.ts` — stub for checkStuckPipelines

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Telegram inline keyboard approval | PIPE-05 | Requires Telegram runtime | Send complex request, verify approval buttons appear, click, verify callback |
| CatBot detects complexity and asks confirmation | PIPE-02 | LLM runtime behavior | Ask CatBot for a complex task, verify it offers pipeline before executing |
| 3-phase pipeline completes design | PIPE-03 | LLM runtime behavior | Approve pipeline, verify strategist/decomposer/architect outputs in progress_message |
| Canvas execution after approval | PIPE-06 | Canvas runtime | Approve, verify canvas_run created and completed |
| Post-execution decision flow | PIPE-07 | Conversation flow | After canvas completes, verify CatBot asks template/recipe/delete |
| CatPaw creation on-the-fly | PIPE-04 | Conversation flow | Architect requests missing CatPaw, verify user prompt + creation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
