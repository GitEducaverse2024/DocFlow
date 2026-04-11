# Roadmap: DocFlow — Milestone v27.0 CatBot Intelligence Engine v2 (Memento Man fix)

## Overview

Milestone v27.0 arregla la raíz del "Memento Man problem" del Pipeline Architect: el architect LLM no recuerda contexto entre llamadas, así que la solución NO es pedirle que recuerde — es inyectarle el contexto correcto (tools por CatPaw, contratos declarativos de conectores, canvases similares, templates) en cada ejecución. El milestone se estructura en 5 fases lineales: (133) fundación y tooling que hacen el pipeline depurable y no se quede colgado, (134) capa de datos enriquecida del architect, (135) capa de prompts del architect + QA con roles funcionales, (136) validación end-to-end contra LiteLLM real como gate obligatorio con matriz de enrutamiento de fallos, y (137) loops de aprendizaje + memoria + propagación de goal. La señal única de éxito es el caso canónico **Holded Q1** ejecutándose end-to-end vía Telegram sin intervención humana, reproducible 3 veces consecutivas.

## Phases

**Phase Numbering:** continúa desde phase 132 (última de v26.0). Integer phases 133-137 son el plan de milestone v27.0.

- [x] **Phase 133: Foundation & Tooling (FOUND)** — Pipeline async depurable: timeouts, reaper, persistencia de outputs intermedios, notificaciones de exhaustion, y `test-pipeline.mjs` como gate tooling. (completed 2026-04-11)
- [x] **Phase 134: Architect Data Layer (ARCH-DATA)** — `scanCanvasResources` enriquecido con tools por CatPaw, contratos declarativos de connectors, canvases similares, templates, rules index scope-by-role, threshold de calidad determinista en código. (completed 2026-04-11)
- [ ] **Phase 135: Architect Prompt Layer (ARCH-PROMPT)** — `ARCHITECT_PROMPT` reescrito como checklist heartbeat de 7 secciones, `CANVAS_QA_PROMPT` con validador determinístico y reviewer role-aware, `data.role` obligatorio por nodo, tests unitarios verdes.
- [ ] **Phase 136: End-to-End Validation (VALIDATION) — GATE** — Fase de verificación pura (no código): ejecución de los 3 casos canónicos (holded-q1, inbox-digest, drive-sync) contra LiteLLM real con matriz de enrutamiento de fallos a la fase correcta.
- [ ] **Phase 137: Learning Loops & Memory (LEARN)** — CatPaw creation protocol skill, user memory, goal→initialInput, condition multilingüe, Telegram proposal informativa, outcome loop de complexity_decisions, evaluación strategist+decomposer fusion.

## Phase Details

### Phase 133: Foundation & Tooling (FOUND)
**Goal**: El pipeline async es depurable end-to-end. Nunca se queda colgado (timeouts + reaper), siempre notifica al usuario cuando algo va mal (exhaustion), persiste todos los outputs intermedios para post-mortem, y existe `test-pipeline.mjs` capaz de ejercitar el pipeline completo contra LiteLLM real en < 60s por caso.
**Depends on**: Nothing (primera fase del milestone, base de todo lo demás)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, FOUND-07, FOUND-08, FOUND-09, FOUND-10

**Internal sequence constraint (MANDATORY):** `test-pipeline.mjs` (FOUND-08/09) es el **ÚLTIMO** task de la fase. El script solo tiene valor cuando FOUND-04, 05, 06, 07 y 10 ya están operativos — si se implementa antes, ejecuta el pipeline en estado incompleto y los resultados no sirven para validar 134/135.

Orden interno forzado:
1. FOUND-01 / FOUND-02 — baseline: entrypoint copia `*.md` y `VALID_NODE_TYPES` validado por test unitario
2. FOUND-03 — `canvas-nodes-catalog.md` en `app/data/knowledge/` + `getCanvasRule('R10')` funciona dentro del contenedor
3. FOUND-04 — timeouts de 90s en todas las llamadas `callLLM` de `intent-job-executor.ts` con `AbortSignal.timeout`, liberación de `currentJobId`
4. FOUND-07 — `flow_data` del último intento del architect persistido en `knowledge_gap.context` en exhaustion
5. FOUND-10 — exhaustion llama `notifyProgress(job, msg, force=true)` con top-2 issues antes de `markTerminal`
6. FOUND-05 — job reaper: cron cada 5 min que marca failed jobs en status `strategist|decomposer|architect` con `updated_at > 10min`, notifica por canal original
7. FOUND-06 — tabla `intent_jobs` con columnas TEXT: `strategist_output, decomposer_output, architect_iter0, qa_iter0, architect_iter1, qa_iter1` (ALTER TABLE IF NOT EXISTS en `db.ts`)
8. FOUND-08 / FOUND-09 — **LAST**: `app/scripts/test-pipeline.mjs` + fixtures `pipeline-cases/{holded-q1,inbox-digest,drive-sync}.json`

**Success Criteria** (what must be TRUE):
  1. `node app/scripts/test-pipeline.mjs --case holded-q1` imprime `flow_data + qa_report + outputs intermedios` a stdout en **< 60 segundos** (criterio de done exacto de la fase)
  2. Ningún job del pipeline puede quedar colgado: todas las llamadas LLM tienen timeout de 90s, y un reaper marca como `failed` cualquier job con `updated_at > 10min` notificando al usuario por su canal original
  3. Cuando el QA loop agota iteraciones, el usuario recibe notificación inmediata con los top-2 issues del último `qa_report` y el `flow_data` final queda persistido en `knowledge_gap.context` para post-mortem
  4. Al arrancar el contenedor, `getCanvasRule('R10')` encuentra correctamente la regla en `canvas-nodes-catalog.md` dentro del volumen de knowledge
  5. La tabla `intent_jobs` contiene los 6 outputs intermedios del pipeline (strategist_output, decomposer_output, architect_iter0/1, qa_iter0/1) permitiendo inspeccionar cada etapa sin re-ejecutar
**Plans**: 5 plans
- [ ] 133-01-baseline-knowledge-PLAN.md — Entrypoint *.md + canvas-nodes-catalog.md en data-seed + VALID_NODE_TYPES test (FOUND-01/02/03)
- [ ] 133-02-resilience-llm-PLAN.md — callLLM AbortSignal.timeout(90s) + exhaustion persiste flow_data + notifyProgress top-2 issues (FOUND-04/07/10)
- [ ] 133-03-job-reaper-PLAN.md — Cron 5min marca failed jobs stale > 10min notificando por canal original (FOUND-05)
- [ ] 133-04-intermediate-outputs-persistence-PLAN.md — Tabla intent_jobs con 6 columnas TEXT para outputs intermedios (FOUND-06)
- [ ] 133-05-test-pipeline-script-PLAN.md — app/scripts/test-pipeline.mjs + 3 fixtures pipeline-cases/*.json (FOUND-08/09) [LAST]

---

### Phase 134: Architect Data Layer (ARCH-DATA)
**Goal**: El Pipeline Architect recibe en cada invocación un payload de contexto estructurado y enriquecido — tools por CatPaw, contratos declarativos de conectores, canvases similares top-3, templates disponibles — de forma que NO tiene que adivinar qué existe ni inventar agentIds. El threshold de calidad del QA loop vive en código (determinista), no parseado del string del prompt.
**Depends on**: Phase 133 (necesita FOUND-06 persistencia para auditar el payload del architect vía `test-pipeline.mjs`)
**Requirements**: ARCH-DATA-01, ARCH-DATA-02, ARCH-DATA-03, ARCH-DATA-04, ARCH-DATA-05, ARCH-DATA-06, ARCH-DATA-07
**Success Criteria** (what must be TRUE):
  1. Ejecutando `test-pipeline.mjs --case holded-q1`, el `architect_iter0` persistido (via FOUND-06) muestra un input payload con: `resources.catPaws[]` conteniendo `{paw_id, paw_name, paw_mode, tools_available[], skills[], best_for}`, `resources.connectors[]` conteniendo `{connector_id, connector_type, contracts: {accion: {required_fields, optional_fields, description}}}`, `resources.canvas_similar[]` con top-3 canvases, y `resources.templates[]`
  2. Para Gmail, los contratos declarativos en código incluyen al menos `send_report`, `send_reply`, `mark_read` con los `required_fields` reales que `canvas-executor.ts` consume del nodo predecesor
  3. `runArchitectQALoop` toma la decisión accept/revise/exhaust usando la condición booleana en código `data_contract_score >= 80 AND blockers.length === 0`; los mismos scores producen siempre la misma decisión (determinismo verificable en tests)
  4. `canvas-rules-index.md` declara `[scope: role]` en cada regla no universal: R10→`transformer,synthesizer`; SE01→`emitter`; R15→`transformer,synthesizer,renderer`; R02→`extractor,transformer cuando produce arrays`
  5. Los contratos de connectors viven como constante/módulo de código derivada de lo que `canvas-executor.ts` realmente lee — son la documentación del contrato real, no abstracciones del prompt
**Plans**: 4 plans
- [ ] 134-01-connector-contracts-module-PLAN.md — Módulo `canvas-connector-contracts.ts` con contratos declarativos de Gmail/Drive/MCP derivados línea-a-línea de canvas-executor.ts (ARCH-DATA-02/03)
- [ ] 134-02-rules-index-scope-annotations-PLAN.md — `[scope: role]` annotations en canvas-rules-index.md (R10, R15, R02, SE01) + test de parsing (ARCH-DATA-07)
- [ ] 134-03-scan-canvas-resources-enriched-PLAN.md — `scanCanvasResources` reescrito con catPaws+tools, connectors+contracts, canvas_similar top-3, templates + E2E audit (ARCH-DATA-01/04/05)
- [ ] 134-04-deterministic-qa-threshold-PLAN.md — `decideQaOutcome` en código (data_contract_score>=80 AND blockers===0) + CANVAS_QA_PROMPT update (ARCH-DATA-06)

---

### Phase 135: Architect Prompt Layer (ARCH-PROMPT)
**Goal**: `ARCHITECT_PROMPT` y `CANVAS_QA_PROMPT` reescritos para explotar los datos enriquecidos de la Phase 134. El architect sigue un checklist heartbeat de 6 pasos con 7 secciones (disponibilidad, taxonomía de roles, checklist, plantillas, few-shot, iterator, rules index), declara `data.role` en cada nodo, y cuando necesita un CatPaw inexistente lo incluye en `needs_cat_paws[]` (no inventa agentIds). El reviewer QA es role-aware: R10 solo aplica a `transformer/synthesizer`, un validador determinístico en código rechaza canvases con agentIds/connectorIds inexistentes, ciclos, tipos inválidos o múltiples `start` sin llamar al LLM. Toda la suite de tests unitarios queda verde incluyendo 4 tests nuevos.
**Depends on**: Phase 134 (el prompt necesita los campos que la data layer inyecta)
**Requirements**: ARCH-PROMPT-01, ARCH-PROMPT-02, ARCH-PROMPT-03, ARCH-PROMPT-04, ARCH-PROMPT-05, ARCH-PROMPT-06, ARCH-PROMPT-07, ARCH-PROMPT-08, ARCH-PROMPT-09, ARCH-PROMPT-10, ARCH-PROMPT-11, ARCH-PROMPT-12, ARCH-PROMPT-13, ARCH-PROMPT-14
**Success Criteria** (what must be TRUE):
  1. Todos los tests unitarios de `intent-job-executor.test.ts` y relacionados están verdes, incluyendo los 4 nuevos: (a) canvas con emitter sin R10 → reviewer no emite R10, result accept; (b) canvas con transformer que descarta campos → reviewer emite R10 blocker, result revise; (c) exhaustion → `notifyProgress` llamado con top-2 issues (spy); (d) validador determinístico rechaza canvas con `agentId` inexistente sin llamar al LLM
  2. El output del architect (verificado en `architect_iter0` persistido) incluye `data.role ∈ {extractor, transformer, synthesizer, renderer, emitter, guard, reporter}` en cada nodo del `flow_data`
  3. El reviewer LLM lee `data.role` y aplica R10 SOLO a nodos con `role ∈ {transformer, synthesizer}`; un nodo emitter o terminal nunca recibe R10 falso positivo
  4. Cuando el architect necesita un CatPaw no existente, produce `needs_cat_paws[{name, mode:'processor', system_prompt, skills_sugeridas, conectores_necesarios}]` en vez de inventar un `agentId`
  5. Antes de cada invocación del reviewer LLM, el validador determinístico en código verifica: agentIds existen en `cat_paws WHERE is_active=1`, connectorIds existen en `connectors WHERE is_active=1`, grafo es DAG, hay exactamente un nodo `start`, todos los tipos están en `VALID_NODE_TYPES`; si falla retorna `{recommendation:'reject'}` sin gastar tokens
**Plans**: TBD

---

### Phase 136: End-to-End Validation (VALIDATION) — GATE
**Goal**: Verificar contra LiteLLM real que la suma de fases 133+134+135 produce canvases correctos en los 3 casos canónicos. Esta es una fase de verificación pura, **NO** hay trabajo nuevo de features. Cada fallo se enruta determinísticamente a la fase responsable usando la matriz de diagnóstico (la causa raíz manda, no el síntoma). Ningún `VALIDATION-XX` se marca Complete hasta que los 3 casos pasan sus criterios específicos sin fallback — excepción única: "passed QA, defer runtime" permitido solo cuando el canvas-executor falla en runtime (out-of-scope del milestone).
**Depends on**: Phase 135 (necesita el prompt layer operativo; implícitamente también Phase 133 para `test-pipeline.mjs` y Phase 134 para la data layer)
**Requirements**: VALIDATION-01, VALIDATION-02, VALIDATION-03, VALIDATION-04, VALIDATION-05

**Failure routing matrix (verbatim desde REQUIREMENTS.md):**

| Síntoma observado | Causa raíz | Acción |
|---|---|---|
| R10 falsos positivos en nodos `role=emitter` o terminales | `CANVAS_QA_PROMPT` no respeta `data.role` antes de aplicar R10 | **Regresar a Phase 135**. Iterar ARCH-PROMPT-11/12/13 hasta que tests (a) y (c) de ARCH-PROMPT-13 pasen |
| Renderer NO produce contrato declarativo esperado (ej. falta `accion_final`, `report_to`, `results[]` en Holded Q1) | Capa de datos — architect no tiene contracts disponibles, o no los inyecta | **Regresar a Phase 134**. Verificar ARCH-DATA-02/03 hacen llegar contracts al architect. Si llegan pero architect los ignora → escalar a 135 |
| Architect genera `type:agent` donde debería haber `type:connector` (emitter-as-agent), tipos fuera de `VALID_NODE_TYPES`, o grafo con ciclos | `ARCHITECT_PROMPT` — checklist heartbeat insuficiente | **Regresar a Phase 135**. Iterar ARCH-PROMPT-03/05/09 |
| Architect inventa `agentId` inexistente o referencia CatPaw no activo | Primero verificar ARCH-PROMPT-10 (validador determinístico). Si validador no rechaza → **Phase 135** para reforzarlo. Si validador funciona pero architect sigue inventando → **Phase 135** para endurecer ARCH-PROMPT-09 | |
| Architect no declara `data.role` en algún nodo | `ARCHITECT_PROMPT` — Sección 2 (taxonomía) o checklist no obliga a declararlo | **Regresar a Phase 135**. Iterar ARCH-PROMPT-02/08 |
| QA acepta canvas pero `canvas-executor.ts` falla en ejecución runtime real | **OUT OF SCOPE del milestone** — `canvas-executor.ts` es fuente de verdad intocable | **NO regresar**. Log en `.planning/deferred-items.md`, marcar el caso como "passed QA, defer runtime", continuar a Phase 137 |
| Pipeline agota iteraciones QA en los 3 casos sin mejora entre iter 0 e iter 1 | Reviewer no da feedback accionable | **Regresar a Phase 135** para revisar schema `issues[].fix_hint` (ARCH-PROMPT-12) |
| `test-pipeline.mjs` tarda > 120s por caso o outputs intermedios no legibles | Phase 133 mal ejecutada | **Regresar a Phase 133**. Arreglar FOUND-08 |

**Regla general de enrutamiento:** datos incompletos → 134. Prompt no guía → 135. Gate script mal hecho → 133. Problema de runtime canvas → defer (fuera de scope).

**Success Criteria** (what must be TRUE — los 3 casos canónicos):
  1. **VALIDATION-01 (holded-q1):** `test-pipeline.mjs --case holded-q1` contra LiteLLM real produce un canvas donde QA converge en ≤ 2 iteraciones, todos los nodos tienen `data.role` declarado, el renderer produce `{accion_final: 'send_report', report_to, report_subject, results[]}`, y **cero R10 falsos positivos** en el nodo emitter Gmail
  2. **VALIDATION-02 (inbox-digest):** El caso genera un canvas con un nodo `iterator` correctamente estructurado; R10 aplica dentro del iterator body pero NO al emitter final; QA acepta sin exhaustion
  3. **VALIDATION-03 (drive-sync):** El caso produce un canvas donde R10 aplica correctamente como **verdadero positivo** en el transformer (forzando preservación de campos), y el nodo storage está clasificado con `role:'emitter'`
  4. **VALIDATION-04 (inspección manual):** Las instrucciones de los nodos `agent` de los 3 canvases tienen estructura ROL/PROCESO/OUTPUT, mencionan tools disponibles por nombre, y declaran contratos de campos explícitos (no descripciones libres < 200 chars)
  5. **VALIDATION-05 (post-mortem capability):** Si algún caso falla, los outputs intermedios persistidos (FOUND-06) permiten ver exactamente qué generó el architect en cada iteración sin re-ejecutar el pipeline
**Plans**: TBD (esta fase NO tiene plans de código — son ejecuciones de validación + enrutamiento según matriz)

---

### Phase 137: Learning Loops & Memory (LEARN)
**Goal**: El sistema aprende de cada interacción. CatBot tiene un skill de creación de CatPaw protocolarizado, una memoria de patrones por usuario que se inyecta en el system prompt, el goal del strategist se propaga como `initialInput` del nodo START, las condiciones aceptan variantes multilingües, Telegram muestra propuestas informativas con el título/nodos del canvas, `complexity_decisions.outcome` se cierra en cada terminal (completed/failed/timeout), y se evalúa documentadamente la fusión strategist+decomposer. La señal única de éxito del milestone (Holded Q1 end-to-end vía Telegram reproducible 3 veces) se verifica aquí.
**Depends on**: Phase 136 (gate de validación debe estar aprobado antes de refinamientos de loop)
**Requirements**: LEARN-01, LEARN-02, LEARN-03, LEARN-04, LEARN-05, LEARN-06, LEARN-07, LEARN-08, LEARN-09
**Success Criteria** (what must be TRUE):
  1. **Señal única del milestone (PART 7 de MILESTONE-CONTEXT.md):** el usuario envía por Telegram "Comparativa facturación Q1 2026 vs Q1 2025 de Holded, maquétala con el template corporativo y envíala a antonio@educa360.com y fen@educa360.com"; el sistema clasifica como complex, corre el pipeline async, propone el canvas, el usuario aprueba, el canvas ejecuta y ambos destinatarios reciben el email con template corporativo y cifras reales de Q1 2025 y Q1 2026. **Reproducible 3 veces consecutivas sin intervención manual ni reintentos**
  2. CatBot dispone del skill "Protocolo de creación de CatPaw" (categoria: system) y lo sigue cuando el architect emite `needs_cat_paws` o el usuario pide crear un CatPaw, presentando el plan antes de ejecutar `create_cat_paw`
  3. CatBot lee los patterns del usuario actual (`user_interaction_patterns` o `user_profile.user_patterns`) y los inyecta en el system prompt personalizando respuestas (ej. "usuario prefiere Q1/Q2, template corporativo, destinatarios antonio+fen")
  4. El `initialInput` del nodo START del canvas es el `goal` refinado del strategist (no el texto original de la petición); el executor del nodo `condition` acepta variantes multilingües case-insensitive (`['yes','sí','si','true','1','afirmativo','correcto']` vs `['no','false','0','negativo','incorrecto']`); `sendProposal` de Telegram muestra título del canvas + lista de nodos + tiempo estimado + botones aprobar/cancelar
  5. `complexity_decisions.outcome` se actualiza a `completed`/`failed`/`timeout` en cada pipeline terminal, permitiendo responder "% de peticiones complex completadas con éxito". Evaluación documentada con `test-pipeline.mjs` comparando strategist+decomposer vs prompt fusionado sobre holded-q1; fusión implementada SOLO si la calidad de tasks es equivalente o mejor
**Plans**: TBD

---

## Progress

**Execution Order:**
Phases execute linearly: 133 → 134 → 135 → 136 (GATE) → 137

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 133. Foundation & Tooling | 5/5 | Complete    | 2026-04-11 |
| 134. Architect Data Layer | 4/4 | Complete    | 2026-04-11 |
| 135. Architect Prompt Layer | 0/TBD | Not started | - |
| 136. End-to-End Validation (GATE) | 0/TBD | Not started | - |
| 137. Learning Loops & Memory | 0/TBD | Not started | - |

## Coverage

**Total v27.0 requirements:** 45
**Mapped:** 45/45
**Orphans:** 0

| Phase | Category | Req count | Requirements |
|-------|----------|-----------|--------------|
| 133 | FOUND | 10 | FOUND-01..10 |
| 134 | ARCH-DATA | 7 | ARCH-DATA-01..07 |
| 135 | ARCH-PROMPT | 14 | ARCH-PROMPT-01..14 |
| 136 | VALIDATION | 5 | VALIDATION-01..05 |
| 137 | LEARN | 9 | LEARN-01..09 |

## Milestone Success Signal (goal-backward anchor)

Del `MILESTONE-CONTEXT.md` Part 7: cuando el usuario envía por Telegram la petición de comparativa Q1 Holded y el sistema la completa end-to-end sin intervención, de forma reproducible, el milestone está completo. Esta señal se descompone en las 5 fases así:

- **Phase 133** habilita depuración + garantía de no-colgado del pipeline async → sin esto los otros fixes no son verificables
- **Phase 134** inyecta tools/contratos/similares al architect → sin esto el architect sigue adivinando
- **Phase 135** enseña al architect a usar esos datos y al QA a respetar roles → sin esto los datos no llegan al canvas generado
- **Phase 136** verifica contra LiteLLM real que las 3 capas suman → el gate obligatorio antes de loops finos
- **Phase 137** cierra los loops: protocolo de CatPaw, memoria, propagación de goal, multilingüe, Telegram informativo → entrega la reproducibilidad end-to-end de la señal única
