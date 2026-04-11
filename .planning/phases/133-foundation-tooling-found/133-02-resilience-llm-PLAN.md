---
phase: 133-foundation-tooling-found
plan: 02
type: execute
wave: 2
depends_on:
  - 133-01
files_modified:
  - app/src/lib/services/intent-job-executor.ts
  - app/src/lib/__tests__/intent-job-executor.test.ts
autonomous: true
requirements:
  - FOUND-04
  - FOUND-07
  - FOUND-10
must_haves:
  truths:
    - "Cualquier llamada a callLLM que tarde > 90s aborta y libera currentJobId"
    - "Cuando el QA loop agota iteraciones, flow_data del último intento del architect queda persistido en knowledge_gap.context"
    - "Cuando el QA loop agota iteraciones, el usuario recibe notifyProgress force=true con los top-2 issues por severity antes de markTerminal"
  artifacts:
    - path: "app/src/lib/services/intent-job-executor.ts"
      provides: "callLLM con AbortSignal.timeout(90_000); runArchitectQALoop con exhaustion enriquecida"
      contains: "AbortSignal.timeout"
    - path: "app/src/lib/__tests__/intent-job-executor.test.ts"
      provides: "Test timeout abort + test exhaustion persiste flow_data + notifyProgress force=true con top-2 issues"
  key_links:
    - from: "callLLM fetch"
      to: "AbortSignal.timeout(90_000)"
      via: "signal en options de fetch, try/catch libera currentJobId en abort"
      pattern: "AbortSignal\\.timeout"
    - from: "runArchitectQALoop exhaustion branch"
      to: "saveKnowledgeGap + notifyProgress(force=true)"
      via: "context incluye previousDesign.flow_data + top-2 issues por severity"
      pattern: "force.*true"
---

<objective>
Blindar el pipeline async contra 2 modos de fallo silenciosos: (a) callLLM que se cuelga indefinidamente sin timeout → job zombi ocupando `currentJobId`; (b) QA loop que agota iteraciones sin notificar al usuario ni dejar evidencia post-mortem del flow_data que falló.

Purpose: Sin timeout, un LiteLLM lento congela el único slot del executor y ningún otro job corre hasta reinicio. Sin notificación de exhaustion, el usuario ve "processing..." para siempre y Phase 134/135 no pueden iterar sobre lo que falló. Sin flow_data persistido en el knowledge_gap, el post-mortem de Phase 136 es imposible sin re-ejecutar.
Output: `intent-job-executor.ts` con timeouts de 90s en todas las llamadas `callLLM`, y una rama de exhaustion enriquecida que persiste flow_data + notifica top-2 issues.
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
@.planning/phases/133-foundation-tooling-found/133-01-baseline-knowledge-PLAN.md

@app/src/lib/services/intent-job-executor.ts
@app/src/lib/__tests__/intent-job-executor.test.ts

<interfaces>
<!-- Current signatures — implementer should patch in-place, not rewrite -->

From intent-job-executor.ts (existing state):
```ts
class IntentJobExecutor {
  private static currentJobId: string | null = null;
  private static MAX_QA_ITERATIONS = 2;
  private static lastNotifyAt = new Map<string, number>();

  private static async callLLM(systemPrompt: string, userInput: string): Promise<string>;
  private static async runArchitectQALoop(
    job: IntentJobRow, goal: unknown, tasks: unknown, resources: CanvasResources,
  ): Promise<ArchitectDesign | null>;
  private static notifyProgress(job: IntentJobRow, message: string, force?: boolean): void;
  private static markTerminal(jobId: string): void;
}
```

Current callLLM uses `fetch(url, { method, headers, body })` WITHOUT `signal`. Timeout is missing.

Current exhaustion branch in runArchitectQALoop:
```ts
saveKnowledgeGap({
  knowledgePath: 'catflow/design/quality',
  query: `Pipeline architect could not produce acceptable canvas for job ${job.id}...`,
  context: JSON.stringify({ job_id, goal, last_qa_report: previousQaReport }).slice(0, 4000),
});
updateIntentJob(job.id, { status: 'failed', error: ... });
this.markTerminal(job.id);
return null;
```
MISSING: `previousDesign.flow_data` en context, y `notifyProgress(job, msg, force=true)` con top-2 issues ANTES de markTerminal.

From types.ts (QaReport shape):
```ts
interface QaReport {
  recommendation: 'accept' | 'revise' | 'reject';
  quality_score?: number;
  issues?: Array<{ severity?: string; rule_id?: string; node_id?: string; description?: string }>;
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: FOUND-04 — Timeout de 90s en callLLM con AbortSignal, liberación de currentJobId en abort</name>
  <files>app/src/lib/services/intent-job-executor.ts, app/src/lib/__tests__/intent-job-executor.test.ts</files>
  <behavior>
- callLLM con fetch que tarda > 90s lanza un error identificable como timeout (AbortError o "The operation was aborted")
- El error de timeout se propaga hasta el catch de alto nivel del tick del executor, el cual marca el job como failed, limpia `currentJobId = null`, y notifica al usuario por canal original
- Tests unitarios mockean fetch con un abort manual (signal.addEventListener) para verificar que el error fluye correctamente sin esperar 90s reales
  </behavior>
  <action>
1. Modificar `callLLM` para añadir `signal: AbortSignal.timeout(90_000)` a las options de fetch:
   ```ts
   const res = await fetch(`${litellmUrl}/v1/chat/completions`, {
     method: 'POST',
     headers: { ... },
     body: JSON.stringify({ ... }),
     signal: AbortSignal.timeout(90_000),
   });
   ```
   - No capturar el AbortError dentro de callLLM — dejar que se propague al catch del tick.
   - Si `res.ok` es false, conservar el mensaje de error existente con el status (no regresión).

2. Verificar que el catch del método `tick()` (línea ~166 actual) que maneja errores del pipeline:
   - Llama `notifyProgress(job, ..., force=true)` con mensaje descriptivo del error
   - Llama `markTerminal(job.id)`
   - Asigna `this.currentJobId = null`
   Si alguna de estas tres cosas no pasa en la ruta de timeout, arreglarla. (Nota: el finally al final del tick ya pone `this.currentJobId = null`; confirmar que el finally corre incluso en AbortError.)

3. Mensaje del error: envolver el mensaje del AbortError con contexto tipo `"LiteLLM timeout (90s) en fase=${phase}"` para que el usuario y los logs sepan que fue timeout. Detectarlo vía `err instanceof Error && err.name === 'AbortError'`.

4. Añadir test a `intent-job-executor.test.ts`:
   ```ts
   it('callLLM aborts after 90s timeout, executor cleans up currentJobId', async () => {
     // Mock fetch to hang and abort when signal fires
     const fakeFetch = vi.fn(async (_url: string, init?: RequestInit) => {
       return new Promise((_, reject) => {
         init?.signal?.addEventListener('abort', () => {
           reject(new DOMException('aborted', 'AbortError'));
         });
         // Force-trigger abort immediately via a synthetic signal for the test
       });
     });
     // Replace global fetch, seed a synthetic AbortSignal with immediate abort
     // ... test that tick() ends with job.status='failed' and currentJobId === null
   });
   ```
   - Si reescribir el test real es demasiado invasivo, crear un test puro de la función `callLLM` exportada (si está privada, exportarla vía `__test__` symbol). El importante es probar: (a) AbortSignal se pasa a fetch, (b) el error propaga, (c) el finally limpia state.

5. NO tocar otras llamadas fetch en el fichero (por ejemplo notifyProgress → Telegram) — el scope es sólo `callLLM` del pipeline architect/strategist/decomposer/QA.
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm test -- --run intent-job-executor.test 2>&amp;1 | tail -30</automated>
  </verify>
  <done>
- `callLLM` incluye `signal: AbortSignal.timeout(90_000)` en fetch
- Timeout abort produce error que el tick captura; `currentJobId` queda null tras el finally
- Test unitario verifica el abort path sin esperar 90s reales
- `npm run build` dentro de app/ compila sin errores
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: FOUND-07 + FOUND-10 — Exhaustion enriquecida: flow_data en knowledge_gap.context + notifyProgress top-2 issues force=true</name>
  <files>app/src/lib/services/intent-job-executor.ts, app/src/lib/__tests__/intent-job-executor.test.ts</files>
  <behavior>
- Cuando `runArchitectQALoop` agota MAX_QA_ITERATIONS sin recibir 'accept':
  1. Persiste en `knowledge_gap.context` un JSON que incluye: `job_id`, `goal`, `last_qa_report`, Y **`last_flow_data: previousDesign?.flow_data ?? null`**
  2. ANTES de `markTerminal`, llama `notifyProgress(job, message, true)` donde message contiene los top-2 issues del último qa_report ordenados por severity (blocker > major > minor/other), cada uno formateado como `"[rule_id] description"` (primeros 120 chars)
  3. Luego llama `markTerminal(job.id)` como antes
- Test unitario: QA loop con 2 iteraciones que siempre devuelven 'revise' con issues mockeadas → verificar que `saveKnowledgeGap` recibe `last_flow_data` no-null, y que `notifyProgress` es llamado con `force=true` y el mensaje contiene los ids de las 2 issues top
  </behavior>
  <action>
1. Modificar la rama de exhaustion (líneas ~393-420 actuales) en `runArchitectQALoop`:

   ```ts
   // --- Loop exhausted: log knowledge gap + notify + mark failed ---
   logger.warn('intent-job-executor', 'QA loop exhausted without accept', { jobId: job.id });

   // FOUND-07: persist flow_data for post-mortem
   try {
     saveKnowledgeGap({
       knowledgePath: 'catflow/design/quality',
       query: `Pipeline architect could not produce acceptable canvas for job ${job.id} after ${this.MAX_QA_ITERATIONS} iterations`,
       context: JSON.stringify({
         job_id: job.id,
         goal,
         last_qa_report: previousQaReport,
         last_flow_data: previousDesign?.flow_data ?? null,
       }).slice(0, 8000), // bump from 4000 to fit flow_data
     });
   } catch (err) {
     logger.error('intent-job-executor', 'Failed to log knowledge gap after QA exhaustion', { error: String(err) });
   }

   // FOUND-10: notify user BEFORE markTerminal with top-2 issues by severity
   const top2 = this.extractTop2Issues(previousQaReport);
   const exhaustionMsg = top2.length > 0
     ? `❌ QA agotó iteraciones. Principales problemas:\n${top2.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}`
     : `❌ QA agotó iteraciones sin issues accionables.`;
   this.notifyProgress(job, exhaustionMsg, true); // force=true bypasses throttle

   const lastRecommendation = previousQaReport?.recommendation ? String(previousQaReport.recommendation) : 'unknown';
   updateIntentJob(job.id, {
     status: 'failed',
     error: `QA loop exhausted after ${this.MAX_QA_ITERATIONS} iterations; last recommendation=${lastRecommendation}`,
   });
   this.markTerminal(job.id);
   return null;
   ```

2. Añadir método privado `extractTop2Issues(qa: QaReport | null): string[]`:
   ```ts
   private static extractTop2Issues(qa: QaReport | null): string[] {
     if (!qa || !Array.isArray(qa.issues) || qa.issues.length === 0) return [];
     const rank = (sev?: string) => {
       const s = (sev ?? '').toLowerCase();
       if (s === 'blocker') return 0;
       if (s === 'major' || s === 'high') return 1;
       if (s === 'minor' || s === 'medium') return 2;
       return 3;
     };
     const sorted = [...qa.issues].sort((a, b) => rank(a.severity) - rank(b.severity));
     return sorted.slice(0, 2).map((i) => {
       const rid = i.rule_id ? `[${i.rule_id}] ` : '';
       const desc = (i.description ?? '').slice(0, 120);
       return `${rid}${desc}`.trim();
     }).filter((s) => s.length > 0);
   }
   ```

3. Añadir 2 tests a `intent-job-executor.test.ts`:
   - **Test A (exhaustion persiste flow_data):** mockear `runArchitectQALoop` execution: el mock de `callLLM` devuelve 2 veces una design con `flow_data: {nodes:[{id:'n1',type:'agent'}], edges:[]}` y el reviewer devuelve `{recommendation:'revise', issues:[{severity:'blocker', rule_id:'R10', description:'...'}]}`. Espiar `saveKnowledgeGap` y verificar que el último call contiene `last_flow_data` con nodes.
   - **Test B (exhaustion llama notifyProgress force=true con top-2 issues):** mismo setup pero con 3 issues en el último qa_report (blocker, major, minor). Espiar `notifyProgress` y verificar que: (a) es llamado al menos una vez con `force=true`, (b) el mensaje contiene el `rule_id` del blocker y el del major pero NO el del minor (orden por severity), (c) el orden relativo es notifyProgress → updateIntentJob({status:'failed'}) → markTerminal (verificable mockeando `markTerminal` con un spy que registra el orden).
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm test -- --run intent-job-executor.test 2>&amp;1 | tail -40</automated>
  </verify>
  <done>
- `runArchitectQALoop` exhaustion persiste `last_flow_data` en knowledge_gap.context
- `notifyProgress` es llamado con `force=true` y mensaje con top-2 issues antes de `markTerminal`
- Test A y Test B pasan
- `npm run build` compila
  </done>
</task>

</tasks>

<verification>
1. `cd app && npm test -- --run intent-job-executor.test` verde (incluyendo los 3 tests nuevos: timeout, exhaustion flow_data, exhaustion notifyProgress)
2. `cd app && npm run build` compila sin errores
3. Grep: `grep -n "AbortSignal.timeout" app/src/lib/services/intent-job-executor.ts` devuelve al menos 1 match
4. Grep: `grep -n "last_flow_data" app/src/lib/services/intent-job-executor.ts` devuelve match en la rama de exhaustion
</verification>

<success_criteria>
- FOUND-04: timeouts de 90s en callLLM + liberación de currentJobId en abort ✓
- FOUND-07: flow_data del último intento persistido en knowledge_gap.context en exhaustion ✓
- FOUND-10: notifyProgress(force=true) con top-2 issues antes de markTerminal ✓
- Sin regresiones en tests existentes del executor
</success_criteria>

<output>
After completion, create `.planning/phases/133-foundation-tooling-found/133-02-SUMMARY.md` con:
- Cambios a callLLM y runArchitectQALoop
- Nuevos tests añadidos
- Artefactos modificados
</output>
