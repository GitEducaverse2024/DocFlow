---
phase: 133-foundation-tooling-found
plan: 04
type: execute
wave: 4
depends_on:
  - 133-03
files_modified:
  - app/src/lib/db.ts
  - app/src/lib/services/intent-job-executor.ts
  - app/src/lib/intent-jobs.ts
  - app/src/lib/__tests__/intent-job-executor.test.ts
autonomous: true
requirements:
  - FOUND-06
must_haves:
  truths:
    - "La tabla intent_jobs tiene 6 columnas TEXT: strategist_output, decomposer_output, architect_iter0, qa_iter0, architect_iter1, qa_iter1"
    - "Las columnas se añaden vía ALTER TABLE IF NOT EXISTS en db.ts (idempotente al arranque)"
    - "Cada etapa del pipeline persiste su output raw (JSON stringify) en la columna correspondiente sin afectar el campo existente progressMessage"
    - "Un job completado o failed puede inspeccionarse leyendo las 6 columnas sin re-ejecutar el pipeline"
  artifacts:
    - path: "app/src/lib/db.ts"
      provides: "ALTER TABLE IF NOT EXISTS idempotente para las 6 columnas TEXT"
      contains: "strategist_output"
    - path: "app/src/lib/services/intent-job-executor.ts"
      provides: "Calls a updateIntentJob con las nuevas columnas en los puntos correctos del pipeline"
    - path: "app/src/lib/intent-jobs.ts"
      provides: "updateIntentJob acepta las nuevas columnas en el patch type"
  key_links:
    - from: "db.ts init"
      to: "ALTER TABLE intent_jobs ADD COLUMN xxx"
      via: "try/catch por columna (SQLite no soporta IF NOT EXISTS en ADD COLUMN)"
      pattern: "ALTER TABLE intent_jobs ADD COLUMN"
    - from: "runArchitectQALoop iter loop"
      to: "updateIntentJob(job.id, {architect_iter0: ..., qa_iter0: ...})"
      via: "JSON.stringify del raw output del architect y del qa_report"
      pattern: "architect_iter[01]|qa_iter[01]"
---

<objective>
La tabla `intent_jobs` persiste los 6 outputs intermedios del pipeline async (strategist, decomposer, architect iter0/1, qa iter0/1) para que `test-pipeline.mjs` (Plan 05) y las fases 134/135/136 puedan inspeccionar exactamente qué generó cada etapa sin re-ejecutar el pipeline.

Purpose: Sin esto, Phase 134 no puede auditar el payload que el architect recibe ni Phase 136 puede hacer post-mortem determinista. El campo existente `progressMessage` es un blob de UI que no contiene los outputs raw. Este plan añade 6 columnas TEXT dedicadas.
Output: Migración idempotente en `db.ts`, writes puntuales en `intent-job-executor.ts` tras cada llamada LLM exitosa, tipo actualizado en `intent-jobs.ts`.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@./CLAUDE.md
@.planning/phases/133-foundation-tooling-found/133-03-job-reaper-PLAN.md

@app/src/lib/db.ts
@app/src/lib/intent-jobs.ts
@app/src/lib/services/intent-job-executor.ts

<interfaces>
<!-- Persistence contract for downstream plans / phases -->

Columns to add to `intent_jobs` (all TEXT NULL, default NULL):
```
strategist_output   TEXT   -- raw JSON stringify del output del strategist
decomposer_output   TEXT   -- raw JSON stringify del output del decomposer
architect_iter0     TEXT   -- raw JSON del output del architect en la iteración 0 (antes de QA)
qa_iter0            TEXT   -- raw JSON del qa_report de la iteración 0
architect_iter1     TEXT   -- raw JSON del architect iter 1 (null si MAX_QA_ITERATIONS=2 y no hubo 2nd iter)
qa_iter1            TEXT   -- raw JSON del qa_report iter 1
```

SQLite note: `ALTER TABLE ... ADD COLUMN` NO soporta `IF NOT EXISTS`. Patrón idempotente estándar:
```ts
function addColumnIfMissing(table: string, column: string, type: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{name: string}>;
  if (!cols.some(c => c.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
  }
}
```

Current `IntentJobRow` and `updateIntentJob` in app/src/lib/intent-jobs.ts — extend type to include the 6 new optional string fields.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migración idempotente en db.ts + extensión del tipo IntentJobRow/updateIntentJob</name>
  <files>app/src/lib/db.ts, app/src/lib/intent-jobs.ts</files>
  <action>
1. En `db.ts`, localizar el bloque de inicialización donde corren los `CREATE TABLE IF NOT EXISTS intent_jobs (...)` y los ALTER TABLE previos (Phase 131/132 ya añadieron columnas con ese patrón — grep `ALTER TABLE intent_jobs` para encontrar el patrón existente).

2. Añadir una función helper (si no existe ya):
   ```ts
   function addColumnIfMissing(table: string, column: string, type: string): void {
     const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
     if (!cols.some((c) => c.name === column)) {
       db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
     }
   }
   ```
   Si hay un helper equivalente ya, reutilizarlo.

3. Justo después del `CREATE TABLE IF NOT EXISTS intent_jobs (...)`, añadir:
   ```ts
   addColumnIfMissing('intent_jobs', 'strategist_output', 'TEXT');
   addColumnIfMissing('intent_jobs', 'decomposer_output', 'TEXT');
   addColumnIfMissing('intent_jobs', 'architect_iter0', 'TEXT');
   addColumnIfMissing('intent_jobs', 'qa_iter0', 'TEXT');
   addColumnIfMissing('intent_jobs', 'architect_iter1', 'TEXT');
   addColumnIfMissing('intent_jobs', 'qa_iter1', 'TEXT');
   ```

4. En `app/src/lib/intent-jobs.ts`, extender la interfaz `IntentJobRow`:
   ```ts
   interface IntentJobRow {
     // ... existing fields
     strategist_output?: string | null;
     decomposer_output?: string | null;
     architect_iter0?: string | null;
     qa_iter0?: string | null;
     architect_iter1?: string | null;
     qa_iter1?: string | null;
   }
   ```
   Y actualizar `updateIntentJob(id, patch)` para que acepte estos 6 campos en el patch y los persista vía UPDATE dinámico. Si `updateIntentJob` ya construye el UPDATE dinámicamente a partir de las keys del patch (es el patrón habitual en el codebase), no hace falta tocar nada más — sólo el tipo. Verificar esto leyendo la implementación.

5. NO añadir migración de datos — las columnas nacen NULL y se poblan forward. Los jobs antiguos quedan con NULL en esas columnas (aceptable, post-mortem solo aplica a jobs nuevos).
  </action>
  <verify>
    <automated>cd app &amp;&amp; npx tsc --noEmit 2>&amp;1 | head -30</automated>
  </verify>
  <done>
- `db.ts` tiene las 6 ALTER TABLE idempotentes
- `IntentJobRow` type incluye los 6 campos opcionales
- `updateIntentJob` acepta los nuevos campos (vía dynamic UPDATE o patch explícito)
- TypeScript compila sin errores
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Persistir outputs en runArchitectQALoop + strategist + decomposer, con test unitario</name>
  <files>app/src/lib/services/intent-job-executor.ts, app/src/lib/__tests__/intent-job-executor.test.ts</files>
  <behavior>
- Tras recibir strategistRaw: `updateIntentJob(job.id, { strategist_output: strategistRaw })` (raw string, NO re-stringify)
- Tras recibir decomposerRaw: `updateIntentJob(job.id, { decomposer_output: decomposerRaw })`
- Dentro de `runArchitectQALoop`, en cada iteración iter (0 o 1):
  - Tras recibir architectRaw (y tras expansion pass si aplica — persistir el RESULTADO FINAL del architect de esa iteración): `updateIntentJob(job.id, { [`architect_iter${iter}`]: architectRaw })`
  - Tras recibir qaRaw: `updateIntentJob(job.id, { [`qa_iter${iter}`]: qaRaw })`
- Test: ejecutar un run del pipeline con mocks de callLLM que devuelven payloads conocidos; tras completar (o fail), leer la fila de intent_jobs de la DB de test y verificar que las 6 columnas contienen los strings esperados. Para el caso donde el architect accepta en iter0, `architect_iter1` y `qa_iter1` deben ser NULL.
  </behavior>
  <action>
1. En `runStrategistPhase` (o donde sea que se llama `this.callLLM(STRATEGIST_PROMPT, ...)` en ~línea 186-187):
   ```ts
   const strategistRaw = await this.callLLM(STRATEGIST_PROMPT, this.buildStrategistInput(job));
   updateIntentJob(job.id, { strategist_output: strategistRaw });
   ```

2. Mismo patrón para decomposer (~línea 197-198):
   ```ts
   const decomposerRaw = await this.callLLM(DECOMPOSER_PROMPT, ...);
   updateIntentJob(job.id, { decomposer_output: decomposerRaw });
   ```

3. Dentro del for-loop de `runArchitectQALoop` (~líneas 289-391), justo después de cada llamada LLM exitosa:
   ```ts
   // After architect call (o después de expansion pass, usando el raw final)
   const architectRaw = ...; // el string que entra al parseJSON
   updateIntentJob(job.id, { [`architect_iter${iter}`]: architectRaw });

   // After QA call
   const qaRaw = ...;
   updateIntentJob(job.id, { [`qa_iter${iter}`]: qaRaw });
   ```
   NOTA: si hay expansion pass (needs_rule_details), el `architectRaw` que se persiste debe ser el DEL expansion (el final, no el inicial). Esto evita que Phase 134 audite un architect output intermedio que fue reemplazado.

4. Usar notación de bracket: `{[`architect_iter${iter}`]: architectRaw}` — TypeScript lo acepta si el tipo del patch es `Partial<IntentJobRow>` con esas keys opcionales. Si el type-checker se queja, hacer un cast explícito:
   ```ts
   const patch: Partial<IntentJobRow> = {};
   patch[`architect_iter${iter}` as keyof IntentJobRow] = architectRaw as any;
   updateIntentJob(job.id, patch);
   ```
   Pero preferir la forma directa si compila.

5. Test en `intent-job-executor.test.ts`:
   ```ts
   it('persists all 6 intermediate outputs across pipeline stages', async () => {
     // Insert synthetic job
     const jobId = 'test-persist-1';
     db.prepare(`INSERT INTO intent_jobs (id, status, channel, tool_name, tool_args, created_at, updated_at)
                 VALUES (?, 'pending', 'web', '__description__', '{"description":"test"}', datetime('now'), datetime('now'))`)
       .run(jobId);

     // Mock callLLM to return known strings per phase
     const callSpy = vi.spyOn(IntentJobExecutor as any, 'callLLM');
     callSpy.mockResolvedValueOnce(JSON.stringify({ goal: 'G' })); // strategist
     callSpy.mockResolvedValueOnce(JSON.stringify({ tasks: [] })); // decomposer
     callSpy.mockResolvedValueOnce(JSON.stringify({ name: 'C', flow_data: {nodes:[{id:'n1',type:'agent'}], edges:[]} })); // architect iter0
     callSpy.mockResolvedValueOnce(JSON.stringify({ recommendation: 'accept', quality_score: 90, issues: [] })); // qa iter0

     // Run the pipeline for this job (use the internal method that runs a single tick)
     await (IntentJobExecutor as any).runPipelineForJob(db.prepare('SELECT * FROM intent_jobs WHERE id=?').get(jobId));
     // OR directly invoke runStrategist+runDecomposer+runArchitectQALoop if runPipelineForJob doesn't exist

     const row = db.prepare('SELECT strategist_output, decomposer_output, architect_iter0, qa_iter0, architect_iter1, qa_iter1 FROM intent_jobs WHERE id=?').get(jobId) as any;
     expect(row.strategist_output).toContain('"goal":"G"');
     expect(row.decomposer_output).toContain('"tasks"');
     expect(row.architect_iter0).toContain('flow_data');
     expect(row.qa_iter0).toContain('"recommendation":"accept"');
     expect(row.architect_iter1).toBeNull();
     expect(row.qa_iter1).toBeNull();
   });
   ```

6. Si el test es muy invasivo (necesita demasiado setup del pipeline), reducirlo a probar `runArchitectQALoop` directamente con mocks y verificar las columnas architect_iter0/qa_iter0/architect_iter1/qa_iter1; el test del strategist/decomposer puede ser un test separado más simple que llama solo a la fase.

7. NO almacenar el raw LLM output parseado — guardar el string original de `callLLM` (preserva format issues, útil para Phase 135 que debug LLM output bruto).
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm test -- --run intent-job-executor.test 2>&amp;1 | tail -30</automated>
  </verify>
  <done>
- Las 6 columnas se escriben en los puntos correctos del pipeline
- Test verifica que tras un run con accept en iter0, las 4 primeras columnas tienen content y las 2 iter1 son null
- `npm run build` compila
- Sin regresiones en otros tests del executor
  </done>
</task>

</tasks>

<verification>
1. `cd app && npm test -- --run intent-job-executor.test` verde
2. `cd app && npm run build` compila
3. Grep: `grep -n "strategist_output\|architect_iter" app/src/lib/services/intent-job-executor.ts` devuelve los writes
4. Grep: `grep -n "addColumnIfMissing.*intent_jobs" app/src/lib/db.ts` devuelve las 6 llamadas
5. Al arrancar con DB existente (no nueva), el ALTER no rompe nada — idempotente
</verification>

<success_criteria>
- FOUND-06: tabla intent_jobs tiene 6 columnas TEXT intermedias ✓
- Los 6 outputs se escriben durante el pipeline ✓
- Migración idempotente al arranque ✓
- Test cubre el path happy (accept en iter0)
</success_criteria>

<output>
After completion, create `.planning/phases/133-foundation-tooling-found/133-04-SUMMARY.md` con:
- Columnas añadidas
- Puntos del executor donde se persiste
- Test añadido
</output>
