---
phase: 131
slug: complexity-assessment-catbot-razona-antes-de-ejecutar
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 131 — Validation Strategy

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | app/vitest.config.ts |
| **Quick run command** | `cd ~/docflow/app && npx vitest run src/lib/__tests__/complexity-decisions.test.ts src/lib/__tests__/complexity-parser.test.ts src/lib/__tests__/catbot-prompt-assembler.test.ts src/lib/__tests__/intent-job-executor.test.ts src/lib/__tests__/alert-service.test.ts -x` |
| **Full suite command** | `cd ~/docflow/app && npx vitest run` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite + CatBot-as-oracle E2E reproducing the real Holded Q1 case
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 131-01-01 | 01 | 0 | QA-01, QA-02 | unit | `npx vitest run src/lib/__tests__/complexity-decisions.test.ts catbot-prompt-assembler.test.ts` | ❌ W0 | ⬜ |
| 131-01-02 | 01 | 1 | QA-01 | unit | `npx vitest run src/lib/__tests__/complexity-decisions.test.ts` | ❌ W0 | ⬜ |
| 131-01-03 | 01 | 1 | QA-02 | unit | `npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts` | ✅ (extend) | ⬜ |
| 131-02-01 | 02 | 0 | QA-03, QA-04 | unit | `npx vitest run src/lib/__tests__/complexity-parser.test.ts` | ❌ W0 | ⬜ |
| 131-02-02 | 02 | 2 | QA-03, QA-04 | unit | `npx vitest run src/lib/__tests__/complexity-parser.test.ts` | ❌ W0 | ⬜ |
| 131-02-03 | 02 | 2 | QA-05 | unit | `npx vitest run src/lib/__tests__/intent-jobs.test.ts` | ✅ (extend) | ⬜ |
| 131-03-01 | 03 | 0 | QA-06 | unit | `npx vitest run src/lib/__tests__/intent-job-executor.test.ts` | ✅ (extend) | ⬜ |
| 131-03-02 | 03 | 3 | QA-06 | unit | `npx vitest run src/lib/__tests__/intent-job-executor.test.ts` | ✅ (extend) | ⬜ |
| 131-04-01 | 04 | 4 | QA-07 | unit | `npx vitest run src/lib/__tests__/alert-service.test.ts` | ✅ (extend) | ⬜ |
| 131-04-02 | 04 | 4 | QA-01..07 | manual | CatBot-as-oracle: reproducir caso Holded Q1 | N/A | ⬜ |

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/complexity-decisions.test.ts` — stubs for QA-01 (CRUD)
- [ ] `src/lib/__tests__/complexity-parser.test.ts` — stubs for QA-03, QA-04 (parser + gate)
- [ ] Extend `catbot-prompt-assembler.test.ts` — stubs for QA-02 (buildComplexityProtocol P0 section, char budget <1200)
- [ ] Extend `intent-jobs.test.ts` — stub for QA-05 (queue_intent_job description field)
- [ ] Extend `intent-job-executor.test.ts` — stubs for QA-06 (self-check >3 tool calls + 60s progress throttling)
- [ ] Extend `alert-service.test.ts` — stub for QA-07 (checkClassificationTimeouts)

---

## Manual-Only Verifications

| Behavior | Requirement | Test Instructions |
|----------|-------------|-------------------|
| CatBot razona y clasifica como complex | QA-02, QA-03 | Reproducir caso real: "entra en Holded y haz resumen Q1 2026+Q1 2025+compara+envía email" via Telegram, verificar que CatBot pregunta antes de ejecutar |
| Gate bloquea tool loop cuando complex | QA-04 | Verificar que CatBot NO ejecuta tools cuando clasifica complex, responde con pregunta |
| Progress reports cada 60s | QA-06 | Aprobar pipeline, verificar que cada 60s llega mensaje "⏳ En fase X..." al canal original |
| Self-check escala a async | QA-06 | Forzar petición que CatBot clasifica mal como simple, verificar que tras 3 tool calls escala |
| complexity_decisions audit | QA-01 | Consultar catbot.db, verificar rows con classification/reason/outcome |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] No 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
