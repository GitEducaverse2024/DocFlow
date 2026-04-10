---
phase: 132-canvas-qa-loop-architect-con-auto-review-rules-index-y-side-effect-guards
verified: 2026-04-10T01:00:00Z
status: human_needed
score: 8/8 must-haves verified (automated); 1 truth requires live runtime
re_verification: false
human_verification:
  - test: "QA2-04 progress_message — listar jobs activos por CatBot y verificar que progress_message contiene qa_iteration y qa_recommendation"
    expected: "CatBot responde con list_my_jobs mostrando pipeline_phase='architect' y progress_message con qa_iteration y qa_recommendation"
    why_human: "Requiere pipeline async activo con Docker + LiteLLM + Telegram corriendo en produccion. Auto-aprobado en yolo mode segun instruccion del orchestrator."
  - test: "E2E Holded Q1 email — Telegram trigger + canvas ejecucion + email recibido con contenido real + template + 2 destinatarios"
    expected: "Email llega a ambos destinatarios con cifras comparativas Q1 2026 vs Q1 2025, template HTML aplicado, sin placeholders"
    why_human: "Requiere Docker en produccion, credenciales Holded API, cuenta Gmail, y destinatarios reales. Auto-aprobado en yolo mode segun instruccion del orchestrator."
---

# Phase 132: Canvas QA Loop Architect Verification Report

**Phase Goal:** El Pipeline Architect produce canvases de calidad profesional con rules index escalable, QA reviewer loop de 2 iteraciones, y side-effect guards con auto-reparacion via CatBot antes de reportar gap

**Verified:** 2026-04-10T01:00:00Z

**Status:** human_needed (automated checks: PASS; 2 items necesitan runtime real, auto-aprobados por yolo mode segun instruccion del orchestrator)

**Re-verification:** No — verificacion inicial

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Pipeline Architect carga rules index sin inflar el prompt con 4KB de detalle | VERIFIED | `loadRulesIndex()` expone el index como string; `ARCHITECT_PROMPT` contiene `{{RULES_INDEX}}` placeholder sustituido en runtime via `String.replace` en `runArchitectQALoop` (intent-job-executor.ts:278) |
| 2 | `getCanvasRule(ruleId)` devuelve RuleDetail para R01-R25, SE01-SE03, DA01-DA04 y null para IDs desconocidos | VERIFIED | 12/12 tests de canvas-rules.test.ts verdes; case-insensitive lookup implementado |
| 3 | Architect con `needs_rule_details` desencadena expansion pass con segunda llamada LLM antes de QA | VERIFIED | intent-job-executor.ts:305-325 implementa el loop de expansion; test "needs_rule_details triggers expansion pass then QA" pasa (8/8 en intent-job-executor.test.ts) |
| 4 | QA reviewer detecto canvas con contratos defectuosos y pide segunda iteracion con feedback | VERIFIED | `CANVAS_QA_PROMPT` exportado con schema JSON (quality_score, issues, data_contract_analysis, recommendation); 16/16 tests en catbot-pipeline-prompts.test.ts verdes |
| 5 | Si tras 2 iteraciones el canvas sigue siendo inaceptable, el pipeline falla con knowledge_gap | VERIFIED | `runArchitectQALoop` llama `logKnowledgeGap(knowledgePath='catflow/design/quality')` y marca job como failed; test "revise twice -> fail + logKnowledgeGap" pasa |
| 6 | Guards se insertan automaticamente antes de nodos destructivos, NO dentro de iteradores | VERIFIED | `insertSideEffectGuards` exportado e integrado en `finalizeDesign` (intent-job-executor.ts:468); 36/36 tests en canvas-flow-designer.test.ts verdes incluyendo scenario iterator body exclusion |
| 7 | Auto-repair usa `repair_attempts` counter y salta si >= 1 en entrada | VERIFIED | canvas-auto-repair.ts:77-106 implementa check inicial; 7/7 tests en canvas-auto-repair.test.ts verdes |
| 8 | Si auto-repair falla por segunda vez: logKnowledgeGap + createNotification con channel_ref propagado | VERIFIED | canvas-auto-repair.ts:90-106 llama `logKnowledgeGap(knowledgePath='catflow/design/data-contract')` y `notifyUserIrreparable` que lee `intent_jobs.channel_ref`; tests exhaustion 4/4 |

**Score automatizado:** 8/8 truths verified por unit/integration tests

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/data/knowledge/canvas-rules-index.md` | Index con >=25 reglas agrupadas, cada linea <=100 chars | VERIFIED | 32 reglas contadas (grep `^- (R|SE|DA)` = 32); secciones `## Data Contracts`, `## Side Effects Guards`, `## Anti-patterns` presentes |
| `app/src/lib/services/canvas-rules.ts` | Exporta `loadRulesIndex`, `getCanvasRule`, `_resetCache`, interface `RuleDetail` | VERIFIED | Todas las exportaciones presentes y sustantivas (~90 lineas con cache module-level, path resolution dual, regex parsing) |
| `app/src/lib/__tests__/canvas-rules.test.ts` | 12 tests cubriendo QA2-01 y QA2-02 | VERIFIED | 12/12 tests passing |
| `app/data/knowledge/catflow.json` | 7 nuevos concepts SE01-SE03 + DA01-DA04 | VERIFIED | Entradas presentes (verificado via grep "SE01", "DA01" en catflow.json) |
| `app/src/lib/services/catbot-pipeline-prompts.ts` | `ARCHITECT_PROMPT` reescrito + `CANVAS_QA_PROMPT` + `AGENT_AUTOFIX_PROMPT` exportados | VERIFIED | Todas las constantes exportadas; ARCHITECT contiene `{{RULES_INDEX}}` y `needs_rule_details`; CANVAS_QA contiene schema JSON con los 4 campos; AGENT_AUTOFIX contiene `fixed`/`repair_failed` |
| `app/src/lib/services/intent-job-executor.ts` | `runArchitectQALoop` privado + `MAX_QA_ITERATIONS = 2` + integracion en `runFullPipeline` | VERIFIED | Metodo implementado en linea 271+; constante en linea 85; `design = await this.runArchitectQALoop(...)` en linea 214; expansion pass en lineas 305-325 |
| `app/src/lib/__tests__/catbot-pipeline-prompts.test.ts` | Tests de ARCHITECT, CANVAS_QA, AGENT_AUTOFIX prompts | VERIFIED | 16/16 tests passing |
| `app/src/lib/__tests__/intent-job-executor.test.ts` | Tests de runArchitectQALoop: 8 scenarios | VERIFIED | 23/23 tests passing (incluye los 8 escenarios del QA loop) |
| `app/src/lib/services/canvas-flow-designer.ts` | `isSideEffectNode` + `insertSideEffectGuards` + `computeIteratorBodyNodes` + `buildGuardCondition` | VERIFIED | Todos exportados o internamente presentes; `insertSideEffectGuards` exportada y usada en `finalizeDesign` |
| `app/src/lib/services/canvas-auto-repair.ts` | `attemptNodeRepair` con logica de repair_attempts + notifyUserIrreparable | VERIFIED | Exportado; logica de counter en lineas 77-106; notifyUserIrreparable lee `channel_ref` de `intent_jobs` |
| `app/src/lib/services/catbot-tools.ts` | `_internal_attempt_node_repair` registrado en TOOLS[] con gating por prefijo | VERIFIED | Tool en linea 910; filter `startsWith('_internal_')` en linea 1228; case handler en linea 3203 con dynamic import de `canvas-auto-repair` |
| `app/src/lib/__tests__/canvas-flow-designer.test.ts` | Tests isSideEffectNode (16 casos) + insertSideEffectGuards (6 scenarios) | VERIFIED | 36/36 tests passing |
| `app/src/lib/__tests__/canvas-auto-repair.test.ts` | Tests attemptNodeRepair + exhaustion | VERIFIED | 7/7 tests passing |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `canvas-rules.ts` | `canvas-rules-index.md` | `fs.readFileSync` con path dual (cwd/data/knowledge/ + cwd/app/data/knowledge/) | WIRED | canvas-rules.ts:47-48 prueba dos paths; tests pasan en contexto vitest |
| `canvas-rules.ts` | `canvas-nodes-catalog.md` | `parseRulesFromCatalog` regex | WIRED | canvas-rules.ts:60-62 prueba 3 paths; R01-R25 lookups pasan en tests |
| `intent-job-executor.ts` | `canvas-rules.ts` | `import { loadRulesIndex, getCanvasRule }` | WIRED | Linea 43 del executor; `loadRulesIndex()` llamado en linea 277; `getCanvasRule` llamado en linea 311 |
| `runArchitectQALoop` expansion pass | `getCanvasRule` | `for each ruleId in design.needs_rule_details` | WIRED | intent-job-executor.ts:305-325; test "needs_rule_details triggers expansion pass" pasa |
| `intent-job-executor.ts` | `CANVAS_QA_PROMPT` | `import { ARCHITECT_PROMPT, CANVAS_QA_PROMPT }` | WIRED | Linea 35 del executor; ambos prompts sustituidos con `rulesIndex` en lineas 278-279 |
| `runArchitectQALoop` exhaustion | `catbot-db.logKnowledgeGap` | dynamic import('@/lib/catbot-db') + `logKnowledgeGap` call | WIRED | intent-job-executor.ts:394 llama `logKnowledgeGap(knowledgePath='catflow/design/quality')` |
| `ARCHITECT_PROMPT` en call-time | `canvas-rules-index.md` via `loadRulesIndex` | `String.replace('{{RULES_INDEX}}', rulesIndex)` | WIRED | intent-job-executor.ts:278: `ARCHITECT_PROMPT.replace('{{RULES_INDEX}}', rulesIndex)` |
| `canvas-flow-designer.finalizeDesign` | `insertSideEffectGuards` | post-validateFlowData call | WIRED | intent-job-executor.ts:468: `design.flow_data = insertSideEffectGuards(design.flow_data as FlowData)` |
| `canvas-auto-repair.attemptNodeRepair` | `canvas_runs.metadata.repair_attempts` | `JSON.parse + db.prepare` | WIRED | canvas-auto-repair.ts:77-106 |
| `canvas-auto-repair.notifyUserIrreparable` | `intent_jobs.channel_ref` | `catbotDb SELECT channel, channel_ref WHERE canvas_id = ?` | WIRED | canvas-auto-repair.ts:254 |
| `catbot-tools._internal_attempt_node_repair handler` | `canvas-auto-repair.attemptNodeRepair` | dynamic import + delegation | WIRED | catbot-tools.ts:3203-3215 |
| `insertSideEffectGuards reporter node` | `_internal_attempt_node_repair tool` | `data.tools` array del reporter agent | WIRED | canvas-flow-designer.ts inserta reporter con `data.tools = ['_internal_attempt_node_repair', 'log_knowledge_gap']`; test "reporter has correct shape" verifica |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| QA2-01 | 132-01 | canvas-rules-index.md con >=25 reglas referenciables por id, cada una <=100 chars | SATISFIED | 32 reglas; unit test verifica longitud; REQUIREMENTS.md marcado [x] |
| QA2-02 | 132-01, 132-02 | getCanvasRule(rule_id) devuelve detalle completo; architect puede pedir expansion pass via needs_rule_details | SATISFIED | 12/12 tests canvas-rules; 1 test dedicated "needs_rule_details triggers expansion" en intent-job-executor; REQUIREMENTS.md [x] |
| QA2-03 | 132-02 | ARCHITECT_PROMPT reescrito con referencias al index; escalable a futuras reglas | SATISFIED | ARCHITECT_PROMPT contiene {{RULES_INDEX}}, needs_rule_details, INPUT:/OUTPUT:, DA01-DA04, QA review; 7/7 tests |
| QA2-04 | 132-02 | CANVAS_QA_PROMPT devuelve JSON con quality_score, issues[], data_contract_analysis, recommendation | SATISFIED (automated) / PENDING ORACLE | Unit tests confirman shape del prompt; runtime progress_message necesita verificacion humana con live pipeline |
| QA2-05 | 132-02 | QA loop max 2 iter; reject tras 2 intentos -> fail + knowledge_gap | SATISFIED | 8/8 tests runArchitectQALoop cubriendo todos los paths de accept/revise/reject/exhaustion |
| QA2-06 | 132-03 | insertSideEffectGuards detecta nodos destructivos e inserta condition + reporter | SATISFIED | 36/36 tests incluyendo 6 scenarios de insercion y exclusion de iterator body |
| QA2-07 | 132-03 | Runtime: guard false -> reporter llama CatBot para ajustar instructions; reintenta 1 vez | SATISFIED | 7/7 tests; flow: _internal_attempt_node_repair tool -> attemptNodeRepair -> fix_target_node_id instructions updated + repair_attempts=1 |
| QA2-08 | 132-03 | Si auto-repair falla (2o intento): canvas failed + log_knowledge_gap + notificacion usuario por canal original | SATISFIED | 4/4 tests de exhaustion; logKnowledgeGap + createNotification con channel_ref propagado |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `intent-job-executor.ts` | 468 | `insertSideEffectGuards` llamado sin `ctxResolver` | INFO (known limitation documentada) | Connector nodes sin `mode`/`action`/`drive_operation`/`tool_name` explicito (e.g. Gmail por connectorType lookup) no recibiran guard. Documentado en UAT seccion 6 como deuda tecnica para siguiente fix plan si el oracle lo expone. |
| `canvas-auto-repair.ts` | 267 | `channel_ref` embebido en notification.message como `[ref:<value>]` | INFO (known limitation documentada) | `createNotification` no acepta `channel_ref` como primer clase; el bot Telegram necesitaria un parser para auto-rutear. Documentado en UAT seccion 6. |

No blockers. Las dos limitaciones conocidas estan documentadas en 132-UAT.md seccion 6 y son candidatas para follow-up, no bloquean la funcionalidad core.

---

## Human Verification Required

### 1. QA2-04 progress_message via CatBot oracle

**Test:** Disparar tarea compleja por Telegram, luego preguntar a CatBot "lista mis jobs activos y dime en que fase esta y que recomendacion dio el QA review"

**Expected:** CatBot llama `list_my_jobs`, muestra job con `pipeline_phase='architect'` y `progress_message` conteniendo `qa_iteration` y `qa_recommendation`

**Why human:** Requiere Docker en produccion con LiteLLM activo, bot Telegram corriendo, y pipeline async en ejecucion. No automatizable sin runtime real.

**Nota:** Auto-aprobado en yolo mode por instruccion del orchestrator.

### 2. E2E — Holded Q1 email oracle

**Test:** Mandar a Telegram: "Hazme una comparativa de facturacion Q1 2026 vs Q1 2025 de Holded y enviamela por email a los destinatarios configurados en mi settings". Responder "si, adelante". Verificar email recibido.

**Expected:** Email con cifras comparativas reales de Q1 2026 y Q1 2025, template HTML aplicado, a ambos destinatarios configurados. Sin placeholders.

**Why human:** Requiere credenciales Holded API, cuenta Gmail, destinatarios reales, Docker con toda la stack activa. No automatizable en CI.

**Nota:** Auto-aprobado en yolo mode por instruccion del orchestrator.

---

## Gaps Summary

No gaps encontrados. Todos los artifacts existen, son sustantivos (no stubs), y estan correctamente enlazados. Los 94 tests de las 5 suites de la fase pasan. Los 8 requirements QA2-01..08 estan marcados [x] en REQUIREMENTS.md y tienen evidencia de implementacion verificable en el codigo.

Las dos items de verificacion humana (QA2-04 progress_message en runtime y E2E email) se marcan como `human_needed` pero han sido auto-aprobados por el orchestrator en yolo mode dado que requieren live Docker + LiteLLM + Telegram + Holded API.

---

_Verified: 2026-04-10T01:00:00Z_

_Verifier: Claude (gsd-verifier)_
