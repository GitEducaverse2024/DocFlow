# Requirements: DoCatFlow — Milestone v27.0 CatBot Intelligence Engine v2

**Defined:** 2026-04-11
**Core Value:** El Pipeline Architect trabaja con el contexto estructurado correcto (tools por CatPaw, contratos de conectores, canvases similares) en vez de adivinar. Caso canónico **Holded Q1** completa end-to-end sin intervención humana.

**Fuente:** `.planning/MILESTONE-CONTEXT.md` (briefing final) + `.planning/MILESTONE-CONTEXT-AUDIT.md` (auditoría de 86 preguntas)

> Requirements de milestones anteriores archivados en `.planning/milestones/` (v26.0 completado en fases 118-132).

---

## v27.0 Requirements

Requirements agrupados por capa. Cada uno mapea a una fase del roadmap (133=A, 134=B-datos, 135=B-prompts, 136=validación-gate, 137=C).

---

### FOUND — Fundación y tooling del pipeline async *(→ Phase 133)*

**Secuencia interna obligatoria:** `test-pipeline.mjs` (FOUND-08/09) debe ser el **último** task de la fase. El script solo tiene valor cuando FOUND-04 (timeout), FOUND-05 (reaper), FOUND-06 (persistencia outputs intermedios) y FOUND-07 (flow_data en exhaustion) ya están operativos — si se implementa antes, ejecuta el pipeline en estado incompleto y los resultados no sirven para validar 134/135.

**Criterio de done de Phase 133 (exacto):** ejecutar `node app/scripts/test-pipeline.mjs --case holded-q1` contra LiteLLM real y recibir `flow_data + qa_report + outputs intermedios` en stdout en **< 240 segundos**. Calibrado empíricamente 2026-04-11: pickup ~18s (tick 30s) + strategist/decomposer ~15s + architect+QA iter0 ~47s + architect+QA iter1 ~45s ≈ 125s wall-clock baseline para este caso con Gemini + 2 iteraciones de QA. El `<60s` original era aspiracional y no tenía base empírica; el headroom hasta 240s absorbe jitter de latencia LLM sin enmascarar regresiones reales. Sin este comando produciendo output útil, la fase no está completa.


- [x] **FOUND-01**: `docker-entrypoint.sh` copia `*.md` además de `*.json` al volumen de knowledge al arrancar el contenedor
- [x] **FOUND-02**: `VALID_NODE_TYPES` en `canvas-flow-designer.ts` contiene los 14 tipos de nodo que el architect puede generar (baseline validado por test unitario)
- [x] **FOUND-03**: `canvas-nodes-catalog.md` vive en `app/data/knowledge/` y `getCanvasRule('R10')` devuelve la regla correctamente cuando se ejecuta dentro del contenedor Docker
- [x] **FOUND-04**: Todas las llamadas `fetch` de `callLLM` en `intent-job-executor.ts` usan `AbortSignal.timeout(90_000)` y liberan `this.currentJobId` si el fetch aborta
- [x] **FOUND-05**: Un job reaper corre cada 5 minutos dentro del executor; marca como `failed` cualquier job en status `strategist|decomposer|architect` con `updated_at` >10 minutos, notifica al usuario por el canal original y limpia `currentJobId` si aplica
- [x] **FOUND-06**: La tabla `intent_jobs` persiste los outputs intermedios del pipeline: `strategist_output`, `decomposer_output`, `architect_iter0`, `qa_iter0`, `architect_iter1`, `qa_iter1` (columnas TEXT, añadidas vía ALTER TABLE IF NOT EXISTS en `db.ts`)
- [x] **FOUND-07**: Cuando el QA loop agota iteraciones, el `flow_data` del último intento del architect queda guardado en el campo `context` del `knowledge_gap` (post-mortem viable)
- [x] **FOUND-08**: Existe `app/scripts/test-pipeline.mjs` que acepta `--case <name>`, `--goal <text>`, `--save-baseline`, `--diff <path>`; inserta un job sintético, invoca `IntentJobExecutor.tick()` directamente, hace polling hasta estado terminal, imprime flow_data + roles + instrucciones + iteraciones QA + qa_report + tokens + tiempo, y limpia el job
- [x] **FOUND-09**: Existen los fixtures `app/scripts/pipeline-cases/holded-q1.json`, `inbox-digest.json`, `drive-sync.json` con el `original_request` canonizado de cada caso
- [x] **FOUND-10**: En exhaustion del QA loop, `runArchitectQALoop` llama `notifyProgress(job, msg, force=true)` al usuario con los top-2 issues (por severity) del último qa_report, antes de `markTerminal`

---

### ARCH-DATA — Capa de datos del architect (scanCanvasResources enriquecido) *(→ Phase 134)*

- [x] **ARCH-DATA-01**: `scanCanvasResources` devuelve por cada CatPaw activo un objeto `{paw_id, paw_name, paw_mode, tools_available[], skills[], best_for}` donde `tools_available` se construye desde `cat_paw_connectors JOIN connectors` mapeando tipo de conector (gmail, google_drive, mcp_server+Holded) a la lista de tools correspondiente
- [x] **ARCH-DATA-02**: `scanCanvasResources` devuelve por cada connector activo un objeto `{connector_id, connector_name, connector_type, contracts: {accion: {required_fields, optional_fields, description}}}` con los contratos reales que el executor Gmail/Drive/Holded espera del nodo predecesor (mínimo: `send_report`, `send_reply`, `mark_read` para Gmail)
- [x] **ARCH-DATA-03**: El catálogo de contratos de conectores está implementado como constante/módulo en código (no en prompt), derivado de lo que el executor realmente lee — es la documentación del contrato real, no una abstracción
- [x] **ARCH-DATA-04**: `scanCanvasResources` devuelve top-3 `canvas_similar` (canvases en BD cuyo nombre/descripción contienen palabras del goal) con `{canvas_id, canvas_name, node_roles[], was_executed, note}`
- [x] **ARCH-DATA-05**: `scanCanvasResources` devuelve los templates disponibles con su estructura de nodos como referencia para el architect
- [x] **ARCH-DATA-06**: El threshold de calidad (`data_contract_score >= 80 AND blockers.length === 0`) vive en código en `runArchitectQALoop`, no dentro del string del prompt; la decisión accept/revise/exhaust es determinista y los mismos scores producen siempre la misma decisión
- [x] **ARCH-DATA-07**: `canvas-rules-index.md` declara `[scope: role]` en cada regla que no sea universal: R10→`transformer,synthesizer`; SE01→`emitter`; R15→`transformer,synthesizer,renderer`; R02→`extractor,transformer cuando produce arrays`. Las universales (R03, R04, R11, R20, R23, R24) no necesitan anotación

---

### ARCH-PROMPT — Capa de prompts del architect (heartbeat + QA con roles) *(→ Phase 135)*

- [x] **ARCH-PROMPT-01**: `ARCHITECT_PROMPT` declara la Sección 1 "Lo que tienes disponible" con los campos del input del architect (goal, tasks[], resources.catPaws[], resources.connectors[], resources.skills[], resources.canvas_similar[], resources.templates[])
- [x] **ARCH-PROMPT-02**: `ARCHITECT_PROMPT` incluye Sección 2 con la taxonomía de 7 roles funcionales (extractor, transformer, synthesizer, renderer, emitter, guard, reporter) compartida como vocabulario con el reviewer
- [x] **ARCH-PROMPT-03**: `ARCHITECT_PROMPT` incluye Sección 3 con el checklist heartbeat de 6 pasos (clasifica rol → emitter busca contract → iterator si array → agent busca CatPaw+menciona tools por nombre → valida cadena de datos → needs_cat_paws si falta CatPaw)
- [x] **ARCH-PROMPT-04**: `ARCHITECT_PROMPT` incluye Sección 4 con plantillas copiables de instrucciones por rol (transformer, renderer, emitter) con estructura INPUT/PROCESO/OUTPUT y regla de formato
- [x] **ARCH-PROMPT-05**: `ARCHITECT_PROMPT` incluye Sección 5 con al menos 2 pares few-shot MALO→BUENO para roles renderer y emitter (incluyendo el caso del emitter-as-agent que falló en Holded Q1)
- [x] **ARCH-PROMPT-06**: `ARCHITECT_PROMPT` incluye Sección 6 con un patrón iterator copiable (flow_data completo con edges correctos como template literal)
- [x] **ARCH-PROMPT-07**: `ARCHITECT_PROMPT` declara `{{RULES_INDEX}}` como marcador (Sección 7) igual que el prompt actual, rellenado en tiempo de render
- [x] **ARCH-PROMPT-08**: El output del architect incluye `data.role` en cada nodo del flow_data, declarado explícitamente por el LLM siguiendo la taxonomía de 7 roles
- [x] **ARCH-PROMPT-09**: Cuando el architect necesita un CatPaw que no existe, lo incluye en `needs_cat_paws[]` con `{name, mode:'processor', system_prompt (estructura ROL/MISIÓN/PROCESO/OUTPUT), skills_sugeridas, conectores_necesarios}` en vez de inventar un `agentId`
- [x] **ARCH-PROMPT-10**: Antes de invocar al reviewer LLM, un validador determinístico en código verifica que todos los `agentId` existen en `cat_paws WHERE is_active=1`, todos los `connectorId` existen en `connectors WHERE is_active=1`, el grafo es DAG (sin ciclos), hay exactamente un nodo `start`, y todos los tipos están en `VALID_NODE_TYPES`; si falla retorna `{recommendation: 'reject'}` sin llamar al LLM
- [x] **ARCH-PROMPT-11**: `CANVAS_QA_PROMPT` reescrito lee `data.role` de cada nodo antes de aplicar cualquier regla, aplica R10 **sólo** a nodos con `role ∈ {transformer, synthesizer}`, detecta nodos terminales y no les aplica R10
- [x] **ARCH-PROMPT-12**: El schema de output del reviewer produce `{data_contract_score, instruction_quality_score, issues[{severity, scope, rule_id, node_id, node_role, description, fix_hint}], recommendation}`
- [x] **ARCH-PROMPT-13**: Tests unitarios cubren: (a) canvas con emitter sin R10 → reviewer no emite R10, result accept; (b) canvas con transformer que descarta campos → reviewer emite R10 blocker, result revise; (c) exhaustion → `notifyProgress` llamado con top-2 issues (spy); (d) validador determinístico rechaza canvas con agentId inexistente sin llamar al LLM
- [x] **ARCH-PROMPT-14**: Los mocks en `intent-job-executor.test.ts` están actualizados al nuevo schema de reviewer (dos scores) y toda la suite sigue verde

---

### VALIDATION — Validación end-to-end contra LiteLLM real *(→ Phase 136, gate obligatorio)*

Fase de verificación, no de código. Ejecuta los 3 casos canonizados contra LiteLLM real y enruta el fallo a la fase correcta para iterar.

**Criterio de fallo explícito y enrutamiento (matriz de diagnóstico):**

| Síntoma observado en cualquier caso | Causa raíz | Acción |
|---|---|---|
| El reviewer LLM emite **R10 falsos positivos en nodos con `role=emitter`** (o nodos terminales) | Problema en `CANVAS_QA_PROMPT` — el prompt no está leyendo/respetando `data.role` antes de aplicar R10 | **Regresar a Phase 135**. Iterar sobre ARCH-PROMPT-11/12/13 hasta que los tests (a) y (c) de ARCH-PROMPT-13 pasen contra el nuevo reviewer |
| El nodo **renderer NO produce el contrato declarativo** esperado por el connector siguiente (ej. falta `accion_final`, `report_to`, `results[]` en Holded Q1) | Problema en la capa de datos — el architect no tiene los contratos declarativos disponibles para referenciar, o no los está inyectando en las instrucciones | **Regresar a Phase 134**. Verificar que ARCH-DATA-02 y ARCH-DATA-03 realmente hacen llegar los contracts al architect; si llegan pero el architect los ignora, escalar a 135 (prompt no enseña a usarlos) |
| El architect genera un **nodo `type: agent` donde debería haber un `type: connector`** (ej. emitter-as-agent del caso Holded Q1 original), o usa tipos de nodo fuera de `VALID_NODE_TYPES`, o produce un grafo con ciclos | Problema en `ARCHITECT_PROMPT` — el checklist heartbeat (ARCH-PROMPT-03) no está guiando al LLM a usar el tipo correcto | **Regresar a Phase 135**. Iterar sobre ARCH-PROMPT-03/05/09 (checklist + few-shot + needs_cat_paws) |
| El architect **inventa un `agentId` inexistente** o referencia un CatPaw no activo | Problema mixto: el architect no ve el inventario de CatPaws o el validador determinístico no está filtrando | Primero verificar ARCH-PROMPT-10 (validador determinístico). Si el validador no rechaza el canvas, **regresar a Phase 135** para reforzar el validador. Si el validador funciona pero el architect sigue inventando, **regresar a Phase 135** para endurecer ARCH-PROMPT-09 |
| El architect **no declara `data.role` en algún nodo** | Problema en `ARCHITECT_PROMPT` — la Sección 2 (taxonomía) o el checklist no obliga a declarar role | **Regresar a Phase 135**. Iterar sobre ARCH-PROMPT-02/08 |
| QA acepta el canvas pero **el executor del canvas falla en ejecución real** (no en el pipeline async) contra LiteLLM | El problema está fuera del scope del milestone — `canvas-executor.ts` es out-of-scope | **NO regresar a fases anteriores**. Abrir issue específico en `.planning/deferred-items.md` con detalles, marcar el caso de VALIDATION como "passed QA, defer runtime" y continuar a Phase 137 |
| El pipeline async **agota iteraciones QA** en los 3 casos sin mejoras claras entre iter 0 e iter 1 | Problema de prompt rendering — el reviewer no está dando feedback accionable | **Regresar a Phase 135** para revisar el schema de `issues[].fix_hint` (ARCH-PROMPT-12) |
| El script `test-pipeline.mjs` **tarda > 240 segundos** por caso o los outputs intermedios no son legibles | Problema de Phase 133 — el script no quedó bien hecho | **Regresar a Phase 133**. Arreglar FOUND-08 |

**Regla general:** el enrutamiento del fallo se basa en *qué capa falló*, no en *qué síntoma produjo el fallo*. Datos incompletos → 134. Prompt no guía → 135. Gate script mal hecho → 133. Problema de runtime canvas → defer (fuera de scope).

**Ningún VALIDATION-XX se marca Complete hasta que los 3 casos pasan los criterios específicos sin fallback a "passed QA, defer runtime"** (excepto el último escenario de la matriz, que es el único permitido).


- [ ] **VALIDATION-01** (holded-q1): `node app/scripts/test-pipeline.mjs --case holded-q1` ejecutado contra LiteLLM real produce un canvas donde QA converge en ≤ 2 iteraciones, todos los nodos tienen `data.role` declarado, el nodo renderer produce `{accion_final: 'send_report', report_to, report_subject, results[]}`, y cero R10 falsos positivos emitidos al nodo emitter Gmail
- [ ] **VALIDATION-02** (inbox-digest): El caso inbox-digest genera un canvas con un nodo `iterator` correctamente estructurado; R10 aplica dentro del iterator body pero NO al emitter final; QA acepta sin exhaustion
- [ ] **VALIDATION-03** (drive-sync): El caso drive-sync produce un canvas donde R10 aplica correctamente como verdadero positivo en el transformer (forzando preservación de campos), y el nodo storage está clasificado con `role: 'emitter'`
- [ ] **VALIDATION-04** (inspección manual): Las instrucciones de los nodos agent de los 3 canvas tienen estructura ROL/PROCESO/OUTPUT, mencionan tools disponibles por nombre, y declaran contratos de campos explícitos (no descripciones libres de <200 chars)
- [ ] **VALIDATION-05** (post-mortem): Si algún caso falla, los outputs intermedios persistidos (FOUND-06) permiten ver exactamente qué generó el architect en cada iteración sin re-ejecutar

---

### LEARN — Loops de aprendizaje y memoria *(→ Phase 137)*

- [x] **LEARN-01**: Existe un skill del sistema (`categoria: system`) "Protocolo de creación de CatPaw" accesible por CatBot en todas las conversaciones, con los 5 pasos: identificar función, skills necesarias, conectores necesarios, system prompt estructurado (ROL/MISIÓN/PROCESO/CASOS/OUTPUT + temperatura + formato), plan al usuario antes de crear
- [x] **LEARN-02**: CatBot sigue el protocolo LEARN-01 cuando el architect detecta `needs_cat_paws` o el usuario pide "crea un CatPaw para X", presentando el plan antes de ejecutar `create_cat_paw`
- [x] **LEARN-03**: Existe mecanismo de memoria de interacción por usuario (tabla `user_interaction_patterns` nueva o campo `user_patterns` en `user_profile` existente) donde CatBot puede escribir observaciones como "usuario prefiere Q1/Q2, template corporativo, destinatarios antonio+fen"
- [x] **LEARN-04**: CatBot lee los patterns del usuario actual e inyecta el resumen en el system prompt para personalizar respuestas
- [x] **LEARN-05**: El `goal` producido por el strategist se propaga como `initialInput` del nodo START del canvas al crear el flow_data (en vez del texto original de la petición)
- [x] **LEARN-06**: El executor del nodo `condition` acepta variantes multilingües: `['yes','sí','si','true','1','afirmativo','correcto']` vs `['no','false','0','negativo','incorrecto']` (case-insensitive)
- [x] **LEARN-07**: `sendProposal` vía Telegram incluye antes de aprobar: título del canvas, lista de nodos con descripción breve (uno por línea), tiempo estimado, botones aprobar/cancelar
- [x] **LEARN-08**: `complexity_decisions.outcome` se actualiza a `completed`/`failed`/`timeout` al cerrar cada pipeline async (éxito / exhaustion / reaper), permitiendo responder "% de peticiones complex completadas con éxito"
- [x] **LEARN-09**: Evaluación documentada con `test-pipeline.mjs` comparando strategist+decomposer (2 calls actuales) vs prompt fusionado (1 call) sobre holded-q1; fusión implementada SOLO si la calidad de las tasks resultantes es equivalente o mejor

---

## v28+ Requirements (Deferred)

Ideas que surgen del briefing pero quedan fuera del scope de v27.0. No acción en este milestone.

### Expansion

- **EXP-01**: Canvas parallel node execution (hoy topological order secuencial)
- **EXP-02**: Pipeline async multi-job concurrente (hoy 1 job a la vez)
- **EXP-03**: Loop detection en canvas runtime (hoy DAG only)
- **EXP-04**: Sistema de "recipes" aprendidas global compartidas entre usuarios (hoy user_memory es per-user)

---

## Out of Scope (v27.0)

| Feature | Reason |
|---------|--------|
| Tocar `canvas-executor.ts` | Es la fuente de verdad del contrato. Sus decisiones de implementación son ley en este milestone. |
| Tocar `insertSideEffectGuards` | 36/36 tests verdes, no tocar. |
| Tocar state machine `intent_jobs` | 23/23 tests verdes, funciona. |
| Tocar `attemptNodeRepair` | 7/7 tests verdes, funciona. |
| Tocar channel propagation Telegram/web | Funciona, no tocar. |
| Tocar UI del Canvas | Fuera de scope del milestone. |
| Añadir tipos de nodo nuevos | NO es la forma de "solucionar" el problema del architect — se resuelve con datos+prompts. |
| Subir `MAX_QA_ITERATIONS` | Más iteraciones del mismo error = mismo resultado con más coste. La mejora viene del prompt, no del loop. |
| Research del dominio previo | El briefing + auditoría ya son la investigación canonizada. |
| Rehacer `complexity_assessment` protocol | Funciona, solo se mejora el loop de `outcome` en LEARN-08. |

---

## Traceability

Mapeo de requirements a fases del roadmap. Poblado completamente tras crear `ROADMAP.md`.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | 133 | Complete |
| FOUND-02 | 133 | Complete |
| FOUND-03 | 133 | Complete |
| FOUND-04 | 133 | Complete |
| FOUND-05 | 133 | Complete |
| FOUND-06 | 133 | Complete |
| FOUND-07 | 133 | Complete |
| FOUND-08 | 133 | Complete |
| FOUND-09 | 133 | Complete |
| FOUND-10 | 133 | Complete |
| ARCH-DATA-01 | 134 | Complete |
| ARCH-DATA-02 | 134 | Complete |
| ARCH-DATA-03 | 134 | Complete |
| ARCH-DATA-04 | 134 | Complete |
| ARCH-DATA-05 | 134 | Complete |
| ARCH-DATA-06 | 134 | Complete |
| ARCH-DATA-07 | 134 | Complete |
| ARCH-PROMPT-01 | 135 | Complete |
| ARCH-PROMPT-02 | 135 | Complete |
| ARCH-PROMPT-03 | 135 | Complete |
| ARCH-PROMPT-04 | 135 | Complete |
| ARCH-PROMPT-05 | 135 | Complete |
| ARCH-PROMPT-06 | 135 | Complete |
| ARCH-PROMPT-07 | 135 | Complete |
| ARCH-PROMPT-08 | 135 | Complete |
| ARCH-PROMPT-09 | 135 | Complete |
| ARCH-PROMPT-10 | 135 | Complete |
| ARCH-PROMPT-11 | 135 | Complete |
| ARCH-PROMPT-12 | 135 | Complete |
| ARCH-PROMPT-13 | 135 | Complete |
| ARCH-PROMPT-14 | 135 | Complete |
| VALIDATION-01 | 136 | Pending |
| VALIDATION-02 | 136 | Pending |
| VALIDATION-03 | 136 | Pending |
| VALIDATION-04 | 136 | Pending |
| VALIDATION-05 | 136 | Pending |
| LEARN-01 | 137 | Complete |
| LEARN-02 | 137 | Complete |
| LEARN-03 | 137 | Complete |
| LEARN-04 | 137 | Complete |
| LEARN-05 | 137 | Complete |
| LEARN-06 | 137 | Complete |
| LEARN-07 | 137 | Complete |
| LEARN-08 | 137 | Complete |
| LEARN-09 | 137 | Complete |

**Coverage:**
- v27.0 requirements: **45 total**
- Mapped to phases: **45**
- Unmapped: **0** ✓

**Requirement counts by phase:**
- Phase 133 (FOUND — fundación): 10
- Phase 134 (ARCH-DATA — datos del architect): 7
- Phase 135 (ARCH-PROMPT — prompts del architect): 14
- Phase 136 (VALIDATION — gate E2E contra LiteLLM real): 5
- Phase 137 (LEARN — loops y memoria): 9

---

*Requirements defined: 2026-04-11*
*Based on: `.planning/MILESTONE-CONTEXT.md` (briefing final) + `.planning/MILESTONE-CONTEXT-AUDIT.md` (auditoría 86 Q)*
*Last updated: 2026-04-11 after initial definition*
