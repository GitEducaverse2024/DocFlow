---
phase: 135-architect-prompt-layer-arch-prompt
verified: 2026-04-11T14:01:28Z
updated: 2026-04-11T16:25:00Z
status: passed
score: 14/14 requirements verified + 5/5 success criteria confirmed (runtime pipeline holded-q1 → awaiting_approval)
re_verification:
  is_re_verification: true
  trigger: "Runtime verification of SC #2 + #3 surfaced a wiring bug in buildActiveSets (wrong DB handle). Fix applied in commit b66cc61, regression test added, pipeline re-run to awaiting_approval with recommendation=accept."
gaps:
  - id: buildactivesets-wrong-db-handle
    status: resolved
    source: runtime pipeline execution holded-q1
    description: "buildActiveSets queried `catbotDb` for `cat_paws`/`connectors`, but those tables live in docflow.db (accessed via `@/lib/db`). The real query threw SQLITE_ERROR: no such table, the catch returned empty Sets, and the deterministic validator rejected every real UUID that scanCanvasResources had fed to the architect. Hidden from unit tests because the entire ARCH-PROMPT-13 suite replaced buildActiveSets with a spy."
    fix_commit: b66cc61
    resolution: "Changed `catbotDb` → `db` in both queries of buildActiveSets. Added regression test `buildActiveSets DB handle (gap closure)` that invokes the REAL function (no spy) against the mocked `@/lib/db` — fails if the handle is reverted. 148/148 tests green across the three affected files."
    audit_learning: "Functions that touch the DB must have at least one integration-style test against a real handle. Spy-only coverage passes unit tests while production stays broken — exactly the 'tests green, prod broken' pattern flagged by the milestone audit."
---

# Phase 135: Architect Prompt Layer Verification Report

**Phase Goal:** `ARCHITECT_PROMPT` y `CANVAS_QA_PROMPT` reescritos para explotar los datos enriquecidos de Phase 134. El architect sigue un checklist heartbeat de 6 pasos con 7 secciones, declara `data.role` en cada nodo, y cuando necesita un CatPaw inexistente lo incluye en `needs_cat_paws[]`. El reviewer QA es role-aware: R10 solo aplica a `transformer/synthesizer`, un validador determinístico en código rechaza canvases inválidos sin llamar al LLM. Toda la suite de tests unitarios queda verde incluyendo 4 tests nuevos.

**Verified:** 2026-04-11T14:01:28Z
**Status:** human_needed (toda verificación automatizada pasa; 2 de 5 success criteria requieren prueba runtime contra LiteLLM)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | Todos los tests unitarios verdes incluyendo los 4 nuevos (a/b/c/d ARCH-PROMPT-13) | VERIFIED | `npx vitest run canvas-flow-designer + catbot-pipeline-prompts + intent-job-executor` → 147/147 passed. Tests a/b/c/d presentes en `intent-job-executor.test.ts` líneas 1361-1524 |
| 2   | El output del architect (architect_iter0 persistido) incluye `data.role` en cada nodo del flow_data | NEEDS HUMAN | El prompt v135 obliga `data.role` (Sección 2 + output schema); test assert cubre el prompt, no la obediencia del LLM — requiere llamada runtime |
| 3   | El reviewer LLM lee `data.role` y aplica R10 SOLO a `transformer/synthesizer`; emitter/terminal nunca recibe R10 falso positivo | NEEDS HUMAN | Prompt CANVAS_QA_PROMPT v135 scopea R10 a transformer/synthesizer (línea 190 de catbot-pipeline-prompts.ts); test (a) mockea la respuesta del reviewer, no la ejecuta contra el LLM |
| 4   | Cuando el architect necesita un CatPaw inexistente, produce `needs_cat_paws[{name, mode:'processor', system_prompt, skills_sugeridas, conectores_necesarios}]` | VERIFIED | ARCHITECT_PROMPT Sección 5 (caso 2 BUENO opción B) + output schema líneas 159-165 de catbot-pipeline-prompts.ts con los 5 campos exactos; needs_cat_paws short-circuit en intent-job-executor.ts líneas 555-561 ya estaba presente y sin tocar |
| 5   | Antes de cada invocación del reviewer LLM, validador determinístico verifica agentIds, connectorIds, DAG, start único, VALID_NODE_TYPES; si falla retorna `{recommendation:'reject'}` sin gastar tokens | VERIFIED | `validateCanvasDeterministic` en canvas-flow-designer.ts líneas 107-210 (pure function, 5 checks + DFS cycle). Wired en intent-job-executor.ts líneas 568-642 ANTES del QA callLLM. Test (d) comprueba `callLLMSpy` count === 2 (solo architect, 0 QA) con un canvas que tiene ghost-slug |

**Score:** 3/5 programáticamente VERIFIED, 2/5 NEEDS HUMAN (runtime).

### Required Artifacts (from PLAN must_haves)

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `app/src/lib/services/canvas-flow-designer.ts` | ROLE_TAXONOMY constant + validateCanvasDeterministic pure function | VERIFIED | Líneas 52-210. ROLE_TAXONOMY con los 7 roles; validateCanvasDeterministic con las 5 checks. Pure function: cero `catbotDb`/DB imports dentro del validador |
| `app/src/lib/__tests__/canvas-flow-designer.test.ts` | ≥6 tests nuevos del validador | VERIFIED | 60/60 tests passed (10 nuevos según SUMMARY) |
| `app/src/lib/services/catbot-pipeline-prompts.ts` | ARCHITECT_PROMPT 7 secciones + needs_cat_paws schema + CANVAS_QA_PROMPT role-aware | VERIFIED | `grep "^## [1-7]\."` → 7 marcadores presentes. CANVAS_QA_PROMPT v135 línea 176+; {{RULES_INDEX}} preservado en ambos prompts |
| `app/src/lib/__tests__/catbot-pipeline-prompts.test.ts` | Tests estructurales para los 7 secciones + role-aware QA | VERIFIED | 36/36 tests passed |
| `app/src/lib/services/intent-job-executor.ts` | validateCanvasDeterministic wired en runArchitectQALoop antes del QA callLLM | VERIFIED | Import línea 42; buildActiveSets línea 892; gate líneas 568-642; synthetic QaReport cuando ok:false |
| `app/src/lib/__tests__/intent-job-executor.test.ts` | 4 tests nuevos ARCH-PROMPT-13 | VERIFIED | 51/51 tests passed; tests (a)(b)(c)(d) presentes líneas 1372-1524 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| canvas-flow-designer.ts | VALID_NODE_TYPES | Direct reuse dentro del validator | WIRED | Línea 140: `VALID_NODE_TYPES.includes(n.type as CanvasNodeType)` |
| catbot-pipeline-prompts.ts ARCHITECT_PROMPT | canvas-flow-designer.ts ROLE_TAXONOMY | Los 7 nombres de rol listados en Sección 2 | WIRED | Sección 2 contiene los 7 literales; test correspondiente assertra todos |
| catbot-pipeline-prompts.ts ARCHITECT_PROMPT | {{RULES_INDEX}} | Placeholder substituido en intent-job-executor.ts al render-time | WIRED | Línea 127 literal `{{RULES_INDEX}}` |
| intent-job-executor.ts runArchitectQALoop | canvas-flow-designer.ts validateCanvasDeterministic | Import + call después del architect parse, antes del QA callLLM | WIRED | Línea 42 import; líneas 573-576 call site; correctly after needs_cat_paws short-circuit, before QA callLLM |
| intent-job-executor.ts buildActiveSets | `@/lib/db` (docflow.db) | Prepared statements `SELECT id FROM cat_paws/connectors WHERE is_active = 1` | WIRED (fixed post-verification in b66cc61; was initially `catbotDb` which lacks those tables) | Líneas 899 y 904 |
| CANVAS_QA_PROMPT | ROLE_TAXONOMY | El prompt enumera los 7 roles y scopea R10 a transformer/synthesizer | WIRED | Línea 182 taxonomía inline; línea 190 scope R10 explícito |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| ARCH-PROMPT-01 | 135-02 | Sección 1 "Lo que tienes disponible" con campos del input | SATISFIED | Líneas 28-38 de catbot-pipeline-prompts.ts enumeran goal/tasks/resources.{catPaws,connectors,skills,canvas_similar,templates} |
| ARCH-PROMPT-02 | 135-02 | Sección 2 con taxonomía de 7 roles funcionales | SATISFIED | Líneas 41-51 con los 7 roles; test assertra ROLE_TAXONOMY entries |
| ARCH-PROMPT-03 | 135-02 | Sección 3 checklist heartbeat 6 pasos | SATISFIED | Líneas 53-60 con los 6 pasos (clasifica rol → emitter/contract → iterator → agent/CatPaw → cadena datos → needs_cat_paws) |
| ARCH-PROMPT-04 | 135-02 | Sección 4 plantillas copiables INPUT/PROCESO/OUTPUT | SATISFIED | Líneas 62-82 con plantillas para transformer, renderer, emitter |
| ARCH-PROMPT-05 | 135-02 | Sección 5 con ≥2 few-shot MALO→BUENO incluyendo emitter-as-agent | SATISFIED | Líneas 83-108: Caso 1 emitter-as-agent, Caso 2 analista-financiero-ia slug inventado |
| ARCH-PROMPT-06 | 135-02 | Sección 6 con patrón iterator copiable | SATISFIED | Líneas 110-124 con fragmento JSON iterator+body + edges |
| ARCH-PROMPT-07 | 135-02 | Sección 7 declara `{{RULES_INDEX}}` como marcador | SATISFIED | Líneas 126-127, placeholder literal preservado |
| ARCH-PROMPT-08 | 135-02 | Output del architect incluye `data.role` en cada nodo siguiendo taxonomía 7 roles | SATISFIED (prompt) / NEEDS HUMAN (runtime) | Output schema líneas 129-156 requiere data.role con enum 7 valores; runtime obedience needs LLM call |
| ARCH-PROMPT-09 | 135-02 | needs_cat_paws con {name, mode, system_prompt, skills_sugeridas, conectores_necesarios} | SATISFIED | Líneas 159-165 de output schema con los 5 campos exactos |
| ARCH-PROMPT-10 | 135-01 | Validador determinístico pre-LLM (agentIds, connectorIds, DAG, start, tipos) | SATISFIED | validateCanvasDeterministic canvas-flow-designer.ts líneas 107-210; 60/60 tests verdes; wired en intent-job-executor.ts líneas 568-642 |
| ARCH-PROMPT-11 | 135-03 | CANVAS_QA_PROMPT lee data.role antes de reglas; R10 solo a transformer/synthesizer; terminal no R10 | SATISFIED (prompt) / NEEDS HUMAN (runtime) | Principio rector línea 176; Algoritmo paso 1 lectura del rol línea 187; R10 scope explícito línea 190 |
| ARCH-PROMPT-12 | 135-03 | Schema reviewer con data_contract_score, instruction_quality_score, issues[{severity,scope,rule_id,node_id,node_role,description,fix_hint}], recommendation | SATISFIED | Output schema líneas 217-238; QaReport type extendido en intent-job-executor.ts con instruction_quality_score, scope, node_role (optional) |
| ARCH-PROMPT-13 | 135-03 | 4 tests nuevos (emitter no R10, transformer drops → R10 blocker, exhaustion notifyProgress top-2, validator rechaza unknown agentId sin LLM call) | SATISFIED | Tests (a)(b)(c)(d) líneas 1372-1524 de intent-job-executor.test.ts; 51/51 passed |
| ARCH-PROMPT-14 | 135-03 | Mocks intent-job-executor actualizados al nuevo schema, suite verde | SATISFIED | 147/147 tests across three files; 6 fixtures actualizadas según SUMMARY (start node + valid agentId) |

**14/14 requirements SATISFIED programáticamente.** ARCH-PROMPT-08 y ARCH-PROMPT-11 tienen una capa adicional de validación runtime pendiente (la obediencia del LLM real, no el prompt) marcada en human_verification — esto es parte del Phase 136 gate end-to-end según el plan.

**No ORPHANED requirements.** REQUIREMENTS.md coincide 1:1 con el conjunto declarado en los 3 PLAN frontmatters (01: ARCH-PROMPT-10; 02: 01..09; 03: 11..14).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| catbot-pipeline-prompts.ts | 69 | TODO | Info | Es la palabra "TODOS los campos" en la REGLA del transformer (no es TODO-comment). Benigno — falso positivo. |

**Sin blockers, sin warnings.** Validaciones adicionales ejecutadas:
- Sin `process.env.X` directo en intent-job-executor.ts (cumple CLAUDE.md rule bracket notation).
- Sin imports no usados detectados en los archivos tocados.
- `canvas-executor.ts` NO modificado (verificado: no aparece en files_modified de ningún plan).
- Pure function validator: no importa `catbotDb` dentro de canvas-flow-designer.ts para validateCanvasDeterministic (buildActiveSets vive en intent-job-executor.ts según decision en SUMMARY 03).
- `decideQaOutcome` body unchanged (Phase 134 Plan 04 contract preserved).
- `{{RULES_INDEX}}` placeholder preservado en ambos prompts (líneas 127 y 179).

### Test Execution Evidence

```
$ cd app && npx vitest run src/lib/__tests__/canvas-flow-designer.test.ts \
    src/lib/__tests__/catbot-pipeline-prompts.test.ts \
    src/lib/__tests__/intent-job-executor.test.ts

 Test Files  3 passed (3)
      Tests  147 passed (147)
   Duration  295ms
```

Desglose:
- canvas-flow-designer.test.ts: 60 passed (50 pre-existentes + 10 nuevos ROLE_TAXONOMY + validateCanvasDeterministic)
- catbot-pipeline-prompts.test.ts: 36 passed (18 pre-existentes Phase 132/134 + 12 ARCHITECT v135 + 6 CANVAS_QA v135)
- intent-job-executor.test.ts: 51 passed (47 pre-existentes + 4 ARCH-PROMPT-13 a/b/c/d)

### Runtime Verification (2026-04-11T16:20Z) — PASSED

Tras el fix `buildActiveSets` (commit b66cc61), ejecutado pipeline real contra LiteLLM:

```bash
CATBOT_DB_PATH=/home/deskmath/docflow-data/catbot.db \
  node app/scripts/test-pipeline.mjs --case holded-q1
```

**Resultado:**

```
⏱  duration: 120.1s
   final_status: pending
   pipeline_phase: awaiting_approval

===== FINAL flow_data (roles per node) =====
  n1 [start]     role=extractor
  n2 [agent]     role=extractor
  n3 [agent]     role=extractor
  n4 [agent]     role=synthesizer
  n5 [agent]     role=renderer
  n_guard [cond] role=guard
  n6 [connector] role=emitter

===== FINAL qa_report summary =====
  quality_score: 95
  data_contract_score: 100
  instruction_quality_score: 90
  recommendation: accept
  issues: 0
  data_contract_analysis: all edges ok
```

**SC #2 (ARCH-PROMPT-08) — CONFIRMED:** Los 7 nodos declaran `data.role` con valores de `ROLE_TAXONOMY`. El LLM obedece el prompt v135.

**SC #3 (ARCH-PROMPT-11) — CONFIRMED:** `n6` es `type:'connector'` con `role:'emitter'` terminal. El reviewer LLM emitió **0 issues**, ninguna R10 contra `n6`. El scoping role-aware funciona en runtime.

**Bug colateral encontrado y resuelto durante runtime:** `buildActiveSets` apuntaba a `catbotDb` (que no contiene `cat_paws`/`connectors`). El validator rechazaba TODO UUID real como "unknown or inactive". Fix en `b66cc61`:

- [intent-job-executor.ts:898-904](app/src/lib/services/intent-job-executor.ts#L898-L904): `catbotDb` → `db`
- [intent-job-executor.test.ts](app/src/lib/__tests__/intent-job-executor.test.ts) — nuevo `describe('buildActiveSets DB handle (gap closure)')` que invoca el real `buildActiveSets` sin spy y verifica el handle.

El pipeline post-fix recorre architect → validator (acepta) → QA LLM → accept → awaiting_approval en 120s.

---

### Human Verification (historical, now resolved)

Dos items de los cinco success criteria del ROADMAP requirieron verificación runtime. Ambos confirmados en el bloque anterior. Se preservan aquí para trazabilidad:

#### 1. data.role declarado en output real del architect (ARCH-PROMPT-08, SC #2)

**Test:** Ejecutar un pipeline real (p.ej. `execute_catflow` contra el caso holded-q1 o similar) y consultar la fila `intent_jobs` correspondiente:

```sql
SELECT architect_iter0 FROM intent_jobs WHERE id = '<job_id>';
```

**Expected:** Parseando el JSON, cada elemento de `flow_data.nodes[]` tiene `data.role` con un valor de `ROLE_TAXONOMY` (extractor|transformer|synthesizer|renderer|emitter|guard|reporter).

**Why human:** Los tests unitarios validan que el PROMPT pide el campo; no validan que el LLM OBEDEZCA. Esa verificación es materia del gate end-to-end (Phase 136) o de una prueba manual ahora contra el modelo real.

**Protocolo CatBot (CLAUDE.md):** Formular al CatBot un prompt tipo "ejecuta un catflow de prueba que genere un canvas de 3 nodos y muéstrame el architect_iter0 persistido". CatBot debería poder consultar la tabla intent_jobs vía su tool de admin.

#### 2. Reviewer LLM aplica R10 scope correcto en runtime (ARCH-PROMPT-11, SC #3)

**Test:** Construir manualmente un canvas con un nodo `type:'connector'` `role:'emitter'` cuyas `instructions` NO mencionen "preserva campos", pasarlo por `runArchitectQALoop` (o simular la llamada al reviewer LLM vía LiteLLM con el CANVAS_QA_PROMPT v135), e inspeccionar las issues devueltas.

**Expected:** `issues[]` NO contiene ningún objeto con `rule_id === 'R10'` referenciando el nodo emitter. Si contiene otras issues (p.ej. R13 data-chain), está ok — solo R10 debe estar ausente para emitter/terminal.

**Why human:** Test (a) de ARCH-PROMPT-13 mockea la respuesta del reviewer; no ejercita al modelo real. La obediencia del LLM al scope role-aware es precisamente lo que el gate Phase 136 debe validar.

### Gaps Summary

**No hay gaps bloqueantes.** La fase cumple completamente los 14 requirements a nivel de código + tests unitarios:

- Validador determinístico: implementado, puro, wired ANTES del QA LLM, test (d) confirma 0 QA calls en canvas con slug fabricado.
- Prompts v135: rewritten estructuralmente con los 7 marcadores de sección, 7 roles, heartbeat 6 pasos, few-shot con el anti-pattern real holded-q1 (analista-financiero-ia), iterator pattern, placeholder RULES_INDEX preservado, needs_cat_paws con los 5 campos exactos, CANVAS_QA_PROMPT role-aware con R10 scopeado.
- Tests: 147/147 verdes. Los 4 tests ARCH-PROMPT-13 (a/b/c/d) cubren exactamente los 4 casos que el ROADMAP exige.
- Artefactos y key links: todos VERIFIED. Zero regresiones en los 97 tests pre-existentes.

Los 2 items human_verification (SC #2 y SC #3) no son gaps: son verificaciones runtime explícitamente declaradas como Phase 136 end-to-end gate scope (según el bloque de constraints del plan 135-03). Phase 135 termina en "prompt + código + tests unitarios verdes"; Phase 136 ejercita el LLM real. La separación de fases está clara en el SUMMARY 03.

**Recomendación:** aceptar Phase 135 como passed-con-human-pending. El próximo paso del usuario es la sesión de verificación CatBot protocolaria (CLAUDE.md):

```
CatBot, ejecuta un catflow simple con "enviar un email con el resumen del último holded invoice" y pégame:
1. El flow_data generado (architect_iter0)
2. Las issues del reviewer (qa_iter0)
3. Si algún nodo emitter/connector recibió issue R10
```

Los criterios #1, #4 y #5 quedan **programáticamente cerrados**. Los criterios #2 y #3 son contractuales del prompt (cerrados) pero runtime (pendientes de sesión manual o Phase 136 gate).

---

_Verified: 2026-04-11T14:01:28Z_
_Verifier: Claude (gsd-verifier)_
