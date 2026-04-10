---
phase: 132
slug: canvas-qa-loop-architect-con-auto-review-rules-index-y-side-effect-guards
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 132 — Validation Strategy

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | app/vitest.config.ts |
| **Quick run command** | `cd ~/docflow/app && npx vitest run src/lib/__tests__/canvas-rules.test.ts src/lib/__tests__/canvas-flow-designer.test.ts src/lib/__tests__/canvas-auto-repair.test.ts src/lib/__tests__/intent-job-executor.test.ts src/lib/__tests__/catbot-pipeline-prompts.test.ts -x` |
| **Full suite command** | `cd ~/docflow/app && npx vitest run` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite + CatBot-as-oracle E2E reproducing Holded Q1 case
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 132-01-01 | 01 | 0 | QA2-01, QA2-02 | unit | `npx vitest run canvas-rules.test.ts` | ❌ W0 | ⬜ |
| 132-01-02 | 01 | 1 | QA2-01 | unit | `npx vitest run canvas-rules.test.ts` | ❌ W0 | ⬜ |
| 132-01-03 | 01 | 1 | QA2-02 | unit | `npx vitest run canvas-rules.test.ts` | ❌ W0 | ⬜ |
| 132-02-01 | 02 | 0 | QA2-03, QA2-04, QA2-05 | unit | `npx vitest run catbot-pipeline-prompts.test.ts intent-job-executor.test.ts` | ❌ W0 / ✅ extend | ⬜ |
| 132-02-02 | 02 | 2 | QA2-03, QA2-04 | unit | `npx vitest run catbot-pipeline-prompts.test.ts` | ❌ W0 | ⬜ |
| 132-02-03 | 02 | 2 | QA2-05 | unit | `npx vitest run intent-job-executor.test.ts` | ✅ extend | ⬜ |
| 132-03-01 | 03 | 0 | QA2-06, QA2-07 | unit | `npx vitest run canvas-flow-designer.test.ts canvas-auto-repair.test.ts` | ✅ extend / ❌ W0 | ⬜ |
| 132-03-02 | 03 | 3 | QA2-06 | unit | `npx vitest run canvas-flow-designer.test.ts` | ✅ extend | ⬜ |
| 132-03-03 | 03 | 3 | QA2-07, QA2-08 | unit | `npx vitest run canvas-auto-repair.test.ts` | ❌ W0 | ⬜ |
| 132-04-01 | 04 | 4 | QA2-01..08 | manual | CatBot-as-oracle: Holded Q1 E2E (email llega con contenido + template + 2 destinatarios) | N/A | ⬜ |

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/canvas-rules.test.ts` — stubs for QA2-01 (index load) and QA2-02 (get_canvas_rule)
- [ ] `src/lib/__tests__/canvas-auto-repair.test.ts` — stubs for QA2-07 (repair attempt) and QA2-08 (repair failure → gap)
- [ ] Extend `catbot-pipeline-prompts.test.ts` — stubs for QA2-03 (ARCHITECT_PROMPT contains rules index), QA2-04 (CANVAS_QA_PROMPT schema)
- [ ] Extend `canvas-flow-designer.test.ts` — stubs for QA2-06 (insertSideEffectGuards scenarios)
- [ ] Extend `intent-job-executor.test.ts` — stubs for QA2-05 (runArchitectQALoop 2 iterations)

---

## Manual-Only Verifications

| Behavior | Requirement | Test Instructions |
|----------|-------------|-------------------|
| Canvas generated has data contracts in instructions | QA2-03 | Trigger pipeline with Holded Q1 request, inspect canvas.flow_data nodes, verify each instructions mentions "INPUT:" and "OUTPUT:" |
| QA loop converges in 2 iterations | QA2-05 | Trigger pipeline, check intent_jobs.progress_message for qa_iteration counter |
| Guards inserted before side-effect nodes | QA2-06 | Inspect canvas.flow_data after generation, verify condition+reporter nodes before n5 Gmail |
| Auto-repair triggers on runtime guard.false | QA2-07 | Force n3 to emit empty summary, verify CatBot is called with AGENT_AUTOFIX_PROMPT |
| Failed auto-repair reports to user | QA2-08 | Force second auto-repair to fail, verify Telegram message + knowledge_gap row created |
| E2E: Holded Q1 email has real content | QA2-01..08 | Send "comparativa facturación Q1 2026 y Q1 2025 + envía email" via Telegram, verify email arrives with template + comparative data + both recipients |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] No 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 25s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
