---
phase: 137-learning-loops-memory-learn
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - app/src/lib/services/intent-job-executor.ts
  - app/src/lib/services/canvas-executor.ts
  - app/src/lib/catbot-db.ts
  - app/src/app/api/catbot/chat/route.ts
  - app/src/lib/__tests__/intent-job-executor.test.ts
  - app/src/lib/__tests__/canvas-executor-condition.test.ts
  - app/data/knowledge/canvas.json
  - app/data/knowledge/catflow.json
autonomous: true
requirements: [LEARN-05, LEARN-06, LEARN-08]
must_haves:
  truths:
    - "El START node del canvas generado recibe goal del strategist como initialInput, NO el original_request"
    - "El condition node acepta 'sí', 'si', 'afirmativo' además de 'yes' (case-insensitive)"
    - "El condition node acepta 'no', 'negativo', 'incorrecto', 'false' (case-insensitive)"
    - "intent_jobs.complexity_decision_id linkea cada job con su complexity_decisions row"
    - "complexity_decisions.outcome se actualiza a 'completed' al terminar pipeline con éxito"
    - "complexity_decisions.outcome se actualiza a 'failed' (o 'cancelled') al terminar con exhaustion"
    - "complexity_decisions.outcome se actualiza a 'timeout' cuando el reaper mata el job"
    - "CatBot puede responder '¿qué % de peticiones complex completan con éxito?' vía get_complexity_outcome_stats (oracle tool en plan 137-03)"
  artifacts:
    - path: "app/src/lib/services/intent-job-executor.ts"
      provides: "goal propagation al START node + outcome loop closure vía intent_jobs.complexity_decision_id"
    - path: "app/src/lib/services/canvas-executor.ts"
      provides: "condition parser multilingüe (LEARN-06 sanctioned deviation)"
    - path: "app/src/lib/catbot-db.ts"
      provides: "intent_jobs.complexity_decision_id column (idempotent migration) + createIntentJob acepta el parámetro"
  key_links:
    - from: "runArchitectQALoop design.flow_data"
      to: "start node data.initialInput"
      via: "mutate flow_data.nodes[start].data.initialInput = goal"
      pattern: "initialInput.*goal"
    - from: "canvas-executor.ts case 'condition'"
      to: "YES_VALUES/NO_VALUES arrays"
      via: "case-insensitive includes check"
      pattern: "YES_VALUES.*includes.*toLowerCase"
    - from: "markTerminal / reaper / exhaustion"
      to: "complexity_decisions.outcome"
      via: "intent_jobs.complexity_decision_id → updateComplexityOutcome(id, outcome)"
      pattern: "updateComplexityOutcome"
    - from: "catbot/chat/route.ts saveComplexityDecision result"
      to: "createIntentJob({..., complexityDecisionId})"
      via: "pass decisionId through job creation"
      pattern: "complexity_decision_id"
---

<objective>
Runtime wiring requirements LEARN-05, LEARN-06 y LEARN-08. Estas tres features son independientes entre sí pero comparten el archivo `intent-job-executor.ts` (goal propagation + outcome loop) + una pequeña intervención en `canvas-executor.ts` (condition parser) + una migración idempotente en `catbot-db.ts` (linkaje intent_jobs ↔ complexity_decisions).

**LEARN-05** — El architect produce `flow_data` cuyo START node tiene `initialInput` vacío o con el texto original del usuario. El strategist ya refinó el texto a un `goal` accionable; debe propagarse como `initialInput` del START para que el primer nodo del canvas trabaje con contexto de propósito.

**LEARN-06** — `canvas-executor.ts` case `condition` hoy acepta solo `'yes'`/`'no'` (startsWith). El LLM responde en español "Sí"/"No" y falla silenciosamente. Añadir listas multilingües case-insensitive. **Esta es una desviación sancionada a la regla "no tocar canvas-executor.ts"** — LEARN-06 está explícitamente en scope del milestone.

**LEARN-08** — `complexity_decisions` tiene campo `outcome` que hoy nunca se cierra tras el pipeline. **IMPORTANTE (descubrimiento de la revisión):** `intent_jobs` NO tiene columna `complexity_decision_id` — la linkage hoy solo vive en el `context.complexityDecisionId` que `catbot/chat/route.ts` pasa al crear el job (L3296) pero NO se persiste en DB. Para cerrar el loop hay que:
  1. Añadir columna `complexity_decision_id TEXT` a `intent_jobs` vía migración idempotente (el bloque `idempotent schema migrations` ya existe en catbot-db.ts L173+).
  2. Persistir el id en `createIntentJob` (nuevo parámetro opcional).
  3. En `catbot/chat/route.ts`, pasar `decisionId` también al `createIntentJob` (además del ya-existente `context.complexityDecisionId`).
  4. En terminal paths de intent-job-executor (markTerminal success, exhaustion, reaper timeout) leer `job.complexity_decision_id` y llamar al helper `updateComplexityOutcome(id, outcome)` YA existente en `catbot-db.ts` (L997).

**CRÍTICO — reuse, don't reimplement:** el helper `updateComplexityOutcome(id, outcome, asyncPathTaken?)` ya existe en catbot-db.ts con firma `(id, outcome)`. NO crear un nuevo helper privado en intent-job-executor. Solo importar y llamar. Los valores válidos de `outcome` son `'completed' | 'queued' | 'timeout' | 'cancelled'` (ver type `ComplexityDecisionRow`). Usar `'cancelled'` para el exhaustion path (no `'failed'` — no existe en el type). Si se necesita `'failed'` como categoría nueva, añadirla al type union.

Purpose: LEARN-05 y LEARN-06 son precondiciones silenciosas de la señal única. LEARN-08 es observabilidad del loop + precondición de la tool oracle `get_complexity_outcome_stats` (añadida en plan 137-03) que permite a CatBot auto-verificar la feature per CLAUDE.md oracle protocol.
Output: 3 features cableadas con tests de regresión + knowledge tree actualizado.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/REQUIREMENTS.md
@.planning/MILESTONE-CONTEXT.md
@app/src/lib/services/intent-job-executor.ts
@app/src/lib/services/canvas-executor.ts
@app/src/lib/catbot-db.ts
@app/src/app/api/catbot/chat/route.ts
@app/data/knowledge/canvas.json
@app/data/knowledge/catflow.json

<interfaces>
From app/src/lib/services/canvas-executor.ts (current condition handler):

```typescript
// L1392-1400
case 'condition': {
  const conditionText = (data.condition as string) || 'La entrada es válida';
  const systemPrompt = `Eres un evaluador de condiciones. Responde SOLO con 'yes' o 'no'.`;
  const userContent = `Condición: ${conditionText}\n\nContenido a evaluar:\n${predecessorOutput}`;
  const result = await callLLM({ systemPrompt, userContent });
  const answer = result.output.trim().toLowerCase().startsWith('yes') ? 'yes' : 'no';
  // ...
}
```

Current bug: "sí" normalized to "sí" → startsWith('yes') is false → always 'no' branch.

From app/src/lib/services/intent-job-executor.ts:
- `runArchitectQALoop(...)` L~560+ stores `design.flow_data` after validation and `insertSideEffectGuards`.
- `markTerminal(jobId)` L~200+ is the single terminal path.
- `sendProposal` at L1144 — NOT touched by this plan (plan 137-04 handles Telegram UX).

From catbot-db.ts:
- `complexity_decisions` schema (L156-167): `id TEXT PK, user_id, channel, message_snippet, classification, reason, estimated_duration_s, async_path_taken, outcome, created_at` — **no request_id, no intent_job_id**.
- `intent_jobs` schema (L133-150): `id TEXT PK, intent_id, user_id, channel, channel_ref, pipeline_phase, tool_name, tool_args, canvas_id, status, progress_message, result, error, created_at, updated_at, completed_at` — **no complexity_decision_id**.
- `ComplexityDecisionRow.outcome` type: `'completed' | 'queued' | 'timeout' | 'cancelled' | null`.
- `updateComplexityOutcome(id: string, outcome: ComplexityDecisionRow['outcome'], asyncPathTaken?: boolean): void` ya existe (L997-1010).
- `saveComplexityDecision(...)` devuelve el id.
- `createIntentJob(...)` crea el job — necesita acepatr `complexity_decision_id` como parámetro opcional tras la migración.

From app/src/app/api/catbot/chat/route.ts:
- L17: `import { saveComplexityDecision, updateComplexityOutcome, createIntentJob } from '@/lib/catbot-db';`
- L218/L473: `decisionId = saveComplexityDecision({...})`
- L3296: `updateComplexityOutcome(context.complexityDecisionId, 'queued', true)` (existing call).
- El `decisionId` se pasa a `runIntent(..., { complexityDecisionId: decisionId })` vía context, pero NO se persiste en `intent_jobs`. Tras este plan, el decisionId se pasa también a `createIntentJob`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: LEARN-05 goal→initialInput + LEARN-08 migration + complexity_decision_id persistence + outcome loop closure</name>
  <files>
    app/src/lib/services/intent-job-executor.ts,
    app/src/lib/catbot-db.ts,
    app/src/app/api/catbot/chat/route.ts,
    app/src/lib/__tests__/intent-job-executor.test.ts
  </files>
  <behavior>
    - Test 1 (LEARN-05): Dado un `design.flow_data` con nodo start `{id:'n0', type:'start', data:{initialInput:''}}` y un `goal: "Comparativa Q1 Holded"`, tras runArchitectQALoop accept, el flow_data persistido en `canvases.flow_data` tiene `nodes[0].data.initialInput === "Comparativa Q1 Holded"`.
    - Test 2 (LEARN-05): Si el start node NO tiene data.initialInput, se crea; si ya lo tiene con texto, se sobrescribe con el goal (el goal manda).
    - Test 3 (LEARN-05): Si el flow_data no tiene ningún nodo type='start' (edge case), el código NO lanza — registra warn y continúa (el validador de Phase 135 ya garantiza exactly-one start en happy path).
    - Test 4 (LEARN-08 migration): Tras importar catbot-db.ts, la tabla `intent_jobs` tiene columna `complexity_decision_id` (verificar vía `PRAGMA table_info(intent_jobs)`). La migración es idempotente — importar dos veces no rompe.
    - Test 5 (LEARN-08 createIntentJob): `createIntentJob({..., complexityDecisionId: 'dec-1'})` persiste el valor en la columna.
    - Test 6 (LEARN-08 terminal success): Tras `markTerminal(jobId)` con status='completed' sobre un job con `complexity_decision_id = 'dec-1'`, `SELECT outcome FROM complexity_decisions WHERE id = 'dec-1'` devuelve `{outcome: 'completed'}`.
    - Test 7 (LEARN-08 exhaustion): Exhaustion path (QA loop agota iterations) sobre un job con decision_id → outcome = 'cancelled'. (Usamos 'cancelled' porque 'failed' no está en el type union; si se desea 'failed' como categoría distinta, extender el type union ANTES en catbot-db.ts.)
    - Test 8 (LEARN-08 timeout): Reaper marca job como failed con motivo timeout → outcome = 'timeout'.
    - Test 9 (LEARN-08 no-link edge): Si job.complexity_decision_id es null (pipeline directo sin clasificación previa), el helper no lanza y no hace nada.
  </behavior>
  <action>
    PASO 1 — **Migración idempotente en catbot-db.ts.** Localizar el bloque "Idempotent schema migrations" (L173+). Añadir:
    ```typescript
    // LEARN-08: link intent_jobs → complexity_decisions to allow outcome update on terminal states.
    try {
      const cols = catbotDb.prepare("PRAGMA table_info(intent_jobs)").all() as Array<{ name: string }>;
      if (!cols.some(c => c.name === 'complexity_decision_id')) {
        catbotDb.exec("ALTER TABLE intent_jobs ADD COLUMN complexity_decision_id TEXT");
        catbotDb.exec("CREATE INDEX IF NOT EXISTS idx_intent_jobs_complexity_decision ON intent_jobs(complexity_decision_id)");
      }
    } catch (err) {
      console.warn('[catbot-db] LEARN-08 migration failed (may already exist):', err);
    }
    ```

    PASO 2 — **createIntentJob acepta complexityDecisionId.** Localizar `createIntentJob` en catbot-db.ts (grep por la función). Añadir parámetro opcional `complexityDecisionId?: string` y persistirlo en el INSERT (columna `complexity_decision_id`). Actualizar `IntentJobRow` type para incluir `complexity_decision_id: string | null`.

    PASO 3 — **catbot/chat/route.ts — pasar decisionId a createIntentJob.** En las dos llamadas a `createIntentJob(...)` (alrededor de L325 y L579 según los greps), añadir `complexityDecisionId: decisionId ?? undefined` al objeto args. Estas son las únicas ramas donde se crea un intent_job tras una decisión de complejidad — los pipelines directos (sin clasificación) pasan el campo como undefined y quedan con NULL.

    PASO 4 — **LEARN-05 — goal propagation.** En `runArchitectQALoop`, justo antes del INSERT a `canvases` (L~851), tras `insertSideEffectGuards` y antes del JSON.stringify del flow_data, mutar el start node:
    ```typescript
    // LEARN-05: propagate strategist goal as initialInput of the start node.
    // Rationale: the executor reads data.initialInput for the start node output;
    // without this, the START emits the original_request (ambiguous) instead of
    // the refined goal.
    try {
      const flowData = design.flow_data as { nodes: Array<Record<string, unknown>> };
      const startNode = flowData.nodes.find(n => (n as { type?: string }).type === 'start');
      if (startNode) {
        const nodeData = (startNode as { data?: Record<string, unknown> }).data ?? {};
        (startNode as { data: Record<string, unknown> }).data = {
          ...nodeData,
          initialInput: String(goal),
        };
      } else {
        logger.warn('intent-job-executor', 'LEARN-05: no start node found in flow_data, skipping goal propagation', {
          jobId: job.id,
        });
      }
    } catch (err) {
      logger.warn('intent-job-executor', 'LEARN-05 goal propagation error', { error: String(err) });
    }
    ```

    PASO 5 — **LEARN-08 outcome loop closure.** Importar `updateComplexityOutcome` desde `@/lib/catbot-db` al top del intent-job-executor.ts (si no está ya — verificar imports). Añadir helper privado que lee el job y llama al helper público:
    ```typescript
    private static closeComplexityOutcome(job: IntentJobRow | { complexity_decision_id: string | null | undefined }, outcome: 'completed' | 'cancelled' | 'timeout'): void {
      const decisionId = (job as { complexity_decision_id?: string | null }).complexity_decision_id;
      if (!decisionId) return;
      try {
        updateComplexityOutcome(decisionId, outcome);
      } catch (err) {
        logger.warn('intent-job-executor', 'LEARN-08 closeComplexityOutcome failed', {
          decisionId, outcome, error: String(err),
        });
      }
    }
    ```

    PASO 6 — Cablear `closeComplexityOutcome` en 3 puntos del archivo:
    1. **Terminal success path** — donde `markTerminal(job, 'completed')` se llama (o equivalente) tras pipeline OK → `IntentJobExecutor.closeComplexityOutcome(job, 'completed')`.
    2. **Exhaustion path** en `runArchitectQALoop` (donde ya se llama `logKnowledgeGap` + `markTerminal`) → `IntentJobExecutor.closeComplexityOutcome(job, 'cancelled')`.
    3. **Reaper loop** (L~200+, busca código que marca job como failed por `updated_at > 10min`) → ese loop ya tiene el `job.id` pero puede no tener el row completo; leer con `getIntentJob(id)` primero y pasar el row → `closeComplexityOutcome(row, 'timeout')`.

    PASO 7 — Tests TDD en `intent-job-executor.test.ts`. Usar el mismo pattern de mocks de `buildActiveSets` que ya hay. Para LEARN-08 mockear `catbotDb.prepare` y/o `updateComplexityOutcome` para capturar el call con los params correctos. Para LEARN-05 llamar runArchitectQALoop con un design mockeado y assertar la mutation del start node. Para la migración, spy sobre `catbotDb.exec` y verificar que la sentencia ALTER TABLE no se ejecuta si la columna ya existe.

    PASO 8 — Verificar que ningún test pre-existente se rompe. Los design fixtures ya tienen start node (plan 135-03 los actualizó) → LEARN-05 es aditivo. Los test fixtures que crean intent_jobs sin complexityDecisionId siguen pasando (param opcional, NULL persistido).
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm test -- intent-job-executor</automated>
  </verify>
  <done>
    - Migración idempotente intent_jobs.complexity_decision_id aplicada
    - createIntentJob persiste el complexity_decision_id
    - catbot/chat/route.ts pasa decisionId en ambos call sites
    - LEARN-05: goal propagado a initialInput del start node
    - LEARN-08: outcome cerrado en 3 terminal paths usando helper existente updateComplexityOutcome
    - Suite intent-job-executor verde (147 tests baseline + ~9 nuevos)
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: LEARN-06 condition parser multilingüe en canvas-executor.ts + knowledge tree updates (canvas.json + catflow.json)</name>
  <files>
    app/src/lib/services/canvas-executor.ts,
    app/src/lib/__tests__/canvas-executor-condition.test.ts,
    app/data/knowledge/canvas.json,
    app/data/knowledge/catflow.json
  </files>
  <behavior>
    - Test 1: LLM responde "yes" → branch 'yes'
    - Test 2: LLM responde "sí" → branch 'yes'
    - Test 3: LLM responde "Si" (mayúscula, sin tilde) → branch 'yes'
    - Test 4: LLM responde "afirmativo" → branch 'yes'
    - Test 5: LLM responde "correcto" → branch 'yes'
    - Test 6: LLM responde "true" → branch 'yes'
    - Test 7: LLM responde "1" → branch 'yes'
    - Test 8: LLM responde "no" → branch 'no'
    - Test 9: LLM responde "NO." → branch 'no'
    - Test 10: LLM responde "negativo" → branch 'no'
    - Test 11: LLM responde "incorrecto" → branch 'no'
    - Test 12: LLM responde "maybe" (ambiguo fuera de listas) → branch 'no' (default conservador, mismo comportamiento actual).
    - Test 13: LLM responde "sí, con reservas" → branch 'yes' (matcheo por primer token después de limpiar puntuación).
    - Test 14 (knowledge tree): `grep -q "start node.*initialInput.*goal" app/data/knowledge/canvas.json` o equivalente (el convenio LEARN-05 está documentado).
    - Test 15 (knowledge tree): `grep -q "afirmativo\\|negativo" app/data/knowledge/canvas.json` (las variantes multilingües del condition están documentadas).
    - Test 16 (knowledge tree): `grep -q "complexity_decisions.outcome" app/data/knowledge/catflow.json` (el campo outcome está documentado en el schema de concepts).
  </behavior>
  <action>
    PASO 1 — En `canvas-executor.ts` alrededor de L1392-1400 (case 'condition'), reemplazar el parseo del answer por:
    ```typescript
    const YES_VALUES = new Set(['yes', 'sí', 'si', 'true', '1', 'afirmativo', 'correcto']);
    const NO_VALUES  = new Set(['no', 'false', '0', 'negativo', 'incorrecto']);

    // LEARN-06: sanctioned exception to 'do not touch canvas-executor.ts' rule per milestone v27.0 requirements.
    function normalizeConditionAnswer(raw: string): 'yes' | 'no' {
      const cleaned = raw.trim().toLowerCase().replace(/[.,;:!?"']+$/g, '');
      // Try full match first
      if (YES_VALUES.has(cleaned)) return 'yes';
      if (NO_VALUES.has(cleaned)) return 'no';
      // Try first token
      const firstToken = cleaned.split(/[\s,.;:!?]+/)[0];
      if (YES_VALUES.has(firstToken)) return 'yes';
      if (NO_VALUES.has(firstToken)) return 'no';
      // Fallback conservador
      return 'no';
    }
    ```
    Definir `normalizeConditionAnswer` como función módulo-privada al principio del archivo (o justo antes del switch case). Declarar los sets YES_VALUES/NO_VALUES también a nivel de módulo.

    PASO 2 — Reemplazar la línea `const answer = result.output.trim().toLowerCase().startsWith('yes') ? 'yes' : 'no';` por `const answer = normalizeConditionAnswer(result.output);`.

    PASO 3 — Exportar `normalizeConditionAnswer`, `YES_VALUES`, `NO_VALUES` como named exports (para tests) SIN cambiar el default export del executor.

    PASO 4 — Crear `canvas-executor-condition.test.ts` que importa solo `normalizeConditionAnswer` (no el executor entero para no necesitar DB/db mocks). Tests 1-13 de `<behavior>`.

    PASO 5 — **CRÍTICO**: Verificar que ningún otro sitio del executor hace `startsWith('yes')` o similar. Grep por `'yes'` en canvas-executor.ts y confirmar que la única comparación está en el case 'condition'.

    PASO 6 — Anotar como tombstone-free (no dejar comentarios "// antes era startsWith"). Borrar limpiamente.

    PASO 7 — **Knowledge tree updates — canvas.json:**
    - Añadir al array `concepts`: `"Condition node: acepta respuestas multilingües — YES: yes|sí|si|true|1|afirmativo|correcto; NO: no|false|0|negativo|incorrecto (case-insensitive, con cleanup de puntuación). Default conservador: 'no' si el LLM responde algo fuera de esas listas. Ver LEARN-06 milestone v27.0."`
    - Añadir al array `concepts`: `"START node: recibe goal del strategist como initialInput al arrancar pipelines async. Convención LEARN-05: runArchitectQALoop muta flow_data.nodes[start].data.initialInput = goal antes de persistir el canvas."`
    - Actualizar `sources` con `.planning/phases/137-learning-loops-memory-learn/137-02-runtime-wiring-PLAN.md`
    - Actualizar `updated_at` a fecha actual

    PASO 8 — **Knowledge tree updates — catflow.json:**
    - Añadir al array `concepts` (o crear si no existe) el schema enriquecido de `complexity_decisions`: `"complexity_decisions.outcome: campo que se cierra en los terminal paths del pipeline async (values: completed | cancelled | timeout | queued | null). Cerrado por intent-job-executor en markTerminal (completed), runArchitectQALoop exhaustion (cancelled) y reaper (timeout). Link: intent_jobs.complexity_decision_id → complexity_decisions.id."`
    - Añadir al array `concepts`: `"intent_jobs.complexity_decision_id: FK opcional a complexity_decisions (añadido en migración LEARN-08). Permite al pipeline async cerrar el outcome loop sin romper jobs directos que no pasan por clasificación."`
    - Añadir al array `concepts`: `"START node convention LEARN-05: initialInput = strategist.goal (no original_request)."`
    - Añadir al array `concepts`: `"Condition node multilingual variants: yes/sí/si/afirmativo/correcto/true/1 → YES; no/negativo/incorrecto/false/0 → NO."`
    - Actualizar `sources` y `updated_at`

    PASO 9 — **Sanctioned deviation note:** Verificar que el comentario sobre `normalizeConditionAnswer` (del PASO 1) cita "LEARN-06: sanctioned exception to 'do not touch canvas-executor.ts' rule per milestone v27.0 requirements".
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm test -- canvas-executor-condition &amp;&amp; grep -q "afirmativo" app/data/knowledge/canvas.json &amp;&amp; grep -q "initialInput" app/data/knowledge/canvas.json &amp;&amp; grep -q "complexity_decisions" app/data/knowledge/catflow.json</automated>
  </verify>
  <done>
    - 13 tests de normalizeConditionAnswer verdes
    - Grep confirma que canvas-executor no tiene otros startsWith('yes') colgados
    - Knowledge tree documenta: LEARN-05 convention, LEARN-06 multilingual variants, LEARN-08 outcome field + intent_jobs.complexity_decision_id link
    - Build Next limpio (no unused imports, no tombstone comments)
  </done>
</task>

</tasks>

<verification>
1. `cd app && npm test -- intent-job-executor canvas-executor-condition` → verde
2. `cd app && npm test` → suite completa sin regresiones
3. Grep: `grep -n "startsWith.*yes\b" app/src/lib/services/canvas-executor.ts` → no matches (el viejo parser eliminado)
4. Knowledge tree grep: `grep -q "afirmativo" app/data/knowledge/canvas.json && grep -q "complexity_decisions" app/data/knowledge/catflow.json`
5. SQLite inspection (opcional post-deploy): `sqlite3 catbot.db "PRAGMA table_info(intent_jobs)"` debe incluir `complexity_decision_id`
</verification>

<success_criteria>
- LEARN-05 completo: goal propagado al start node
- LEARN-06 completo: condition parser acepta español e inglés
- LEARN-08 completo: migración + persistencia del decision_id + outcome cerrado en 3 paths vía helper existente updateComplexityOutcome
- CatBot oracle tool `get_complexity_outcome_stats` (plan 137-03) puede ahora devolver un histograma real no vacío
- Knowledge tree actualizado per CLAUDE.md protocol
- Cambios confinados a los 8 archivos declarados en files_modified
</success_criteria>

<output>
After completion, create `.planning/phases/137-learning-loops-memory-learn/137-02-SUMMARY.md`
</output>
</content>
</invoke>