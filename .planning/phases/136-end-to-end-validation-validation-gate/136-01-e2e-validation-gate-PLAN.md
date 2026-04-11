---
phase: 136-end-to-end-validation-validation-gate
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/136-end-to-end-validation-validation-gate/runs/holded-q1.json
  - .planning/phases/136-end-to-end-validation-validation-gate/runs/inbox-digest.json
  - .planning/phases/136-end-to-end-validation-validation-gate/runs/drive-sync.json
  - .planning/phases/136-end-to-end-validation-validation-gate/runs/inspection-notes.md
  - .planning/phases/136-end-to-end-validation-validation-gate/runs/post-mortem-dry-run.md
  - .planning/phases/136-end-to-end-validation-validation-gate/136-VERIFICATION.md
  - .planning/deferred-items.md
autonomous: false
requirements:
  - VALIDATION-01
  - VALIDATION-02
  - VALIDATION-03
  - VALIDATION-04
  - VALIDATION-05

must_haves:
  truths:
    - "Docker container corre Phase 135 wiring (CANVAS_QA_PROMPT v135 + validator gate + data.role reading) en runtime real contra LiteLLM"
    - "holded-q1 produce canvas donde QA converge en ≤2 iteraciones, todos los nodos tienen data.role, renderer emite contrato {accion_final:'send_report', report_to, report_subject, results[]}, cero R10 falsos positivos en emitter Gmail"
    - "inbox-digest produce canvas con nodo iterator estructurado; R10 aplica dentro del iterator body pero NUNCA al emitter final; QA acepta sin exhaustion"
    - "drive-sync produce canvas donde R10 es verdadero positivo en transformer (preserva campos) y el nodo storage tiene data.role='emitter'"
    - "Inspección manual confirma que los nodos agent de los 3 canvases tienen instrucciones con estructura ROL/PROCESO/OUTPUT, mencionan tools por nombre, declaran contratos de campos explícitos (≥200 chars, no descripciones libres cortas)"
    - "Post-mortem dry-run sobre intent_jobs.architect_iter0/qa_iter0/architect_iter1/qa_iter1 permite reconstruir cada iteración sin re-ejecutar pipeline (FOUND-06 usable como oráculo)"
    - "Cualquier fallo observado queda enrutado determinísticamente a la fase responsable usando la matriz — o deferido explícitamente si es runtime canvas-executor"
  artifacts:
    - path: ".planning/phases/136-end-to-end-validation-validation-gate/runs/holded-q1.json"
      provides: "Captura completa de test-pipeline.mjs --case holded-q1 (flow_data + qa_report + outputs intermedios)"
      contains: "flow_data"
    - path: ".planning/phases/136-end-to-end-validation-validation-gate/runs/inbox-digest.json"
      provides: "Captura completa de test-pipeline.mjs --case inbox-digest"
      contains: "flow_data"
    - path: ".planning/phases/136-end-to-end-validation-validation-gate/runs/drive-sync.json"
      provides: "Captura completa de test-pipeline.mjs --case drive-sync"
      contains: "flow_data"
    - path: ".planning/phases/136-end-to-end-validation-validation-gate/runs/inspection-notes.md"
      provides: "VALIDATION-04 manual inspection evidence per caso y por nodo"
      min_lines: 40
    - path: ".planning/phases/136-end-to-end-validation-validation-gate/runs/post-mortem-dry-run.md"
      provides: "VALIDATION-05 evidence: sqlite query outputs de intent_jobs stage columns reconstruyendo cada iteración"
      min_lines: 20
    - path: ".planning/phases/136-end-to-end-validation-validation-gate/136-VERIFICATION.md"
      provides: "Phase 136 verification summary con status por VALIDATION-XX, routing decisions de cada fallo, evidencia CatBot oracle"
      min_lines: 60
  key_links:
    - from: "docker runtime"
      to: "CANVAS_QA_PROMPT v135 + validateCanvasDeterministic gate"
      via: "docker compose build --no-cache && up + chown + restart"
      pattern: "validateCanvasDeterministic|buildActiveSets"
    - from: "test-pipeline.mjs --case X"
      to: "runs/{case}.json"
      via: "stdout capture redirect"
      pattern: "flow_data.*qa_report"
    - from: "intent_jobs stage columns"
      to: "post-mortem-dry-run.md"
      via: "sqlite3 catbot.db SELECT architect_iter0,qa_iter0,architect_iter1,qa_iter1"
      pattern: "architect_iter0|qa_iter0"
---

<objective>
Validar end-to-end contra LiteLLM real que la suma de Phases 133+134+135 produce canvases correctos en los 3 casos canónicos (holded-q1, inbox-digest, drive-sync) y cerrar el gate del milestone v27.0.

Purpose: Esta es una fase GATE de verificación pura. NO hay código nuevo. El plan ejecuta `test-pipeline.mjs` contra LiteLLM real, captura intermedios persistidos (FOUND-06), inspecciona manualmente los canvases, y en cualquier fallo enruta determinísticamente a la fase responsable usando la matriz de routing. Sin este gate aprobado, Phase 137 no puede arrancar.

Output: 3 capturas JSON + notas de inspección manual + post-mortem dry-run + 136-VERIFICATION.md con status por VALIDATION-XX y evidencia CatBot (oráculo del sistema por CLAUDE.md).
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@./CLAUDE.md

@app/scripts/test-pipeline.mjs
@app/scripts/pipeline-cases/holded-q1.json
@app/scripts/pipeline-cases/inbox-digest.json
@app/scripts/pipeline-cases/drive-sync.json
@app/scripts/pipeline-cases/baselines/holded-q1.json
@app/scripts/pipeline-cases/baselines/inbox-digest.json
@app/scripts/pipeline-cases/baselines/drive-sync.json

@.planning/phases/133-foundation-tooling-found/133-VERIFICATION.md
@.planning/phases/135-architect-prompt-layer-arch-prompt/135-VERIFICATION.md

<failure_routing_matrix>
CRITICAL: Cualquier fallo observado DEBE enrutarse usando esta matriz. La causa raíz manda, no el síntoma. Ningún VALIDATION-XX se marca Complete si hay fallback a "passed QA, defer runtime" salvo en el último escenario.

| Síntoma | Causa raíz | Acción |
|---|---|---|
| R10 falsos positivos en nodos role=emitter o terminales | CANVAS_QA_PROMPT no respeta data.role antes de R10 | **Regresar a Phase 135**. Iterar ARCH-PROMPT-11/12/13 hasta que tests (a) y (c) pasen |
| Renderer NO produce contrato declarativo esperado (falta accion_final/report_to/results[]) | Capa de datos — contracts no llegan al architect o no se inyectan | **Regresar a Phase 134**. Verificar ARCH-DATA-02/03. Si llegan pero architect los ignora → escalar a 135 |
| type:agent donde debería haber type:connector, tipos fuera de VALID_NODE_TYPES, ciclos | ARCHITECT_PROMPT checklist insuficiente | **Regresar a Phase 135**. Iterar ARCH-PROMPT-03/05/09 |
| agentId inventado o CatPaw no activo | Validador determinístico no rechaza | Primero verificar ARCH-PROMPT-10. Si validador no rechaza → **Phase 135** para reforzarlo. Si valida pero architect insiste → **Phase 135** endurecer ARCH-PROMPT-09 |
| data.role ausente en algún nodo | ARCHITECT_PROMPT Sección 2 o checklist no lo obliga | **Regresar a Phase 135**. Iterar ARCH-PROMPT-02/08 |
| QA acepta pero canvas-executor falla en runtime real | OUT OF SCOPE — canvas-executor intocable | **NO regresar**. Log en `.planning/deferred-items.md`, marcar "passed QA, defer runtime", continuar a Phase 137 |
| Pipeline agota iteraciones QA sin mejora entre iter 0 e iter 1 | Reviewer no da feedback accionable | **Regresar a Phase 135**. Revisar schema issues[].fix_hint (ARCH-PROMPT-12) |
| test-pipeline.mjs > 240s por caso o outputs no legibles | Phase 133 mal ejecutada | **Regresar a Phase 133**. Arreglar FOUND-08 |

Regla general: datos incompletos → 134. Prompt no guía → 135. Gate script roto → 133. Runtime canvas → defer.
</failure_routing_matrix>

<validation_criteria_verbatim>
From REQUIREMENTS.md lines 91-95 (VALIDATION-01..05):

- **VALIDATION-01** (holded-q1): `node app/scripts/test-pipeline.mjs --case holded-q1` contra LiteLLM real produce canvas donde (a) QA converge en ≤ 2 iteraciones, (b) todos los nodos tienen `data.role` declarado, (c) renderer produce `{accion_final: 'send_report', report_to, report_subject, results[]}`, (d) cero R10 falsos positivos en el nodo emitter Gmail.

- **VALIDATION-02** (inbox-digest): Canvas con nodo `iterator` correctamente estructurado; R10 aplica dentro del iterator body pero NO al emitter final; QA acepta sin exhaustion.

- **VALIDATION-03** (drive-sync): Canvas donde R10 aplica como **verdadero positivo** en transformer (forzando preservación de campos), y nodo storage clasificado con `role:'emitter'`.

- **VALIDATION-04** (inspección manual): Instrucciones de nodos `agent` de los 3 canvases tienen estructura ROL/PROCESO/OUTPUT, mencionan tools por nombre, declaran contratos de campos explícitos (no descripciones libres < 200 chars).

- **VALIDATION-05** (post-mortem): Outputs intermedios persistidos en `intent_jobs` (FOUND-06) permiten ver qué generó el architect en cada iteración sin re-ejecutar el pipeline.
</validation_criteria_verbatim>

<interfaces>
From app/scripts/test-pipeline.mjs (FOUND-08/09):
- Invocation: `node app/scripts/test-pipeline.mjs --case <name>` where name ∈ {holded-q1, inbox-digest, drive-sync}
- Stdout output: JSON-ish blob containing flow_data (nodes+edges), qa_report (per iteration), roles per node, instructions per node, tokens, wall clock
- Exit non-zero on timeout > 240s or terminal failure
- Uses IntentJobExecutor.tick() dispatched inside the container via synthetic job insertion

From intent_jobs table (FOUND-06):
- Columns: strategist_output, decomposer_output, architect_iter0, qa_iter0, architect_iter1, qa_iter1 (all TEXT, JSON blobs)
- DB path: /app/data/catbot.db inside container

From canvas-flow-designer.ts (Phase 135-01):
- ROLE_TAXONOMY = ['extractor','transformer','synthesizer','renderer','emitter','guard','reporter']
- validateCanvasDeterministic(canvas, activeCatPaws, activeConnectors) returns {ok, recommendation, issues[]}
- R10 scope: {transformer, synthesizer} ONLY — emitter/guard/reporter/renderer/extractor NEVER receive R10

From CANVAS_QA_PROMPT v135 (Phase 135-03):
- Reads data.role as algorithm step 1
- Emits QaReport with quality_score + data_contract_score + instruction_quality_score + per-issue scope + node_role
- decideQaOutcome uses `data_contract_score >= 80 AND blockers.length === 0` (Phase 134-04)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rebuild docker con Phase 135 wiring y verificar runtime</name>
  <files>
    (no source modifications — pure infra operation)
  </files>
  <action>
Rebuild del contenedor docflow-app para que CANVAS_QA_PROMPT v135 + validateCanvasDeterministic gate + data.role reader estén vivos en runtime. Comando exacto (de MEMORY.md):

```bash
cd ~/docflow && docker compose build --no-cache && docker compose up -d && docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && docker restart docflow-app
```

Tras el restart:
1. `docker logs docflow-app 2>&1 | tail -100` para confirmar que instrumentation.ts arrancó (TelegramBotService + DrivePollingService + IntentJobExecutor). Buscar literal `[IntentJobExecutor] started` o equivalente.
2. `docker exec docflow-app sh -c "ls /app/data/knowledge/*.md"` para confirmar que FOUND-01/03 copiaron canvas-nodes-catalog.md al volumen.
3. `docker exec docflow-app sh -c "sqlite3 /app/data/catbot.db '.schema intent_jobs'" | grep -E 'architect_iter|qa_iter'` para confirmar FOUND-06 columns vivas.
4. `docker exec docflow-app node -e "const {validateCanvasDeterministic} = require('/app/.next/standalone/app/src/lib/services/canvas-flow-designer.js'); console.log(typeof validateCanvasDeterministic);"` — si falla por import path, buscar el chunk real con `docker exec docflow-app find /app/.next -name '*.js' | xargs grep -l validateCanvasDeterministic 2>/dev/null | head -3`. Si NO existe en el bundle → fallo de bundling de Phase 135 → abortar validation y volver a 135.

NO ejecutar ningún caso hasta que los 4 checks pasen. Si el runtime no está listo, no hay gate válido.
  </action>
  <verify>
    <automated>docker exec docflow-app sh -c "sqlite3 /app/data/catbot.db '.schema intent_jobs'" | grep -q architect_iter0 && docker exec docflow-app sh -c "test -f /app/data/knowledge/canvas-nodes-catalog.md" && echo "RUNTIME_READY"</automated>
  </verify>
  <done>
Contenedor arrancado con la build actual de main (incluye commits 29a38f1+88fce4d+10eb78b+357c8b3 de Phase 135). IntentJobExecutor corriendo. intent_jobs tiene stage columns. canvas-nodes-catalog.md en volumen. validateCanvasDeterministic presente en el bundle de Next.js. Si cualquier check falla, el plan NO avanza a task 2.
  </done>
</task>

<task type="auto">
  <name>Task 2: Ejecutar holded-q1 contra LiteLLM real y capturar intermedios</name>
  <files>
    .planning/phases/136-end-to-end-validation-validation-gate/runs/holded-q1.json
  </files>
  <action>
Ejecutar el oráculo end-to-end del caso canónico holded-q1 (la señal única del milestone, PART 7 de MILESTONE-CONTEXT.md):

```bash
cd ~/docflow && node app/scripts/test-pipeline.mjs --case holded-q1 2>&1 | tee .planning/phases/136-end-to-end-validation-validation-gate/runs/holded-q1.json
```

Timeout hard: 240s (criterio de Phase 133 calibrado empíricamente; el original <60s era aspiracional). Si wall-clock > 240s → aplicar routing matrix (fila 8) → regresar a Phase 133 FOUND-08.

Tras el run, inspeccionar el JSON capturado y validar VERBATIM VALIDATION-01 cuatro sub-criterios:

**(a) QA converge en ≤ 2 iteraciones:** El qa_report final debe tener recommendation='accept' O haberse consumido exactamente 2 iteraciones (iter0+iter1) sin exhaustion. `iterations_used <= 2` en el summary.

**(b) Todos los nodos tienen data.role declarado:** Para CADA nodo en flow_data.nodes, `node.data.role ∈ {extractor, transformer, synthesizer, renderer, emitter, guard, reporter}`. NO puede haber `undefined`, `null`, o string fuera de la taxonomía. Un solo nodo sin role → routing matrix fila 5 → Phase 135 ARCH-PROMPT-02/08.

**(c) Renderer produce contrato declarativo:** Localizar el nodo con `data.role === 'renderer'`. Sus instructions (o data.output/data.contract) deben declarar campos literales `accion_final: 'send_report'`, `report_to`, `report_subject`, `results[]`. Si falta cualquiera → routing matrix fila 2 → Phase 134 (data layer). Si los contracts están en resources.connectors pero el renderer no los usa → escalar a 135.

**(d) Cero R10 falsos positivos en emitter Gmail:** Buscar en TODAS las iteraciones de qa_report (qa_iter0, qa_iter1) issues con `rule_id === 'R10'` Y `node_role === 'emitter'` (o scope excluding transformer/synthesizer). Count debe ser 0. Si > 0 → routing matrix fila 1 → Phase 135 ARCH-PROMPT-11/12/13.

**Verificación adicional — data contract shape del renderer:** El flow_data.nodes[N_renderer].data debe tener campos machine-readable no solo prosa. Si el renderer solo tiene `instructions: "send a report with the data..."` sin campos estructurados → fallo de data contract → routing 134.

**CatBot oracle (per CLAUDE.md):** Tras el run, formular prompt para CatBot vía web: "Lista el último intent_job con goal holded-q1 y muestra el flow_data nodes con sus data.role y si hay issues R10 en qa_iter0/qa_iter1". La respuesta (pass o fail) se pega en 136-VERIFICATION.md como evidencia.

Si CUALQUIER sub-criterio falla, documentar el síntoma y la acción de routing en 136-VERIFICATION.md, abortar validation del resto de casos si el fallo es de runtime infra (task 1 regresión), continuar con inbox-digest/drive-sync si el fallo es de prompt/data layer específico de este caso.
  </action>
  <verify>
    <automated>test -s .planning/phases/136-end-to-end-validation-validation-gate/runs/holded-q1.json && grep -q "flow_data" .planning/phases/136-end-to-end-validation-validation-gate/runs/holded-q1.json && grep -q "qa_report" .planning/phases/136-end-to-end-validation-validation-gate/runs/holded-q1.json</automated>
  </verify>
  <done>
holded-q1.json capturado, los 4 sub-criterios de VALIDATION-01 evaluados explícitamente (pass o fail con routing), CatBot oracle consultado, evidencia pegada en 136-VERIFICATION.md.
  </done>
</task>

<task type="auto">
  <name>Task 3: Ejecutar inbox-digest contra LiteLLM real y verificar iterator</name>
  <files>
    .planning/phases/136-end-to-end-validation-validation-gate/runs/inbox-digest.json
  </files>
  <action>
```bash
cd ~/docflow && node app/scripts/test-pipeline.mjs --case inbox-digest 2>&1 | tee .planning/phases/136-end-to-end-validation-validation-gate/runs/inbox-digest.json
```

Validar VALIDATION-02:

**(a) Canvas contiene nodo iterator correctamente estructurado:** Buscar en flow_data.nodes uno con `type === 'iterator'`. Debe tener:
- `data.iterator_over` o equivalente (source del array)
- Un body node target (los edges del iterator apuntan a nodos internos del loop)
- Un exit edge al nodo siguiente post-iterator
- data.role declarado (típicamente transformer o synthesizer)

Si no hay nodo iterator y el goal claramente lo requiere (digest de N emails) → routing matrix fila 3 → Phase 135 ARCH-PROMPT-03/05/09 (checklist heartbeat + iterator pattern section 6 no guió).

**(b) R10 aplica DENTRO del iterator body pero NUNCA al emitter final:** Revisar qa_iter0 + qa_iter1. Para cada issue con rule_id='R10':
- Si `node_id` apunta al nodo body del iterator (role transformer/synthesizer) → ACEPTABLE (verdadero positivo de R10 que guía preservación de campos).
- Si `node_id` apunta al emitter final (role emitter) → FALSO POSITIVO → routing matrix fila 1 → Phase 135.

**(c) QA acepta sin exhaustion:** `recommendation === 'accept'` al final del loop Y `iterations_used < MAX_QA_ITERATIONS (2)` O exactamente 2 con accept final. Exhaustion = fallo de VALIDATION-02.

Post-mortem si falla: SELECT architect_iter0, qa_iter0, architect_iter1, qa_iter1 FROM intent_jobs WHERE id=<synthetic_id> — esta consulta ES evidencia de VALIDATION-05, anotarla.

CatBot oracle: "Consulta el último intent_job con case=inbox-digest y muéstrame la estructura del nodo iterator y los issues R10 de qa_iter0/qa_iter1 con su node_id y node_role".
  </action>
  <verify>
    <automated>test -s .planning/phases/136-end-to-end-validation-validation-gate/runs/inbox-digest.json && grep -q "flow_data" .planning/phases/136-end-to-end-validation-validation-gate/runs/inbox-digest.json</automated>
  </verify>
  <done>
inbox-digest.json capturado, presencia y estructura del nodo iterator verificada, R10 scope (body sí, emitter no) validado, exhaustion ausente. Fallos enrutados por matriz.
  </done>
</task>

<task type="auto">
  <name>Task 4: Ejecutar drive-sync contra LiteLLM real y verificar R10 verdadero positivo</name>
  <files>
    .planning/phases/136-end-to-end-validation-validation-gate/runs/drive-sync.json
  </files>
  <action>
```bash
cd ~/docflow && node app/scripts/test-pipeline.mjs --case drive-sync 2>&1 | tee .planning/phases/136-end-to-end-validation-validation-gate/runs/drive-sync.json
```

Validar VALIDATION-03:

**(a) R10 como verdadero positivo en transformer:** Buscar un nodo con `data.role === 'transformer'`. Si el architect generó instructions que descartan campos del predecessor (p.ej. "extrae solo los nombres de archivo"), el reviewer QA DEBE emitir issue R10 blocker contra ese nodo en qa_iter0. El architect debe corregir en iter1 preservando campos. Este es el CASO ESPERADO de R10 funcionando.

Si R10 NO se emite contra el transformer cuando claramente descarta campos → falso negativo → el reviewer no ejecuta R10 correctamente → routing matrix fila 1 inversa → Phase 135 (reviewer no aplica R10 donde SÍ aplica).

Si no hay nodo transformer en drive-sync → revisar el goal original del fixture; si el caso lo requiere → Phase 135 ARCH-PROMPT-03.

**(b) Nodo storage con role='emitter':** Buscar nodo con `type === 'storage'` o equivalente (google_drive write). Su `data.role` debe ser `'emitter'`. Si no (p.ej. role='transformer' o sin role) → routing matrix fila 5 → Phase 135 ARCH-PROMPT-02/08.

**(c) Ninguna regla R10 se emite contra el nodo storage/emitter:** Mismo check de falso positivo que tasks 2 y 3.

**(d) QA converge:** No exhaustion.

CatBot oracle: "Muéstrame del último intent_job case=drive-sync el transformer y su iter0→iter1 diff, y el role del nodo storage".

Nota importante: drive-sync es el caso donde R10 DEBE dispararse como true positive. Si tasks 2 y 3 pasaron "cero R10" y task 4 también da "cero R10" → sospechar que el reviewer nunca aplica R10 → Phase 135 regresión.
  </action>
  <verify>
    <automated>test -s .planning/phases/136-end-to-end-validation-validation-gate/runs/drive-sync.json && grep -q "flow_data" .planning/phases/136-end-to-end-validation-validation-gate/runs/drive-sync.json</automated>
  </verify>
  <done>
drive-sync.json capturado, R10 verdadero positivo en transformer verificado, storage con role='emitter' verificado, evidencia CatBot pegada.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 5: VALIDATION-04 inspección manual de instrucciones agent</name>
  <files>
    .planning/phases/136-end-to-end-validation-validation-gate/runs/inspection-notes.md
  </files>
  <action>
3 capturas de canvas reales contra LiteLLM existen ya (runs/holded-q1.json, runs/inbox-digest.json, runs/drive-sync.json). Esta task es inspección humana de la CALIDAD de las instructions de los nodos agent — no hay automatizable completo para "legibilidad", "contrato explícito", "tools mencionadas por nombre"; algunos sub-checks SÍ son automatizables (len ≥ 200 chars, grep por tool names esperados) y se ejecutan como pre-filtro antes del judgement humano.

Instrucciones de verificación:
Para cada uno de los 3 runs, el humano (o Claude con cat manual del archivo) debe:

1. **Extraer los nodos con type='agent' o type='multiagent'** del flow_data.nodes
2. **Para cada agent node, leer node.data.instructions** y verificar VALIDATION-04 cuatro sub-checks:

   (i) **Estructura ROL/PROCESO/OUTPUT:** Las instructions deben tener las 3 secciones literales o equivalentes (`# ROL`, `# PROCESO`, `# OUTPUT` o headers similares). Una instruction en prosa corrida SIN estructura → fallo.

   (ii) **Menciona tools por nombre:** Las instructions deben listar tools por su nombre exacto (`send_report`, `mark_read`, `holded_get_invoices`, etc.) — NO descripciones vagas como "usa la herramienta de Gmail". Esto prueba que Phase 134 ARCH-DATA-01 (tools_available) llegó al prompt y se consumió.

   (iii) **Contratos de campos explícitos:** Las instructions deben declarar qué campos produce/consume (`Output: {accion_final, report_to, results[]}` o lista explícita). NO "envía un email con los resultados".

   (iv) **Longitud ≥ 200 chars:** Instructions < 200 chars son descripciones libres insuficientes. `len(node.data.instructions) >= 200` para CADA agent node. Este es un criterio literal de VALIDATION-04.

3. **Registrar resultados** en runs/inspection-notes.md con tabla por caso:

```markdown
## holded-q1
| node_id | role | has_ROL_PROCESO_OUTPUT | mentions_tools_by_name | declares_contract | len(instr) | pass |
|---|---|---|---|---|---|---|
| n2 | extractor | yes | yes (holded_get_invoices) | yes | 412 | ✓ |
| n3 | synthesizer | yes | yes (consolidate) | yes | 387 | ✓ |
| ... |
```

4. **Consultar CatBot** como oráculo secundario: "Lista las instructions de los agents del último canvas holded-q1 y dime si cada uno tiene estructura ROL/PROCESO/OUTPUT y menciona tools por nombre".

5. **Fallo routing:** Si CUALQUIER agent node falla sub-check (i), (ii), (iii), o (iv) → causa raíz es ARCHITECT_PROMPT Sección 4 (plantillas por rol) insuficiente → routing matrix no lo cubre directamente pero por regla general "prompt no guía" → **regresar a Phase 135** (ARCH-PROMPT-04 plantillas por rol).

**Resume signal (human):** "approved" si los 3 casos pasan VALIDATION-04, o descripción de qué agent nodes fallaron y el sub-check violado. El executor pausa aquí hasta el resume signal.
  </action>
  <verify>
    <automated>test -s .planning/phases/136-end-to-end-validation-validation-gate/runs/inspection-notes.md && grep -q "VALIDATION-04" .planning/phases/136-end-to-end-validation-validation-gate/runs/inspection-notes.md && grep -q "holded-q1" .planning/phases/136-end-to-end-validation-validation-gate/runs/inspection-notes.md</automated>
  </verify>
  <done>
inspection-notes.md creado con tabla por caso (holded-q1, inbox-digest, drive-sync) cubriendo los 4 sub-checks de VALIDATION-04 por cada agent node. Humano firmó "approved" o se documentó el fallo con routing a Phase 135 ARCH-PROMPT-04. CatBot oracle response pegada.
  </done>
</task>

<task type="auto">
  <name>Task 6: VALIDATION-05 post-mortem dry-run sobre intermedios persistidos</name>
  <files>
    .planning/phases/136-end-to-end-validation-validation-gate/runs/post-mortem-dry-run.md
  </files>
  <action>
Validar VALIDATION-05: los outputs intermedios persistidos (FOUND-06) permiten reconstruir cada iteración del architect+QA sin re-ejecutar.

Paso 1: Identificar los synthetic job_ids de las 3 runs (buscar en el stdout capturado de tasks 2/3/4 o en los logs del executor):
```bash
docker exec docflow-app sh -c "sqlite3 /app/data/catbot.db \"SELECT id, goal, status, pipeline_phase FROM intent_jobs ORDER BY created_at DESC LIMIT 5\""
```

Paso 2: Para cada job_id, extraer las 6 stage columns:
```bash
for JOB_ID in <holded-q1-id> <inbox-digest-id> <drive-sync-id>; do
  docker exec docflow-app sh -c "sqlite3 /app/data/catbot.db \"SELECT 'strategist='||substr(strategist_output,1,200), 'decomposer='||substr(decomposer_output,1,200), 'arch0='||substr(architect_iter0,1,500), 'qa0='||substr(qa_iter0,1,500), 'arch1='||substr(architect_iter1,1,500), 'qa1='||substr(qa_iter1,1,500) FROM intent_jobs WHERE id='$JOB_ID'\""
done
```

Paso 3: Validar los 6 invariantes de VALIDATION-05:
1. `strategist_output` NOT NULL → FOUND-06 strategist stage persistida
2. `decomposer_output` NOT NULL → FOUND-06 decomposer stage persistida
3. `architect_iter0` NOT NULL y parseable como JSON con campo `flow_data`
4. `qa_iter0` NOT NULL y parseable como JSON con campo `recommendation`
5. Si el loop iteró: `architect_iter1` y `qa_iter1` NOT NULL; si aceptó en iter0: NULL es aceptable
6. Del contenido de qa_iter0/qa_iter1 se puede extraer el diff iter0→iter1 del architect (reconstrucción sin re-ejecutar)

Paso 4: Simular un escenario de fallo retroactivo — sin re-ejecutar test-pipeline.mjs, escribir en post-mortem-dry-run.md lo que habría generado el architect en iter0 de holded-q1 (citar el JSON real extraído). Esto es la prueba empírica de que VALIDATION-05 funciona.

Paso 5: Si algún job tiene stage columns NULL donde no debería → FOUND-06 regresión → routing matrix no lo cubre directamente pero es regresión de Phase 133 → **regresar a Phase 133** plan 04 (intermediate-outputs-persistence).

Caso especial Phase 135 plan 03: si un canvas fue rechazado por validateCanvasDeterministic (no llegó al QA LLM), el plan 03 persiste una QaReport sintética con recommendation='reject' + blockers=validation.issues en qa_iter{0,1}. Verificar que este caso se ve correctamente en el dry-run — es una invariante de diseño de Phase 135 plan 03 (decisión documentada en STATE.md).
  </action>
  <verify>
    <automated>test -s .planning/phases/136-end-to-end-validation-validation-gate/runs/post-mortem-dry-run.md && grep -q "architect_iter0" .planning/phases/136-end-to-end-validation-validation-gate/runs/post-mortem-dry-run.md</automated>
  </verify>
  <done>
post-mortem-dry-run.md existe con evidencia de los 6 invariantes de FOUND-06 verificados para los 3 jobs, capaz de reconstruir iteraciones sin re-ejecutar.
  </done>
</task>

<task type="auto">
  <name>Task 7: Consolidar 136-VERIFICATION.md con status por VALIDATION-XX y routing decisions</name>
  <files>
    .planning/phases/136-end-to-end-validation-validation-gate/136-VERIFICATION.md
    .planning/deferred-items.md
  </files>
  <action>
Escribir el documento final de verificación del gate con esta estructura:

```markdown
# Phase 136 — End-to-End Validation (VALIDATION) — Verification Report

**Date:** <YYYY-MM-DD>
**Docker build:** <commit hash>
**LiteLLM proxy:** <alias/model used>
**Wall clock per case:** holded-q1 <N>s / inbox-digest <N>s / drive-sync <N>s

## Gate Status

| Requirement | Case | Status | Evidence | Routing (if fail) |
|---|---|---|---|---|
| VALIDATION-01 | holded-q1 | PASS/FAIL | runs/holded-q1.json lines X-Y | (only if fail) |
| VALIDATION-02 | inbox-digest | PASS/FAIL | runs/inbox-digest.json | |
| VALIDATION-03 | drive-sync | PASS/FAIL | runs/drive-sync.json | |
| VALIDATION-04 | all 3 | PASS/FAIL | runs/inspection-notes.md | |
| VALIDATION-05 | post-mortem | PASS/FAIL | runs/post-mortem-dry-run.md | |

## VALIDATION-01 Detail (holded-q1)
- (a) QA iterations used: N/2 → PASS/FAIL
- (b) Nodes with data.role: N/N → PASS/FAIL (list any missing)
- (c) Renderer contract fields: {accion_final, report_to, report_subject, results[]} → PASS/FAIL
- (d) R10 false positives on Gmail emitter: 0 → PASS/FAIL
- CatBot oracle response: <paste>

## VALIDATION-02 Detail (inbox-digest)
[same structure]

## VALIDATION-03 Detail (drive-sync)
[same structure]

## VALIDATION-04 Detail (manual inspection)
[link to inspection-notes.md + summary table]

## VALIDATION-05 Detail (post-mortem)
[link to post-mortem-dry-run.md + 6 invariantes check]

## Routing Decisions (fallos, si hay)

| Symptom observed | Case | Root cause | Matrix row | Action taken |
|---|---|---|---|---|
| ... | ... | ... | ... | Regresar a Phase 13X plan NN |

## Deferred Items (canvas-executor runtime failures)

Si algún caso pasó QA pero falló en runtime canvas-executor, documentar en `.planning/deferred-items.md` con:
- Caso afectado
- Síntoma exacto
- Sección del canvas-executor implicada (línea aprox)
- Justificación "out-of-scope v27.0" (canvas-executor es intocable por decisión del milestone)
- Marcar el VALIDATION-XX como "passed QA, defer runtime" (único fallback permitido)

## Gate Decision

- [x] / [ ] Phase 136 gate APPROVED → proceder a Phase 137
- [ ] / [x] Phase 136 gate BLOCKED → regresar a Phase <N> según routing

## Signatures
- Human UAT (por CLAUDE.md CatBot oracle protocol): <paste CatBot responses per case>
```

Si gate APPROVED → Phase 136 cierra, proceder a Phase 137.
Si gate BLOCKED → no marcar VALIDATION-XX como Complete en REQUIREMENTS.md. Regresar a la fase indicada. El plan termina aquí y el executor documenta qué regresión hacer.

Actualizar `.planning/deferred-items.md` solo si existe fallback "passed QA, defer runtime". Si no, no crear/tocar el archivo.

NO actualizar STATE.md ni ROADMAP.md en esta task — eso lo hace execute-phase en el wrap-up.
  </action>
  <verify>
    <automated>test -s .planning/phases/136-end-to-end-validation-validation-gate/136-VERIFICATION.md && grep -q "VALIDATION-01" .planning/phases/136-end-to-end-validation-validation-gate/136-VERIFICATION.md && grep -q "VALIDATION-05" .planning/phases/136-end-to-end-validation-validation-gate/136-VERIFICATION.md</automated>
  </verify>
  <done>
136-VERIFICATION.md existe con status por cada VALIDATION-XX, CatBot oracle evidence, routing decisions si hay fallos, gate decision final (APPROVED o BLOCKED con fase destino).
  </done>
</task>

</tasks>

<verification>
Overall phase 136 checks (tied verbatim to VALIDATION-01..05):

1. **VALIDATION-01 (holded-q1):** 4/4 sub-criterios PASS: (a) QA ≤ 2 iter, (b) todos nodos con data.role, (c) renderer con {accion_final, report_to, report_subject, results[]}, (d) 0 R10 false positives en emitter Gmail.

2. **VALIDATION-02 (inbox-digest):** Nodo iterator estructurado + R10 solo en body nunca en emitter final + QA acepta sin exhaustion.

3. **VALIDATION-03 (drive-sync):** R10 true positive en transformer (preserva campos) + storage con role='emitter'.

4. **VALIDATION-04 (manual):** Los nodos agent de los 3 canvases tienen instructions con ROL/PROCESO/OUTPUT + tools por nombre + contratos explícitos + len ≥ 200 chars.

5. **VALIDATION-05 (post-mortem):** 6 stage columns de intent_jobs pobladas para los 3 jobs; reconstrucción de iteraciones sin re-ejecución verificada en post-mortem-dry-run.md.

**Gate:** si los 5 pasan → gate APPROVED → Phase 137 unblocked.
**Gate:** si alguno falla → gate BLOCKED → routing matrix determina fase destino → plan 136 NO se marca complete.
**Excepción única:** "passed QA, defer runtime" permitido solo cuando canvas-executor falla en runtime real (documentado en deferred-items.md).
</verification>

<success_criteria>
- [ ] Docker container corriendo la build con Phase 135 wiring vivo (validateCanvasDeterministic + CANVAS_QA_PROMPT v135)
- [ ] runs/holded-q1.json, runs/inbox-digest.json, runs/drive-sync.json capturados con flow_data + qa_report + outputs intermedios
- [ ] runs/inspection-notes.md con tabla de VALIDATION-04 para los 3 casos
- [ ] runs/post-mortem-dry-run.md probando VALIDATION-05
- [ ] 136-VERIFICATION.md con status PASS/FAIL por cada VALIDATION-XX + CatBot oracle evidence + routing decisions
- [ ] Gate decision explícita (APPROVED o BLOCKED → fase destino)
- [ ] Si APPROVED: los 5 VALIDATION-XX marcados Complete en REQUIREMENTS.md (lo hace execute-phase en wrap-up)
- [ ] Si BLOCKED: ningún VALIDATION-XX marcado Complete, fase destino documentada
- [ ] Cualquier "passed QA, defer runtime" logged en `.planning/deferred-items.md` con justificación out-of-scope
</success_criteria>

<output>
After completion, create `.planning/phases/136-end-to-end-validation-validation-gate/136-01-e2e-validation-gate-SUMMARY.md` con el gate decision, capturas de evidencia, y (si BLOCKED) la fase destino del routing.
</output>
