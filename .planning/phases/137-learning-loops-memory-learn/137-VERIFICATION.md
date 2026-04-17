---
phase: 137-learning-loops-memory-learn
verified: 2026-04-17T09:30:00Z
status: human_needed
score: 9/9 must-haves verified (automated); signal gate (SC1) requires human
re_verification: false
human_verification:
  - test: "End-to-end Holded Q1 via Telegram reproducible 3 veces consecutivas"
    expected: "El usuario envía el prompt canónico, el sistema clasifica como complex, ejecuta el pipeline async, propone canvas con formato LEARN-07, el usuario aprueba, y ambos destinatarios reciben el email con template corporativo y cifras reales de Q1 2025/2026. Repetido 3 veces sin intervención manual."
    why_human: "Requiere Telegram real, Gmail OAuth2 activo, Holded MCP respondiendo, y observación de los inboxes antonio@educa360.com y fen@educa360.com. El signal gate 137-06 fue declarado GATE:FAIL el 2026-04-17 por un problema arquitectónico de convergencia QA en canvases de 7+ nodos (data_contract_score se estanca en 60-70 tras 4 iteraciones). Este es el único blocker sin solución automatizada."
---

# Phase 137: Learning Loops & Memory (LEARN) — Verification Report

**Phase Goal:** El sistema aprende de cada interacción. CatBot tiene skill de creación de CatPaw protocolarizado, memoria de patrones por usuario inyectada en el system prompt, goal del strategist propagado como `initialInput` del START, condiciones multilingues, Telegram propuestas informativas, `complexity_decisions.outcome` cerrado en cada terminal, y evaluación documentada de fusión strategist+decomposer. La señal única del milestone (Holded Q1 end-to-end vía Telegram reproducible 3x) se verifica aquí.

**Verified:** 2026-04-17T09:30:00Z
**Status:** human_needed
**Re-verification:** No — verificación inicial

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Existe skill 'Protocolo de creación de CatPaw' categoria=system en la DB | VERIFIED | `db.ts` L4418 seed `skill-system-catpaw-protocol-v1` con `INSERT OR IGNORE`; test catbot-user-patterns pasa (3/3 casos LEARN-01) |
| 2 | CatBot sigue el protocolo cuando se detecta needs_cat_paws o petición de creación | VERIFIED | `catbot-prompt-assembler.ts` L782 inyecta el skill incondicionalmente; test `catbot-prompt-assembler.test.ts` "build() always inject the protocol in the system prompt" verde |
| 3 | Existe tabla user_interaction_patterns en catbot.db + tools para leer/escribir | VERIFIED | `catbot-db.ts` L176 `CREATE TABLE IF NOT EXISTS user_interaction_patterns`; 4 tools en catbot-tools.ts: `list_user_patterns`, `write_user_pattern`, `get_user_patterns_summary`, `get_complexity_outcome_stats` |
| 4 | CatBot lee los patterns del usuario actual e inyecta en el system prompt | VERIFIED | `catbot-prompt-assembler.ts` L767 `getUserPatterns(userId, 10)` + L772 sección "Preferencias observadas del usuario"; test "build() with userId that has patterns injects..." verde |
| 5 | El START node del canvas recibe goal del strategist como initialInput | VERIFIED | `intent-job-executor.ts` L768 comentario + L786 `initialInput: String(goal)`; tests LEARN-05 (Tests 1-3) verdes en intent-job-executor |
| 6 | El condition node acepta variantes multilingues case-insensitive | VERIFIED | `canvas-executor.ts` L38-67 `YES_VALUES`/`NO_VALUES`/`normalizeConditionAnswer`; 14 tests canvas-executor-condition todos verdes incluyendo 'sí', 'afirmativo', 'negativo', 'incorrecto' |
| 7 | sendProposal en Telegram incluye título del canvas, lista de nodos, tiempo estimado y botones | VERIFIED | `intent-job-executor.ts` L1340-1503 `ROLE_EMOJI`, `buildProposalBody`, `sendProposal` rediseñado; tests intent-job-executor-proposal verdes |
| 8 | complexity_decisions.outcome se actualiza en cada terminal path (completed/cancelled/timeout) | VERIFIED | `intent-job-executor.ts` L862 (cancelled), L986 (completed), L268 (timeout via reaper); `catbot-db.ts` L224 migración `complexity_decision_id`; tests LEARN-08 Tests 4-9 verdes |
| 9 | Evaluación documentada con decisión DEFER/IMPLEMENT/REJECT para fusión strategist+decomposer | VERIFIED | `.planning/phases/137-learning-loops-memory-learn/LEARN-09-EXPERIMENT.md` L136 `DECISION: DEFER` con justificación; `app/scripts/pipeline-cases/baselines/holded-q1-fusion-eval.json` existe |
| SC1 | Señal única del milestone: Holded Q1 end-to-end vía Telegram reproducible 3 veces | GATE:FAIL | Signal gate 137-06 declarado FAIL el 2026-04-17. Tres intentos de RUN 1: 1a=truncated_json (fix 137-07), 1b=qa_rejected 2 iters (fix 137-08), 1c=qa_rejected 4 iters — data_contract_score estancado en 60 para canvas 7+ nodos. Problema arquitectónico, no de requirements. |

**Score LEARN requirements:** 9/9 truths verified (LEARN-01 a LEARN-09 completamente implementados y con tests verdes)

**Score milestone signal:** 0/1 end-to-end reproducibility (requiere resolución en v27.1)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/src/lib/services/catpaw-email-template-executor.ts` | render_template con validación estricta y logging completo | VERIFIED | `extractRequiredVariableKeys` L21, `detectUnresolvedPlaceholders` L75, logging rico en connector_logs |
| `app/src/lib/services/catpaw-gmail-executor.ts` | send_email con validación body obligatoria + messageId mandatorio | VERIFIED | L122 "INC-12 closure"; L137 valida body/html_body; L149 assert messageId |
| `app/src/lib/services/catpaw-drive-executor.ts` | logging completo de request/response payloads | VERIFIED | Existe, logging rico confirmado en SUMMARY 137-01 y tests |
| `.planning/knowledge/connector-logs-redaction-policy.md` | Documentación de policy de logging | VERIFIED | Existe; confirmed by `test -f` y catpaw-gmail-executor.test.ts Test 10 |
| `app/src/lib/services/intent-job-executor.ts` | goal propagation al START node + outcome loop + sendProposal rico | VERIFIED | LEARN-05 L768, LEARN-08 L1309-1331, LEARN-07 L1340-1503 |
| `app/src/lib/services/canvas-executor.ts` | condition parser multilingüe | VERIFIED | L27-66 YES_VALUES/NO_VALUES/normalizeConditionAnswer; LEARN-06 sanctioned exception |
| `app/src/lib/catbot-db.ts` | user_interaction_patterns table + migración complexity_decision_id | VERIFIED | L176 CREATE TABLE IF NOT EXISTS; L224 addColumnIfMissing |
| `app/src/lib/services/catbot-prompt-assembler.ts` | injection de user_patterns y skill system | VERIFIED | L761 LEARN-04 section; L782 LEARN-02 section |
| `app/src/lib/services/catbot-tools.ts` | tools list_user_patterns, write_user_pattern, get_user_patterns_summary, get_complexity_outcome_stats | VERIFIED | L1036, L1049, L1069, L1077; executeTool cases L3370, L3390, L3414, L3433 |
| `app/data/knowledge/catboard.json` | tools y conceptos LEARN documentados | VERIFIED | L19 list_user_patterns, L22 get_complexity_outcome_stats, L37 complexity_decisions.outcome, L50/85 howtos |
| `app/data/knowledge/catpaw.json` | skill protocol + INC-12 closure documentados | VERIFIED | L32 Protocolo de creacion de CatPaw; L40 howto; L56 common_error |
| `app/data/knowledge/canvas.json` | INC-11/INC-12 como common_errors | VERIFIED | L70 INC-11, L75 INC-12 con causa y solución |
| `.planning/phases/137-learning-loops-memory-learn/LEARN-09-EXPERIMENT.md` | experimento documentado con decisión | VERIFIED | L136 DECISION: DEFER con justificación de 3 secciones |
| `app/scripts/pipeline-cases/baselines/holded-q1-fusion-eval.json` | snapshot del experimento | VERIFIED | Existe |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `catpaw-email-template-executor.ts render_template` | template variables | `extractRequiredVariableKeys` + `detectUnresolvedPlaceholders` | WIRED | Ambas funciones exportadas y llamadas en el case render_template |
| `catpaw-gmail-executor.ts send_email` | sendEmail() response | `assert result.messageId` | WIRED | L149-154 check mandatory; returns error JSON si ausente |
| `intent-job-executor.ts runArchitectQALoop` | start node data.initialInput | muta flow_data.nodes[start].data.initialInput = goal | WIRED | L768-796, guarda antes del INSERT al canvas |
| `canvas-executor.ts case 'condition'` | YES_VALUES/NO_VALUES | `normalizeConditionAnswer(result.output)` | WIRED | L1443 reemplaza el antiguo startsWith('yes') |
| `markTerminal / exhaustion / reaper` | complexity_decisions.outcome | `closeComplexityOutcome` → `updateComplexityOutcome` | WIRED | L986 (completed), L862 (cancelled), L268 (timeout) — 3 rutas cableadas |
| `catbot-prompt-assembler assembleSystemPrompt` | user_interaction_patterns | `getUserPatterns(userId, 10)` | WIRED | L767 importado y llamado, section añadida al prompt |
| `catbot-prompt-assembler assembleSystemPrompt` | skills WHERE category='system' | `getSystemSkillInstructions('Protocolo de creacion de CatPaw')` | WIRED | L787 lookup y L789 sección P1 inyectada |
| `catbot-tools.ts write_user_pattern` | user_interaction_patterns INSERT | permission-gated manage_user_patterns | WIRED | L1345 gate; L3390 executeTool case |
| `catbot-tools.ts get_complexity_outcome_stats` | complexity_decisions GROUP BY outcome | always_allowed readonly | WIRED | L1344 always_allowed; L3433 executeTool case |
| `sendProposal` | canvases.flow_data nodes | SELECT canvas + parse flow_data + buildProposalBody | WIRED | L1469 SELECT; L1479 buildProposalBody; L1503 sendMessageWithInlineKeyboard |
| `LEARN-09-EXPERIMENT.md decision` | catbot-pipeline-prompts.ts | DEFER — no cambios de código | WIRED | Decisión documentada explícitamente; no cambios de código requeridos para DEFER |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LEARN-01 | 137-03 | Skill 'Protocolo de creación de CatPaw' categoria=system | SATISFIED | `db.ts` seed; `catbot-user-patterns.test.ts` 3 tests verdes |
| LEARN-02 | 137-03 | CatBot sigue protocolo ante needs_cat_paws o petición | SATISFIED | `catbot-prompt-assembler.ts` L782; test "build() always inject" verde |
| LEARN-03 | 137-03 | tabla user_interaction_patterns + tools lectura/escritura | SATISFIED | `catbot-db.ts` L176; tools en catbot-tools.ts; tests catbot-prompt-assembler y catbot-user-patterns verdes |
| LEARN-04 | 137-03 | Patterns inyectados en system prompt automáticamente | SATISFIED | `catbot-prompt-assembler.ts` L761-772; test "injects Preferencias observadas" verde |
| LEARN-05 | 137-02 | goal del strategist → initialInput del START node | SATISFIED | `intent-job-executor.ts` L768-796; tests LEARN-05 Tests 1-3 verdes |
| LEARN-06 | 137-02 | condition acepta variantes multilingues case-insensitive | SATISFIED | `canvas-executor.ts` L38-66; 14 tests canvas-executor-condition verdes |
| LEARN-07 | 137-04 | sendProposal: título + nodos + tiempo + botones | SATISFIED | `intent-job-executor.ts` L1340-1503; tests intent-job-executor-proposal verdes |
| LEARN-08 | 137-02 + 137-03 | complexity_decisions.outcome cerrado en terminales + oracle tool | SATISFIED | `catbot-db.ts` L224 migración; 3 terminal paths cableados; `get_complexity_outcome_stats` always_allowed; tests LEARN-08 Tests 4-9 verdes |
| LEARN-09 | 137-05 | Evaluación documentada fusión strategist+decomposer | SATISFIED | LEARN-09-EXPERIMENT.md DECISION:DEFER con justificación completa; holded-q1-fusion-eval.json persistido |

**Orphaned requirements:** Ninguno. Los 9 LEARN requirements tienen plan asignado y evidencia de implementación.

**Nota sobre plans sin requirements declarados:** Plan 137-01 declara `requirements: [INC-11, INC-12, INC-13]` — estos no son requirements formales de LEARN sino incident closures que son precondición de la señal del milestone. Correctamente tratados como precondiciones de infraestructura, no como LEARN requirements.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| Ninguno detectado | — | — | — |

Scan ejecutado sobre los archivos clave de los 8 planes. No se encontraron TODOs bloqueantes, return null como stubs, handlers vacíos, ni placeholders en implementaciones. Los `return null` en `catbot-prompt-assembler.ts` (L189, L203, L209) son guard clauses legítimas de búsqueda de knowledge pages.

---

### Human Verification Required

#### 1. Señal única del milestone — Holded Q1 end-to-end 3× vía Telegram

**Test:** Enviar exactamente el prompt canónico por Telegram al bot DocFlow:
```
Comparativa facturación Q1 2026 vs Q1 2025 de Holded, maquétala con el template corporativo y envíala a antonio@educa360.com y fen@educa360.com
```

**Expected:**
1. Bot clasifica como `complex` y arranca pipeline async
2. Pipeline produce propuesta formato LEARN-07: título del canvas + lista de nodos con emojis por rol + tiempo estimado + botones ✅ Aprobar / ❌ Cancelar
3. Usuario pulsa ✅ Aprobar
4. Pipeline completa sin intervención
5. Ambos inboxes reciben email con template corporativo, tabla de cifras reales Q1 2025 y Q1 2026, sin placeholders `{{...}}` ni texto "Contenido principal del email"
6. Repetible 3 veces consecutivas

**Por qué humano:** Requiere Telegram real, Gmail OAuth2 activo con cuenta Educa360, Holded MCP respondiendo, acceso a inboxes antonio@educa360.com y fen@educa360.com. El signal gate 137-06 fue declarado GATE:FAIL el 2026-04-17 porque `data_contract_score` se estanca en 60 tras 4 iteraciones en canvases de 7+ nodos. El architect mejora instruction_quality (75→90) pero no converge en data contracts. Este es un problema arquitectónico del loop architect-QA que requiere trabajo de v27.1.

**Estado actual:** Intento 1c (post-137-08) falló con QA loop exhausted after 4 iterations; data_contract_score=60 en iters 1-3.

---

### Gaps Summary

No hay gaps en la implementación de los 9 LEARN requirements. Todos los artifacts existen, son sustanciales (no stubs), están correctamente cableados, y tienen tests verdes.

El único item pendiente es la **señal única del milestone (SC1)** — la reproducibilidad end-to-end 3× vía Telegram — que no depende de implementación faltante sino de un problema de convergencia architect-QA para canvases complejos (7+ nodos). Este problema fue identificado, documentado, y clasificado como blocker de v27.1, no como gap de implementation de LEARN requirements.

**Valor shippado en esta fase:**
- 9/9 LEARN requirements completamente implementados con tests
- 3 bug fixes de runtime (INC-11/12/13) que son precondición del milestone
- 2 gap closures ad-hoc (137-07 architect self-healing, 137-08 QA budget dinámico)
- 310+ tests nuevos en la suite
- Knowledge tree actualizado en 4 JSONs (canvas, catflow, catboard, catpaw) per CLAUDE.md protocol

---

_Verificado: 2026-04-17T09:30:00Z_
_Verificador: Claude (gsd-verifier)_
