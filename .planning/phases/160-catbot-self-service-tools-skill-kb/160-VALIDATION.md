---
phase: 160
slug: catbot-self-service-tools-skill-kb
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
---

# Phase 160 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `160-RESEARCH.md` §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 (already installed in `app/package.json`) |
| **Config file** | `app/vitest.config.ts` (existing) |
| **Quick run command** | `cd app && npm run test:unit -- src/lib/__tests__/catbot-tools-model-self-service.test.ts src/app/api/catbot/chat/__tests__/route.test.ts` |
| **Full suite command** | `cd app && npm run test:unit` |
| **Estimated runtime** | ~5s quick / ~30s full |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm run test:unit -- src/lib/__tests__/catbot-tools-model-self-service.test.ts` (Wave 0 file, ~3s)
- **After every plan wave:** Run `cd app && npm run test:unit -- src/lib/__tests__ src/lib/services/__tests__ src/app/api/catbot` (~15s)
- **Before `/gsd:verify-work`:** Full suite green + `cd app && npm run lint && npm run build` + Docker rebuild + 4 CatBot Oracle manual verifications
- **Max feedback latency:** ~15s (wave merge); ~3s (per commit)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 160-W0-01 | Wave 0 | 0 | TOOL-01..03 | unit (stubs) | `cd app && npm run test:unit -- src/lib/__tests__/catbot-tools-model-self-service.test.ts` | ❌ W0 | ⬜ pending |
| 160-W0-02 | Wave 0 | 0 | TOOL-04 (seed) | unit (stub) | `cd app && npm run test:unit -- src/lib/__tests__/db-seeds.test.ts -t "Operador de Modelos skill"` | ❌ W0 | ⬜ pending |
| 160-W0-03 | Wave 0 | 0 | TOOL-04 (injection) | unit (stub) | `cd app && npm run test:unit -- src/lib/services/__tests__/catbot-prompt-assembler.test.ts -t "modelos_protocol injected"` | ⚠️ EXTEND | ⬜ pending |
| 160-W0-04 | Wave 0 | 0 | TOOL-03 (sudo) | unit (stub) | `cd app && npm run test:unit -- src/app/api/catbot/chat/__tests__/route.test.ts -t "set_catbot_llm without sudo"` | ✅ EXTEND | ⬜ pending |
| 160-01 | list_llm_models | 1 | TOOL-01 | unit | `cd app && npm run test:unit -- -t "TOOL-01: list_llm_models"` | ✅ (W0) | ⬜ pending |
| 160-02 | get_catbot_llm | 1 | TOOL-02 | unit | `cd app && npm run test:unit -- -t "TOOL-02: get_catbot_llm"` | ✅ (W0) | ⬜ pending |
| 160-03 | set_catbot_llm handler | 2 | TOOL-03 | unit | `cd app && npm run test:unit -- -t "delegates to PATCH" -t "surfaces 400 errors"` | ✅ (W0) | ⬜ pending |
| 160-04 | sudo gate wiring | 2 | TOOL-03 | unit | `cd app && npm run test:unit -- src/app/api/catbot/chat/__tests__/route.test.ts -t "set_catbot_llm without sudo"` | ✅ (W0) | ⬜ pending |
| 160-05 | getToolsForLLM visibility | 2 | TOOL-03 | unit | `cd app && npm run test:unit -- -t "getToolsForLLM visibility"` | ✅ (W0) | ⬜ pending |
| 160-06 | Skill seed + KB projection | 3 | TOOL-04 | unit | `cd app && npm run test:unit -- -t "Operador de Modelos skill"` | ✅ (W0) | ⬜ pending |
| 160-07 | PromptAssembler injection | 3 | TOOL-04 | unit | `cd app && npm run test:unit -- -t "modelos_protocol injected"` | ✅ (W0) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/lib/__tests__/catbot-tools-model-self-service.test.ts` — NEW file (~300 lines). Covers TOOL-01 (list_llm_models filters), TOOL-02 (get_catbot_llm shape), TOOL-03 (set_catbot_llm PATCH delegation + 400 surfacing) + visibility gate. Mocks: `@/lib/db`, `alias-routing`, `discovery`, `mid` (follow `catbot-tools-user-patterns.test.ts` template).
- [ ] `app/src/lib/__tests__/db-seeds.test.ts` — NEW file OR extend existing seed test. Asserts `skill-system-modelos-operador-v1` row exists after bootstrap with `category='system'` and instructions match known substring ("tarea ligera", "Opus", "Gemini 2.5 Pro", "reasoning_effort").
- [ ] `app/src/lib/services/__tests__/catbot-prompt-assembler.test.ts` — EXTEND existing (or create if absent). Asserts `build(ctx)` includes `## Protocolo obligatorio: Operador de Modelos` header at P1 when skill is seeded. Mock `getSystemSkillInstructions('Operador de Modelos')` to return canned stub.
- [ ] `app/src/app/api/catbot/chat/__tests__/route.test.ts` — EXTEND existing. Add 2 test cases: `set_catbot_llm` without sudo emits `SUDO_REQUIRED` in both streaming and non-streaming paths.
- [ ] Framework install: **none needed** — vitest 4.1.0 already in `app/package.json`.

---

## Manual-Only Verifications (CatBot Oracle per CLAUDE.md)

Every manual verification MUST paste CatBot response as evidence before marking phase verified.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CatBot enumerates models with capabilities via `list_llm_models` | TOOL-01 | Oracle end-to-end: verifies tool registration + model_intelligence JOIN + UI rendering in chat | 1) `docker compose up -d --build`; 2) In CatBot chat (web): **"qué modelos tengo disponibles y cuáles piensan?"**; 3) Expect: CatBot calls `list_llm_models({reasoning: true})` and enumerates Opus/Sonnet/Gemini 2.5 Pro with `supports_reasoning=true`. **Paste response.** |
| CatBot reports current catbot alias config via `get_catbot_llm` | TOOL-02 | Oracle: validates resolveAliasConfig integration + capability lookup | In CatBot chat: **"qué modelo estás usando tú ahora mismo?"**; Expect: calls `get_catbot_llm`, returns `alias=catbot` + current model + capabilities. **Paste response.** |
| CatBot updates its own LLM via `set_catbot_llm` under sudo | TOOL-03 | Oracle: validates sudo gate + PATCH delegation + validation error surfacing | In CatBot chat (sudo'd): **"cámbiate a Opus con reasoning alto"**; Expect: calls `set_catbot_llm({model:'claude-opus-...', reasoning_effort:'high'})`; returns success. Without sudo: returns `SUDO_REQUIRED` hint. **Paste both responses.** |
| Skill "Operador de Modelos" visible in `search_kb` + applied | TOOL-04 | Oracle: validates DB seed + KB projection + PromptAssembler P1 injection | In CatBot chat: **"busca la skill del operador de modelos"**; Expect: calls `search_kb({type:'resource', subtype:'skill', search:'Operador de Modelos'})`; returns KB entry `skill-system-modelos-operador-v1`. Then: **"necesito razonar sobre un problema complejo, qué modelo me sugieres?"**; Expect: recommends Opus + reasoning_effort=high per protocol. **Paste both responses.** |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (4 test files: new/extend)
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s (wave merge)
- [ ] `nyquist_compliant: true` set in frontmatter
- [ ] All 4 CatBot Oracle prompts executed + responses pasted as evidence

**Approval:** pending
